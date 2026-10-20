import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { expandVenueCalendar, cleanCalendarTitle, nonFoodEvent } from "@/data/venue-calendar";
import { normVenue } from "@/data/posts";
import { readPublicLink, CALENDAR_FETCH_LIMITS } from "./safe-link-fetch.server";

type DB = SupabaseClient<Database>;

/**
 * Per-truck calendar sources (social_sources kind "calendar"): every event belongs to that truck.
 * Idempotent by calendar_uid = sourceId:uid; occurrences no longer in the feed are removed.
 * Events whose venue matches a saved, confirmed venue become real stops; the rest become
 * suggested stops flagged for an address check, so they surface in Pending trucks instead of
 * going public without coordinates.
 */
export async function syncTruckCalendars(db: DB, onlySourceIds?: string[]): Promise<{ synced: number; stops: number; review: number; errors: string[] }> {
  let q = db.from("social_sources").select("id,url,name,truck_id").eq("kind", "calendar").eq("active", true).not("truck_id", "is", null);
  if (onlySourceIds?.length) q = q.in("id", onlySourceIds);
  const { data: sources, error } = await q.limit(10);
  if (error) throw new Error(error.message);
  const { data: venues } = await db.from("venues").select("norm_name,name,address,city,lat,lng").eq("confirmed", true);
  const venueByName = new Map((venues ?? []).map((v) => [v.norm_name, v]));
  let synced = 0, stops = 0, review = 0;
  const errors: string[] = [];
  for (const s of sources ?? []) {
    try {
      const res = await readPublicLink(s.url, CALENDAR_FETCH_LIMITS, { Accept: "text/calendar" });
      if (!res.ok) throw new Error(`Calendar returned ${res.status}`);
      const events = expandVenueCalendar(res.text, "America/Chicago").filter((e) => e.start && e.end && Date.parse(e.end) > Date.parse(e.start) && !nonFoodEvent(e.title));
      const seen: string[] = [];
      let added = 0, pending = 0;
      for (const e of events) {
        const uid = `${s.id}:${e.uid}`;
        seen.push(uid);
        const venueName = cleanCalendarTitle(e.title).slice(0, 200) || s.name;
        const venue = venueByName.get(normVenue(venueName));
        if (venue) {
          const { data: existing } = await db.from("stops").select("id").eq("truck_id", s.truck_id!).eq("calendar_uid", uid).eq("calendar_occurrence", e.occurrence).limit(1);
          if (existing?.length) continue;
          const { error: ins } = await db.from("stops").insert({ truck_id: s.truck_id!, venue_name: venue.name, address: venue.address, city: venue.city, lat: venue.lat, lng: venue.lng,
            starts_at: new Date(e.start).toISOString(), ends_at: new Date(e.end).toISOString(), source: "calendar", source_url: s.url, calendar_uid: uid, calendar_occurrence: e.occurrence });
          if (!ins) added++;
        } else {
          const { data: dup } = await db.from("suggested_stops").select("id").eq("truck_id", s.truck_id!).eq("starts_at", new Date(e.start).toISOString()).eq("venue_name", venueName).limit(1);
          if (dup?.length) continue;
          const { error: ins } = await db.from("suggested_stops").insert({ truck_id: s.truck_id!, venue_name: venueName, address: "", city: "", starts_at: new Date(e.start).toISOString(), ends_at: new Date(e.end).toISOString(),
            source: "calendar", source_url: s.url, status: "pending", needs_address_check: true });
          if (!ins) pending++;
        }
      }
      // Remove future stops whose events left the feed (source-owned only).
      const { data: future } = await db.from("stops").select("id,calendar_uid").eq("truck_id", s.truck_id!).eq("source", "calendar").like("calendar_uid", `${s.id}:%`).gt("starts_at", new Date().toISOString());
      const stale = (future ?? []).filter((r) => !seen.includes(r.calendar_uid ?? "")).map((r) => r.id);
      if (stale.length) await db.from("stops").delete().in("id", stale);
      synced++;
      stops += added;
      review += pending;
      await db.from("social_sources").update({ last_run_at: new Date().toISOString(), last_status: "ok", last_reason: null, last_posts: events.length, last_stops: added }).eq("id", s.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${s.name}: ${msg.slice(0, 160)}`);
      await db.from("social_sources").update({ last_run_at: new Date().toISOString(), last_status: "error", last_reason: msg.slice(0, 300) }).eq("id", s.id);
    }
  }
  return { synced, stops, review, errors };
}
