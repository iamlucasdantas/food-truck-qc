import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { buildIcs, type Series } from "@/data/schedule";

/** Public "Add to my calendar" feed for a truck's schedule (same data the public map shows). */
export const Route = createFileRoute("/api/public/calendar/$id")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      GET: async ({ params }) => {
        const id = params.id.replace(/\.ics$/, "");
        const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
        const sb = createClient<Database>(process.env["SUPABASE_URL"]!, key, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { fetch: (input, init) => {
            const h = new Headers(init?.headers);
            if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
            h.set("apikey", key);
            return fetch(input, { ...init, headers: h });
          } },
        });
        const { data: truck } = await sb.from("trucks").select("name").eq("id", id).maybeSingle();
        if (!truck) return new Response("Not found", { status: 404 });
        const since = new Date(Date.now() - 864e5).toISOString();
        const [{ data: stops }, { data: series }] = await Promise.all([
          sb.from("stops").select("*").eq("truck_id", id).eq("cancelled", false).neq("source", "apify_maps").gt("ends_at", since).order("starts_at").limit(500),
          sb.from("stop_series").select("*").eq("truck_id", id),
        ]);
        return new Response(buildIcs(truck.name, stops ?? [], (series ?? []) as Series[]), {
          headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `inline; filename="${id}.ics"`, "Cache-Control": "public, max-age=300" },
        });
      },
    },
  },
});
