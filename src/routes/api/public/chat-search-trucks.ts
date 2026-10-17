import { createFileRoute } from "@tanstack/react-router";

// GET /api/public/chat-search-trucks — read-only, x-api-key required.
// Params: query, location|city, cuisine, dish|menu_item, open_now, near|address or lat+lng, radius_miles, days, limit.
export const Route = createFileRoute("/api/public/chat-search-trucks")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/lib/chat-agent.server")).preflight(),
      GET: async ({ request }) => {
        const h = await import("@/lib/chat-agent.server");
        if (!(await h.authorized(request))) return h.unauthorized();
        const { SearchQuery, runSearch } = await import("@/lib/api-search.server");
        const p = SearchQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams));
        if (!p.success) return h.json({ error: "invalid query" }, 400);
        const r = await runSearch(p.data, { days: 3, limit: 10 });
        if ("error" in r) return h.json({ error: r.error }, r.error === "address not found" ? 400 : 500);
        return h.json({
          origin: r.origin?.label || null, radius_miles: r.radius,
          trucks: r.hits.map(({ truck: t, stops, open_now, distance_miles, is_base_location }) => {
            const next = stops[0];
            return {
              truck_id: t.id, name: t.name, cuisine: t.category || null,
              city: next?.city || h.cityFromAddress(next?.address ?? t.base_address),
              open_now, distance_miles, is_base_location,
              current_or_next_stop: next ? { venue: next.venue_name, address: next.address, starts_at: h.chicago(next.starts_at), ends_at: h.chicago(next.ends_at) } : null,
              base_address: is_base_location ? t.base_address : null,
              menu_highlights: h.menuHighlights(t.menu_sections, t.menu),
              app_url: `https://app.foodtruckqc.com/truck/${t.id}`,
            };
          }),
        });
      },
    },
  },
});
