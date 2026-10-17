import { createFileRoute } from "@tanstack/react-router";

// GET /api/public/v1/stops — personal API key. Same filters as v1/trucks plus truck_id. Times are UTC ISO.
export const Route = createFileRoute("/api/public/v1/stops")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { apiKeyUserId, unauthorized } = await import("@/lib/api-key-auth.server");
        if (!(await apiKeyUserId(request))) return unauthorized();
        const { SearchQuery, runSearch } = await import("@/lib/api-search.server");
        const p = SearchQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams));
        if (!p.success) return Response.json({ error: "invalid query" }, { status: 400 });
        const r = await runSearch({ ...p.data, limit: 50 }, { days: 3, limit: 50 });
        if ("error" in r) return Response.json({ error: r.error }, { status: r.error === "location not found" ? 400 : 500 });
        const stops = r.hits.flatMap((hit) => hit.stops
          .filter((s) => !p.data.open_now || s.open_now)
          .map((s) => ({ truck_id: hit.truck.id, truck: hit.truck.name, venue: s.venue_name, address: s.address, city: s.city,
            starts_at: s.starts_at, ends_at: s.ends_at, open_now: s.open_now, distance_miles: hit.distance_miles })));
        if (!r.origin) stops.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
        return Response.json({ origin: r.origin?.label || null, radius_miles: r.radius, stops: stops.slice(0, p.data.limit ?? 100) });
      },
    },
  },
});
