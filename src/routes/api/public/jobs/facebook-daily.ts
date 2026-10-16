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
        const { data: open } = await supabaseAdmin.from("ingestion_runs").select("id").eq("source", "apify_facebook").eq("status", "running").limit(1);
        if (open?.length) return Response.json({ skipped: "already running" });
        const { startFacebookRun } = await import("@/lib/facebook.server");
        const run = await startFacebookRun(supabaseAdmin);
        return Response.json({ runId: run.id });
      },
    },
  },
});
