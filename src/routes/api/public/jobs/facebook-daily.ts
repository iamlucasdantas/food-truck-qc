import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { isSocialScanTime } from "@/data/social-schedule";
import { z } from "zod";

const Kind = z.enum(["daily", "every-two-hours", "continue"]);

/**
 * Scheduled social scans. Vercel Cron calls GET ?kind=… with `Authorization: Bearer $CRON_SECRET`
 * (see vercel.json); POST with a JSON body is kept for manual runs and the old schedule.
 */
async function runJob(kind: z.infer<typeof Kind>) {
        if (kind === "continue") {
          // Every few minutes: keep working on an open scan so it finishes even when Apify stops retrying its webhook.
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: open } = await supabaseAdmin.from("ingestion_runs").select("id").eq("source", "apify_facebook").eq("status", "running").order("started_at", { ascending: false }).limit(1);
          if (!open?.length) return Response.json({ idle: true });
          const { processFacebookRun } = await import("@/lib/facebook.server");
          return Response.json(await processFacebookRun(supabaseAdmin, open[0]!.id, 40_000));
        }
        const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "numeric", hourCycle: "h23" }).format(new Date()));
        if (kind === "daily" ? hour !== 6 : !isSocialScanTime(new Date())) return Response.json({ skipped: true });
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
        // context.dev website/directory sources and per-truck calendar links run in the same two-hour window; a failure never blocks the social scan.
        const { scanWebsiteSources } = await import("@/lib/context-dev.server");
        const websites = await scanWebsiteSources(supabaseAdmin, 4, 20_000).catch((e: unknown) => ({ scanned: 0, stops: 0, error: String(e) }));
        const { syncTruckCalendars } = await import("@/lib/truck-calendar.server");
        const calendars = await syncTruckCalendars(supabaseAdmin).catch((e: unknown) => ({ synced: 0, stops: 0, review: 0, errors: [String(e)] }));
        return Response.json(runId ? { runId, websites, calendars } : { skipped: "already running", websites, calendars });
}

export const Route = createFileRoute("/api/public/jobs/facebook-daily")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      GET: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        const kind = Kind.safeParse(new URL(request.url).searchParams.get("kind") ?? "every-two-hours");
        if (!kind.success) return new Response("Bad request", { status: 400 });
        return runJob(kind.data);
      },
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        const body = z.object({ kind: Kind }).strict().safeParse(await request.json().catch(() => null));
        if (!body.success) return new Response("Bad request", { status: 400 });
        return runJob(body.data.kind);
      },
    },
  },
});
