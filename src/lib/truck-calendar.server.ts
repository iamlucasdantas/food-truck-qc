import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { expandVenueCalendar, cleanCalendarTitle } from "@/data/venue-calendar";
import { readPublicLink, CALENDAR_FETCH_LIMITS } from "./safe-link-fetch.server";

type DB = SupabaseClient<Database>;

/**
 * Per-truck calendar sources (social_sources kind "calendar"): every event belongs to that truck.
 * Idempotent by external_uid = source:uid:occurrence; future stops no longer in the feed are removed.
 * Events without a usable time are skipped; stops land without coordinates so missing addresses
 * surface in Pending trucks instead of going public unverified.
 */
export async function syncTruckCalendars(db: DB, onlySourceIds?: string[]): Promise<{ synced: number; stops: number; errors: string[] }> {
  let q = db.from("social_sources").select("id,url,name,truck_id").eq("kind", "calendar").eq("active", true).not("truck_id", "is", null);
  if (onlySourceIds?.length) q = q.in("id", onlySourceIds);
  const { data: sources, error } = await q;
  if (error) throw new Error(error.message);
  let synced = 0, stops = 0;
  const errors: string[] = [];
  for (const s of sources ?? []) {
    try {
      const res = await readPublicLink(s.url, CALENDAR_FETCH_LIMITS, { Accept: "text/calendar" });
      if (!res.ok) throw new Error(`Calendar returned ${res.status}`);
      const events = expandVenueCalendar(res.text, "America/Chicago");
      const seen: string[] = [];
      const rows = events.filter((e) => e.start && e.end && Date.parse(e.end) > Date.parse(e.start)).map((e) => {
        const uid = `${s.id}:${e.uid}:${e.occurrence}`;
        seen.push(uid);
        return { truck_id: s.truck_id!, venue_name: cleanCalendarTitle(e.title).slice(0, 200) || s.name, address: null, city: null, lat: null, lng: null,
          starts_at: new Date(e.start).toISOString(), ends_at: new Date(e.end).toISOString(), source: "calendar", source_url: s.url, external_uid: uid, cancelled: false };
      });
      if (rows.length) {
        const { error: up } = await db.from("stops").upsert(rows, { onConflict: "external_uid", ignoreDuplicates: false });
        if (up) throw new Error(up.message);
      }
      await db.from("stops").delete().eq("truck_id", s.truck_id!).eq("source", "calendar").like("external_uid", `${s.id}:%`)
        .gt("starts_at", new Date().toISOString()).not("external_uid", "in", `(${seen.map((u) => `"${u.replace(/"/g, "")}"`).join(",") || "\"\""})`);
      synced++;
      stops += rows.length;
      await db.from("social_sources").update({ last_run_at: new Date().toISOString(), last_status: "ok", last_reason: null, last_posts: events.length, last_stops: rows.length }).eq("id", s.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${s.name}: ${msg.slice(0, 160)}`);
      await db.from("social_sources").update({ last_run_at: new Date().toISOString(), last_status: "error", last_reason: msg.slice(0, 300) }).eq("id", s.id);
    }
  }
  return { synced, stops, errors };
}
