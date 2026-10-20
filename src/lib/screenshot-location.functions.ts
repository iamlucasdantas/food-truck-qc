import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { trustedStopLocation } from "@/data/screenshot-location";
import { normVenue } from "@/data/posts";

const schema = z.object({ truckId: z.string().min(1).max(120), venue: z.string().trim().min(1).max(160), city: z.string().max(80), address: z.string().max(240), runId: z.string().regex(/^[a-zA-Z0-9]+\.[a-f0-9]{64}$/).max(180).optional() });

export const enrichScreenshotLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => schema.parse(input))
  .handler(async ({ data, context }) => {
    const [{ data: owns }, { data: admin }] = await Promise.all([
      context.supabase.rpc("owns_truck", { _truck_id: data.truckId }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
    ]);
    if (!owns && !admin) throw new Error("Only this truck's owner or an admin can look up stops.");
    const lookup = await import("./screenshot-location.server");
    const sign = async (id: string) => {
      const secret = process.env["LOVABLE_API_KEY"];
      if (!secret) throw new Error("Address lookup is not connected.");
      const enc = new TextEncoder();
      const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
      const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(JSON.stringify([context.userId, data.truckId, data.venue, id]))));
      return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
    };
    if (data.runId) {
      const [id, signature] = data.runId.split(".");
      if (!id || signature !== await sign(id)) throw new Error("This lookup does not belong to this truck and account.");
      return lookup.pollScreenshotVenue(id, data.venue);
    }
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    // Narrow privileged venue read after truck authorization; never return unrelated rows.
    const { data: saved } = await db.from("venues").select("name,address,city,lat,lng").eq("confirmed", true).ilike("name", data.venue.replace(/[%_]/g, "")).limit(3);
    const cached = (saved ?? []).map(v => ({ ...v, address: v.address ?? "", source: "Saved venue" })).find(v => trustedStopLocation(data.venue, v) && (!data.city || v.city.toLowerCase().includes(data.city.split(",")[0]?.trim().toLowerCase() || data.city.toLowerCase())));
    if (cached) return { location: cached };
    const result = await lookup.lookupScreenshotVenue(data);
    if (result.location) {
      const v = result.location;
      await db.from("venues").upsert({ name: v.name, norm_name: normVenue(v.name), address: v.address, city: v.city, lat: v.lat, lng: v.lng, confirmed: true, source: "places" }, { onConflict: "norm_name", ignoreDuplicates: true });
    }
    if (result.runId) return { ...result, runId: `${result.runId}.${await sign(result.runId)}` };
    return result;
  });