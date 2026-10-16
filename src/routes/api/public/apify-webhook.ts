import { createFileRoute } from "@tanstack/react-router";

/** Apify calls this when a Facebook scrape finishes. We trust only run IDs we started ourselves. */
export const Route = createFileRoute("/api/public/apify-webhook")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => null)) as { resource?: { id?: string } } | null;
        const apifyId = body?.resource?.id;
        if (!apifyId || !/^[A-Za-z0-9]{8,32}$/.test(apifyId)) return new Response("Bad request", { status: 400 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: runs } = await supabaseAdmin.from("ingestion_runs").select("id, meta").eq("source", "apify_facebook").eq("status", "running")
          .order("started_at", { ascending: false }).limit(10);
        const run = (runs ?? []).find((r) => Object.values(((r.meta ?? {}) as { runs?: Record<string, string> }).runs ?? {}).includes(apifyId));
        if (!run) return new Response("ok"); // unknown run — ignore
        const { processFacebookRun } = await import("@/lib/facebook.server");
        const out = await processFacebookRun(supabaseAdmin, run.id, 20_000);
        // Work left: ask Apify to retry later (it backs off); admin "Continue" also finishes it.
        return out.remaining > 0 ? new Response("more work", { status: 503 }) : Response.json(out);
      },
    },
  },
});
