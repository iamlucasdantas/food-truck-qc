import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseIcs, rruleToSeries } from "@/data/schedule";

async function safeUrl(raw: string) {
  const u = new URL(raw.trim().replace(/^webcals?:\/\//i, "https://"));
  if (u.protocol !== "https:") throw new Error("Use an https:// or webcal:// calendar link");
  const { validateLinkUrl } = await import("@/lib/safe-link-fetch.server");
  return validateLinkUrl(u.toString(), true).toString();
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
      const { readPublicLink, CALENDAR_FETCH_LIMITS } = await import("@/lib/safe-link-fetch.server");
      const res = await readPublicLink(await safeUrl(feed.url), CALENDAR_FETCH_LIMITS, { Accept: "text/calendar" });
      if (!res.ok) return { events: [], error: `Calendar link returned ${res.status}` };
      text = res.text;
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
    const url = await safeUrl(data.url);
    const { error } = await context.supabase.from("calendar_feeds")
      .upsert({ truck_id: data.truckId, kind: "ical", url, created_by: context.userId }, { onConflict: "truck_id,kind" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
