import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/** Daily 6am Central: fires at 11:00 and 12:00 UTC; only the one that is 6am in Chicago runs (DST-safe). */
export const Route = createFileRoute("/api/public/jobs/facebook-daily")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "numeric", hourCycle: "h23" }).format(new Date()));
        if (hour !== 6) return Response.json({ skipped: true });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: open } = await supabaseAdmin.from("ingestion_runs").select("id").eq("source", "apify_facebook").eq("status", "running").limit(1);
        if (open?.length) return Response.json({ skipped: "already running" });
        const { startFacebookRun } = await import("@/lib/facebook.server");
        const run = await startFacebookRun(supabaseAdmin);
        return Response.json({ runId: run.id });
      },
    },
  },
});
