import { createFileRoute } from "@tanstack/react-router";

// GET /api/public/v1/trucks — personal API key (Bearer ftqc_…).
// Params: query, location|city, cuisine, dish|menu_item, open_now, near|address or lat+lng, radius_miles, days, limit.
export const Route = createFileRoute("/api/public/v1/trucks")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { apiKeyUserId, unauthorized } = await import("@/lib/api-key-auth.server");
        if (!(await apiKeyUserId(request))) return unauthorized();
        const { SearchQuery, runSearch } = await import("@/lib/api-search.server");
        const p = SearchQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams));
        if (!p.success) return Response.json({ error: "invalid query" }, { status: 400 });
        const r = await runSearch(p.data, { days: 3, limit: 20 });
        if ("error" in r) return Response.json({ error: r.error }, { status: r.error === "location not found" ? 400 : 500 });
        return Response.json({
          origin: r.origin?.label || null, radius_miles: r.radius,
          trucks: r.hits.map(({ truck: t, stops, open_now, distance_miles, is_base_location }) => ({
            id: t.id, name: t.name, business: t.business_name || null, cuisine: t.category || null, type: t.truck_type || null,
            website: t.website ?? null, open_now, distance_miles, is_base_location,
            base_address: is_base_location ? t.base_address : null,
            next_stop: stops[0] ? { venue: stops[0].venue_name, address: stops[0].address, starts_at: stops[0].starts_at, ends_at: stops[0].ends_at } : null,
          })),
        });
      },
    },
  },
});
