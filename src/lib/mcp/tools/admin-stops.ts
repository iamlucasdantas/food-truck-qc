import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { centralToUtc, chicagoDate } from "@/data/trucks";
const fmtCentral = (iso: string) => new Date(iso).toLocaleString("en-US", { timeZone: "America/Chicago", dateStyle: "medium", timeStyle: "short" });
import { adminClient, json } from "../admin";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("YYYY-MM-DD (Central time).");
const time = z.string().regex(/^\d{2}:\d{2}$/).describe("HH:MM 24h, Central time.");
const STOP = "id,truck_id,venue_name,address,city,starts_at,ends_at,note,cancelled,source";
const toJson = (s: { id: string; truck_id: string; venue_name: string; address: string | null; city: string; starts_at: string; ends_at: string; note: string | null; cancelled: boolean; source: string }) =>
  ({ ...s, starts_central: fmtCentral(s.starts_at), ends_central: fmtCentral(s.ends_at) });

export const adminListStops = defineTool({
  name: "admin_list_stops",
  title: "Admin: list a truck's stops",
  description: "Admin only. Dated stops of one truck from a date (default today, Central time).",
  inputSchema: { truck_id: z.string().min(1).max(150), from: date.optional() },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async ({ truck_id, from }, ctx) => {
    const sb = await adminClient(ctx);
    const { data, error } = await sb.from("stops").select(STOP).eq("truck_id", truck_id)
      .gte("ends_at", centralToUtc(from ?? chicagoDate(), "00:00").toISOString()).order("starts_at").limit(100);
    if (error) throw new ToolError(error.message);
    const stops = (data ?? []).map(toJson);
    return json(JSON.stringify(stops), { stops });
  },
});

export const adminSaveStop = defineTool({
  name: "admin_save_stop",
  title: "Admin: create or edit a stop",
  description: "Admin only. Without id adds a dated stop to a truck; with id edits it (send date+start+end together to move it). The address is geocoded to a map pin.",
  inputSchema: {
    id: z.string().uuid().optional().describe("Stop id to edit; omit to create."),
    truck_id: z.string().min(1).max(150).optional().describe("Required to create."),
    venue_name: z.string().min(1).max(150).optional(),
    address: z.string().min(3).max(300).optional(),
    date: date.optional(), start: time.optional(), end: time.optional(),
    note: z.string().max(500).nullable().optional(),
    cancelled: z.boolean().optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  handler: async (a, ctx) => {
    const sb = await adminClient(ctx);
    const patch: Record<string, unknown> = {};
    if (a.venue_name !== undefined) patch["venue_name"] = a.venue_name;
    if (a.note !== undefined) patch["note"] = a.note;
    if (a.cancelled !== undefined) patch["cancelled"] = a.cancelled;
    if (a.address) {
      const { geocodeAddress } = await import('@/lib/geocode.server');
      const g = await geocodeAddress(a.address).catch((e: unknown) => { throw new ToolError(e instanceof Error ? e.message : 'Address lookup failed'); });
      Object.assign(patch, { address: a.address, lat: g.lat, lng: g.lng, city: g.city || "Quad Cities" });
    }
    if (a.date || a.start || a.end) {
      if (!(a.date && a.start && a.end)) throw new ToolError("Send date, start and end together.");
      const s = centralToUtc(a.date, a.start), e = centralToUtc(a.date, a.end);
      if (e <= s) throw new ToolError("end must be after start.");
      Object.assign(patch, { starts_at: s.toISOString(), ends_at: e.toISOString() });
    }
    let row;
    if (a.id) {
      const { data, error } = await sb.from("stops").update(patch as never).eq("id", a.id).select(STOP);
      if (error) throw new ToolError(error.message);
      if (!data?.length) throw new ToolError("Stop not found.");
      row = data[0];
      if (!row) throw new ToolError("Stop not found.");
    } else {
      if (!a.truck_id || !a.venue_name || !a.address || !patch["starts_at"]) throw new ToolError("To create: truck_id, venue_name, address, date, start, end.");
      const { data, error } = await sb.from("stops").insert({ ...patch, truck_id: a.truck_id, source: "owner", confidence: 1 } as never).select(STOP).single();
      if (error) throw new ToolError(error.message);
      row = data;
    }
    return json(`${a.id ? "Updated" : "Added"} stop ${row.venue_name} ${fmtCentral(row.starts_at)}.`, { stop: toJson(row) });
  },
});

export const adminDeleteStop = defineTool({
  name: "admin_delete_stop",
  title: "Admin: delete a stop",
  description: "Admin only. Permanently delete one dated stop.",
  inputSchema: { id: z.string().uuid() },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ id }, ctx) => {
    const sb = await adminClient(ctx);
    const { data, error } = await sb.from("stops").delete().eq("id", id).select("venue_name");
    if (error) throw new ToolError(error.message);
    if (!data?.length) throw new ToolError("Stop not found.");
    return json(`Deleted stop ${data[0]?.venue_name ?? ""}.`, { deleted: true });
  },
});
