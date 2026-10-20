import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Admin-only: read website / directory sources now with context.dev (same rules as the scheduled scan). */
export const runWebsiteScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: admin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!admin) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { scanWebsiteSources } = await import("./context-dev.server");
    const r = await scanWebsiteSources(supabaseAdmin);
    return { scanned: r.scanned, stops: r.stops, error: r.error ?? null };
  });
