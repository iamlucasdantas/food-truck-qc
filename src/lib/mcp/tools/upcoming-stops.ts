import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

const fmt = (iso: string) => new Date(iso).toLocaleString("en-US", { timeZone: "America/Chicago", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default defineTool({
  name: "upcoming_stops",
  title: "Upcoming truck stops",
  description: "List where food trucks will be (or are now) over the next days, optionally for one truck or city. Times are Central.",
  inputSchema: {
    truck_id: z.string().uuid().optional().describe("Only this truck (id from search_trucks)."),
    city: z.string().max(60).optional().describe("Only stops in this city, e.g. 'Davenport'."),
    days: z.number().int().min(1).max(14).optional().describe("How many days ahead (default 3)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ truck_id, city, days }, ctx) => {
    const sb = supabaseForUser(ctx);
    const now = new Date();
    const until = new Date(now.getTime() + (days ?? 3) * 86400_000);
    let q = sb.from("stops").select("truck_id, venue_name, address, city, starts_at, ends_at, trucks(name)")
      .eq("cancelled", false).gte("ends_at", now.toISOString()).lte("starts_at", until.toISOString())
      .order("starts_at").limit(100);
    if (truck_id) q = q.eq("truck_id", truck_id);
    if (city?.trim()) q = q.ilike("city", city.trim());
    const { data, error } = await q;
    if (error) throw new ToolError(error.message);
    const stops = (data ?? []).map((s) => ({
      truck_id: s.truck_id, truck: s.trucks?.name ?? null, venue: s.venue_name, address: s.address ?? null,
      city: s.city ?? null, starts_at: s.starts_at, ends_at: s.ends_at,
      open_now: new Date(s.starts_at) <= now && new Date(s.ends_at) > now,
    }));
    const text = stops.length
      ? stops.map((s) => `${s.truck ?? s.truck_id} — ${s.venue}${s.city ? `, ${s.city}` : ""} · ${fmt(s.starts_at)}–${fmt(s.ends_at)}${s.open_now ? " (open now)" : ""}`).join("\n")
      : "No upcoming stops found.";
    return { content: [{ type: "text", text }], structuredContent: { stops } };
  },
});
