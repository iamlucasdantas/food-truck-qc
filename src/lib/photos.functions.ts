import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Public: signed links only for photos listed for this truck (files are not directly readable). */
export const signTruckPhotos = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ truckId: z.string().min(1).max(120) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin.from("truck_photos").select("id, path, position, is_cover").eq("truck_id", data.truckId).order("position");
    const safe = (rows ?? []).filter((r) => r.path.startsWith(`${data.truckId}/`));
    if (!safe.length) return [];
    const { data: signed } = await supabaseAdmin.storage.from("truck-photos").createSignedUrls(safe.map((r) => r.path), 60 * 60);
    const byPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
    return safe.map((r) => ({ ...r, url: byPath.get(r.path) ?? "" })).filter((r) => r.url);
  });
