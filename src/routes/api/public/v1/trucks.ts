import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

// GET /api/public/v1/trucks?query=tacos&limit=20
// Personal-API-key access to the same truck search the MCP server exposes.
export const Route = createFileRoute("/api/public/v1/trucks")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { apiKeyUserId, unauthorized } = await import("@/lib/api-key-auth.server");
        const userId = await apiKeyUserId(request);
        if (!userId) return unauthorized();

        const url = new URL(request.url);
        const query = (url.searchParams.get("query") ?? "").slice(0, 100);
        const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 20, 1), 50);

        const sb = createClient<Database>(
          process.env["SUPABASE_URL"]!,
          process.env["SUPABASE_PUBLISHABLE_KEY"]!,
          { auth: { persistSession: false, autoRefreshToken: false } },
        );
        let q = sb
          .from("trucks")
          .select("id, name, business_name, category, description, truck_type, website")
          .eq("status", "active")
          .is("deleted_at", null)
          .order("name")
          .limit(limit);
        const term = query.trim().replace(/[%,()]/g, " ");
        if (term) q = q.or(`name.ilike.%${term}%,category.ilike.%${term}%,menu_search.ilike.%${term}%,description.ilike.%${term}%`);
        const { data, error } = await q;
        if (error) return Response.json({ error: error.message }, { status: 500 });

        const trucks = (data ?? []).map((t) => ({
          id: t.id,
          name: t.name,
          business: t.business_name ?? null,
          cuisine: t.category ?? null,
          type: t.truck_type ?? null,
          website: t.website ?? null,
        }));
        return Response.json({ trucks });
      },
    },
  },
});
