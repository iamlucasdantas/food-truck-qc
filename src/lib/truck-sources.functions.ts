import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { truckSourceUrl, type TruckSourceKind } from "@/data/truck-sources";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const KINDS: TruckSourceKind[] = ["page", "instagram", "website", "calendar", "gmaps"];

async function requireAdmin(supabase: SupabaseClient<Database>, userId: string) {
  const { data: admin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!admin) throw new Error("Forbidden");
}

/** Admin: list the scan sources attached to one truck. */
export const listTruckSources = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ truckId: z.string().min(1).max(150) }).parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await db.from("social_sources").select("id,kind,url,name,active,last_status,last_run_at,last_stops")
      .eq("truck_id", data.truckId).order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/** Admin: attach a source (Facebook, Instagram, website, calendar, Google Maps) to a truck. */
export const addTruckSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ truckId: z.string().min(1).max(150), kind: z.enum(KINDS as [TruckSourceKind, ...TruckSourceKind[]]), url: z.string().trim().min(3).max(1000) }).parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const url = truckSourceUrl(data.url, data.kind);
    if (!url) {
      const hint = data.kind === "calendar" ? "Calendar links must be Google, Outlook or iCloud."
        : data.kind === "gmaps" ? "Paste a Google Maps link (maps.app.goo.gl or google.com/maps/…)."
        : data.kind === "page" ? "Facebook group links stay in the global sources; add the truck's page instead."
        : "That link isn't valid for this source type.";
      throw new Error(hint);
    }
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: t } = await db.from("trucks").select("id,name").eq("id", data.truckId).maybeSingle();
    if (!t) throw new Error("Truck not found");
    const { error } = await db.from("social_sources").upsert({ kind: data.kind, url, name: t.name, truck_id: t.id, active: true }, { onConflict: "url" });
    if (error) throw new Error(error.message);
    return { ok: true as const, url };
  });

/** Admin: detach a source from a truck (the link itself stays if other trucks use it). */
export const removeTruckSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ truckId: z.string().min(1).max(150), sourceId: z.string().min(1).max(150) }).parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { error } = await db.from("social_sources").delete().eq("id", data.sourceId).eq("truck_id", data.truckId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
