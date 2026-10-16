import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseIcs, rruleToSeries } from "@/data/schedule";

function safeUrl(raw: string) {
  const u = new URL(raw.trim().replace(/^webcals?:\/\//i, "https://"));
  if (u.protocol !== "https:") throw new Error("Use an https:// or webcal:// calendar link");
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[)/i.test(u.hostname) || u.hostname.endsWith(".internal")) throw new Error("That link isn't allowed");
  return u.toString();
}

/** Upcoming events from the owner's connected calendar feed. Read-only; nothing is saved here. */
export const listFeedEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { truckId: string }) => ({ truckId: String(d.truckId) }))
  .handler(async ({ data, context }) => {
    const { data: feed } = await context.supabase.from("calendar_feeds").select("url").eq("truck_id", data.truckId).maybeSingle();
    if (!feed) return { events: [], error: "No calendar connected" };
    let text: string;
    try {
      const res = await fetch(safeUrl(feed.url), { headers: { Accept: "text/calendar" }, redirect: "follow" });
      if (!res.ok) return { events: [], error: `Calendar link returned ${res.status}` };
      text = (await res.text()).slice(0, 3_000_000);
    } catch (e) {
      return { events: [], error: e instanceof Error ? e.message : "Couldn't read the calendar" };
    }
    const now = Date.now(), horizon = now + 90 * 864e5;
    const events = parseIcs(text)
      .map((e) => ({ ...e, recurrence: e.rrule ? rruleToSeries(e.rrule, e.start) : null }))
      .filter((e) => e.recurrence ? !e.recurrence.end_date || e.recurrence.end_date >= new Date(now).toISOString().slice(0, 10) : e.end.getTime() > now && e.start.getTime() < horizon)
      .sort((a, b) => a.start.getTime() - b.start.getTime())
      .slice(0, 100)
      .map((e) => ({ uid: e.uid, title: e.title, start: e.start.toISOString(), end: e.end.toISOString(), allDay: e.allDay, location: e.location, recurrence: e.recurrence }));
    return { events, error: null as string | null };
  });

export const saveFeedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { truckId: string; url: string }) => ({ truckId: String(d.truckId), url: String(d.url) }))
  .handler(async ({ data, context }) => {
    const url = safeUrl(data.url);
    const { error } = await context.supabase.from("calendar_feeds")
      .upsert({ truck_id: data.truckId, kind: "ical", url, created_by: context.userId }, { onConflict: "truck_id,kind" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
