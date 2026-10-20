import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { isSocialScanTime } from "@/data/social-schedule";
import { z } from "zod";

/** Stable managed callback; accept the old contract until the schedule is replaced. */
export const Route = createFileRoute("/api/public/jobs/facebook-daily")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        const body = z.object({ kind: z.enum(["daily", "every-two-hours"]) }).strict().safeParse(await request.json().catch(() => null));
        if (!body.success) return new Response("Bad request", { status: 400 });
        const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "numeric", hourCycle: "h23" }).format(new Date()));
        if (body.data.kind === "daily" ? hour !== 6 : !isSocialScanTime(new Date())) return Response.json({ skipped: true });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        // A run stuck "running" (webhook lost, processing crashed) would block every future scan — expire it after 2h.
        const staleBefore = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
        await supabaseAdmin.from("ingestion_runs").update({ status: "failed", finished_at: new Date().toISOString(), error: "Run expired: still running after 2 hours; marked failed so the next scheduled scan can start." })
          .eq("source", "apify_facebook").eq("status", "running").lt("started_at", staleBefore);
        const { data: open } = await supabaseAdmin.from("ingestion_runs").select("id").eq("source", "apify_facebook").eq("status", "running").limit(1);
        let runId: string | null = null;
        if (!open?.length) {
          const { startFacebookRun } = await import("@/lib/facebook.server");
          runId = (await startFacebookRun(supabaseAdmin)).id;
        }
        // context.dev website/directory sources run in the same two-hour window; a failure never blocks the social scan.
        const { scanWebsiteSources } = await import("@/lib/context-dev.server");
        const websites = await scanWebsiteSources(supabaseAdmin, 4, 20_000).catch((e: unknown) => ({ scanned: 0, stops: 0, error: String(e) }));
        return Response.json(runId ? { runId, websites } : { skipped: "already running", websites });
      },
    },
  },
});
