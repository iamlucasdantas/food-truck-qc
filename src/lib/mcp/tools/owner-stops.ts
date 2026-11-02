// Owner tools: schedule stops and go live. Same rows and limits as the Schedule card and the
// “I'm here” button on the owner dashboard, run as the caller so RLS keeps them to their own truck.
import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { checkInEnd, pickMyTruck, publicTruckUrl, statusLine, stopWindow, weekdayOf } from "@/data/owner-tools";
import { fmtCentral } from "@/data/trucks";
import { describeRule } from "@/data/schedule";
import { geocodeOrFail, myTrucks, ownerClient, reply } from "../owner";

const truckIdArg = z.string().max(150).optional().describe("From my_truck; optional when the owner has one truck.");
const pendingNote = (status: string) => (status === "pending" ? " Note: the truck is still pending review, so this shows publicly once it's approved." : "");

export const addMyStop = defineTool({
  name: "add_my_stop",
  title: "Add a stop to my schedule",
  description: "Add where the signed-in owner's truck will be: a dated stop (date, start, end in Central time, venue and/or street address) or a weekly repeating stop. Shows on the public map and the truck page. Ask for the address if the owner only gave a venue name you can't place.",
  inputSchema: {
    truck_id: truckIdArg,
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("YYYY-MM-DD, Central time. For a weekly stop: the first date."),
    start: z.string().regex(/^\d{1,2}:\d{2}$/).describe("HH:MM 24h Central, e.g. 11:00."),
    end: z.string().regex(/^\d{1,2}:\d{2}$/).describe("HH:MM 24h Central, e.g. 14:00 (an end before the start means past midnight)."),
    address: z.string().min(3).max(300).describe("Street address with city, e.g. \"2500 53rd St, Moline, IL\"."),
    venue_name: z.string().max(150).optional().describe("Place name shown to customers, e.g. \"Marketplace at 2500\"; defaults to the address."),
    note: z.string().max(500).optional().describe("Short public note, e.g. \"Cash only today\"."),
    repeat_weekly: z.boolean().default(false).describe("true = every week on the same weekday(s) until cancelled."),
    weekdays: z.array(z.number().int().min(0).max(6)).optional().describe("With repeat_weekly: 0=Sun … 6=Sat; defaults to the weekday of date."),
    until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("With repeat_weekly: last date (YYYY-MM-DD), optional."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  handler: async (a, ctx) => {
    const { sb, uid } = ownerClient(ctx);
    const picked = pickMyTruck(await myTrucks(sb, uid), a.truck_id);
    if (!picked.ok) throw new ToolError(picked.error);
    const t = picked.truck;
    const win = stopWindow(a.date, a.start, a.end);
    if (!win.ok) throw new ToolError(win.error);
    const g = await geocodeOrFail(a.address);
    const place = { venue_name: a.venue_name?.trim() || a.address, address: a.address, city: g.city || "Quad Cities", lat: g.lat, lng: g.lng, note: a.note ?? null };
    if (a.repeat_weekly) {
      const weekdays = a.weekdays?.length ? [...new Set(a.weekdays)].sort() : [weekdayOf(a.date)];
      const rule = { ...place, truck_id: t.id, freq: "weekly", weekdays, month_nth: null, start_date: a.date, end_date: a.until ?? null, start_time: a.start.padStart(5, "0"), end_time: a.end.padStart(5, "0") };
      const { data, error } = await sb.from("stop_series").insert(rule).select("id").single();
      if (error) throw new ToolError(error.message);
      const when = describeRule({ freq: "weekly", weekdays, month_nth: null, end_date: a.until ?? null });
      return reply(`Added a repeating stop for ${t.name}: ${place.venue_name}, ${when}, ${rule.start_time}–${rule.end_time} Central, starting ${a.date}.${pendingNote(t.status)} ${publicTruckUrl(t.id)}`, { series_id: data.id, ...rule });
    }
    const { data, error } = await sb.from("stops").insert({ ...place, truck_id: t.id, starts_at: win.starts_at, ends_at: win.ends_at, source: "owner", confidence: 1 }).select("id,starts_at,ends_at").single();
    if (error) throw new ToolError(error.message);
    return reply(`Added a stop for ${t.name}: ${place.venue_name}, ${fmtCentral(data.starts_at)} – ${fmtCentral(data.ends_at)} Central.${pendingNote(t.status)} ${publicTruckUrl(t.id)}`, { stop_id: data.id, ...place, starts_at: data.starts_at, ends_at: data.ends_at });
  },
});

export const checkIn = defineTool({
  name: "check_in",
  title: "I'm here (go live)",
  description: "Mark the signed-in owner's truck as open right now at a place — the same as the big “I'm here” button. Give a street address (or lat/lng); with no location the truck's home base is used. Lasts 2 hours by default, 15 min to 12 h, or until a Central time. Replaces any earlier live check-in.",
  inputSchema: {
    truck_id: truckIdArg,
    address: z.string().min(3).max(300).optional().describe("Where the truck is parked, e.g. \"1601 River Dr, Moline, IL\"."),
    lat: z.number().min(-90).max(90).optional(), lng: z.number().min(-180).max(180).optional(),
    venue_name: z.string().max(150).optional().describe("Label customers see, e.g. \"Bass Street Landing\"; defaults to \"Live location\"."),
    minutes: z.number().int().min(15).max(720).optional().describe("How long you'll be there (default 120)."),
    until: z.string().regex(/^\d{1,2}:\d{2}$/).optional().describe("Or an end time HH:MM Central."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  handler: async (a, ctx) => {
    const { sb, uid } = ownerClient(ctx);
    const picked = pickMyTruck(await myTrucks(sb, uid), a.truck_id);
    if (!picked.ok) throw new ToolError(picked.error);
    const t = picked.truck;
    const end = checkInEnd({ minutes: a.minutes, until: a.until });
    if (!end.ok) throw new ToolError(end.error);
    let pos: { lat: number; lng: number; city: string }, address: string | null = a.address ?? null;
    if (a.address) { const g = await geocodeOrFail(a.address); pos = { lat: g.lat, lng: g.lng, city: g.city || "Quad Cities" }; }
    else if (a.lat !== undefined && a.lng !== undefined) pos = { lat: a.lat, lng: a.lng, city: "Quad Cities" };
    else if (t.base_lat !== null && t.base_lng !== null) { pos = { lat: t.base_lat, lng: t.base_lng, city: "Quad Cities" }; address = t.base_address; }
    else throw new ToolError("Where is the truck right now? Give a street address (or lat/lng).");
    const start = new Date();
    await sb.from("stops").update({ cancelled: true }).eq("truck_id", t.id).eq("is_live", true).eq("cancelled", false);
    const { data, error } = await sb.from("stops").insert({
      truck_id: t.id, venue_name: a.venue_name?.trim() || "Live location", address, city: pos.city, lat: pos.lat, lng: pos.lng,
      starts_at: start.toISOString(), ends_at: end.end.toISOString(), source: "owner", confidence: 1, is_live: true,
    }).select("id").single();
    if (error) throw new ToolError(error.message);
    return reply(`${t.name} is live at ${a.venue_name?.trim() || address || "its home base"} until ${fmtCentral(end.end)} Central.${pendingNote(t.status)} ${publicTruckUrl(t.id)}`, { stop_id: data.id, truck_id: t.id, ends_at: end.end.toISOString(), status: t.status, status_text: statusLine(t.status) });
  },
});

export const checkOut = defineTool({
  name: "check_out",
  title: "End my live check-in",
  description: "End the signed-in owner's current “I'm here” check-in now (the truck stops showing as open). Does nothing if the truck isn't live.",
  inputSchema: { truck_id: truckIdArg },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async (a, ctx) => {
    const { sb, uid } = ownerClient(ctx);
    const picked = pickMyTruck(await myTrucks(sb, uid), a.truck_id);
    if (!picked.ok) throw new ToolError(picked.error);
    const t = picked.truck, now = new Date().toISOString();
    const { data: live } = await sb.from("stops").select("id,venue_name,starts_at").eq("truck_id", t.id).eq("is_live", true).eq("cancelled", false).lte("starts_at", now).gt("ends_at", now).order("starts_at", { ascending: false }).limit(1).maybeSingle();
    if (!live) return reply(`${t.name} isn't live right now.`, { ended: false });
    const { error } = await sb.from("stops").update({ ends_at: now, is_live: true }).eq("id", live.id);
    if (error) { const { error: e2 } = await sb.from("stops").update({ cancelled: true }).eq("id", live.id); if (e2) throw new ToolError(e2.message); }
    return reply(`Checked out — ${t.name} is no longer shown as open at ${live.venue_name}.`, { ended: true, stop_id: live.id });
  },
});
