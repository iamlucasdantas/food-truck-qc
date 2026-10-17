import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Q = z.object({
  query: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(25).optional(),
});

// GET /api/public/chat-search-trucks?query=tacos&limit=10 — read-only, x-api-key required.
export const Route = createFileRoute("/api/public/chat-search-trucks")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/lib/chat-agent.server")).preflight(),
      GET: async ({ request }) => {
        const h = await import("@/lib/chat-agent.server");
        if (!(await h.authorized(request))) return h.unauthorized();
        const url = new URL(request.url);
        const p = Q.safeParse(Object.fromEntries(url.searchParams));
        if (!p.success) return h.json({ error: "invalid query" }, 400);
        const limit = p.data.limit ?? 10;

        let q = h.publicClient().from("trucks")
          .select("id, name, category, base_address, menu_sections, menu")
          .eq("status", "active").is("deleted_at", null).order("name").limit(limit);
        const term = (p.data.query ?? "").trim().replace(/[%,()*]/g, " ").trim();
        if (term) q = q.or(`name.ilike.%${term}%,category.ilike.%${term}%,menu_search.ilike.%${term}%`);
        const { data, error } = await q;
        if (error) return h.json({ error: "lookup failed" }, 500);

        const ids = (data ?? []).map((t) => t.id);
        const cityById = new Map<string, string>();
        if (ids.length) {
          const { data: st } = await h.publicClient().from("stops").select("truck_id, city")
            .in("truck_id", ids).eq("cancelled", false).neq("city", "").order("starts_at", { ascending: false }).limit(200);
          for (const s of st ?? []) if (!cityById.has(s.truck_id)) cityById.set(s.truck_id, s.city);
        }

        return h.json({
          trucks: (data ?? []).map((t) => ({
            truck_id: t.id,
            name: t.name,
            cuisine: t.category || null,
            city: h.cityFromAddress(t.base_address) ?? cityById.get(t.id) ?? null,
            menu_highlights: h.menuHighlights(t.menu_sections, t.menu),
            app_url: `https://app.foodtruckqc.com/truck/${t.id}`,
          })),
        });
      },
    },
  },
});
