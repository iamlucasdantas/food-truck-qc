import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

/** Admin-only: start a Facebook update (one Apify job for pages, one for groups). */
export const startFacebookUpdate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { startFacebookRun } = await import("./facebook.server");
    const run = await startFacebookRun(context.supabase);
    return { runId: run.id as string, total: run.cities_total.length as number };
  });

/** Admin-only: process the next batch of posts for a run (resumes only unfinished sources). */
export const continueFacebookUpdate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { runId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { processFacebookRun } = await import("./facebook.server");
    return processFacebookRun(context.supabase, data.runId, 25_000);
  });
