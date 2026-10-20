import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { trustedStopLocation } from "@/data/screenshot-location";

const schema = z.object({ truckId: z.string().min(1).max(120), venue: z.string().trim().min(1).max(160), city: z.string().max(80), address: z.string().max(240), runId: z.string().regex(/^[a-zA-Z0-9]+$/).max(100).optional() });

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
    if (data.runId) return lookup.pollScreenshotVenue(data.runId, data.venue);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    // Narrow privileged venue read after truck authorization; never return unrelated rows.
    const { data: saved } = await db.from("venues").select("name,address,city,lat,lng").eq("confirmed", true).ilike("name", data.venue.replace(/[%_]/g, "")).limit(3);
    const cached = (saved ?? []).map(v => ({ ...v, address: v.address ?? "", source: "Saved venue" })).find(v => trustedStopLocation(data.venue, v) && (!data.city || v.city.toLowerCase().includes(data.city.split(",")[0]?.trim().toLowerCase() || data.city.toLowerCase())));
    if (cached) return { location: cached };
    return lookup.lookupScreenshotVenue(data);
  });