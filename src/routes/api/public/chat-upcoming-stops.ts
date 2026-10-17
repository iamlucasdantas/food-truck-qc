import { createFileRoute } from "@tanstack/react-router";

// GET /api/public/chat-upcoming-stops — read-only, x-api-key required. Same filters as chat-search-trucks plus truck_id.
export const Route = createFileRoute("/api/public/chat-upcoming-stops")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/lib/chat-agent.server")).preflight(),
      GET: async ({ request }) => {
        const h = await import("@/lib/chat-agent.server");
        if (!(await h.authorized(request))) return h.unauthorized();
        const { SearchQuery, runSearch } = await import("@/lib/api-search.server");
        const p = SearchQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams));
        if (!p.success) return h.json({ error: "invalid query" }, 400);
        const r = await runSearch({ ...p.data, limit: 50 }, { days: 3, limit: 50 });
        if ("error" in r) return h.json({ error: r.error }, r.error === "address not found" ? 400 : 500);
        const stops: Record<string, unknown>[] = [];
        for (const hit of r.hits) {
          const t = hit.truck;
          const base = { truck_id: t.id, truck_name: t.name, cuisine: t.category || null, distance_miles: hit.distance_miles };
          if (hit.is_base_location) {
            stops.push({ ...base, city: h.cityFromAddress(t.base_address), address: t.base_address, is_base_location: true, starts_at: null, ends_at: null, open_now: null });
            continue;
          }
          for (const s of hit.stops) {
            if (p.data.open_now && !s.open_now) continue;
            stops.push({ ...base, city: s.city || h.cityFromAddress(s.address), venue: s.venue_name, address: s.address || null,
              is_base_location: false, starts_at: h.chicago(s.starts_at), ends_at: h.chicago(s.ends_at), open_now: s.open_now, _t: s.starts_at });
          }
        }
        if (!r.origin) stops.sort((a, b) => String(a["_t"] ?? "9").localeCompare(String(b["_t"] ?? "9")));
        const limit = p.data.limit ?? 25;
        return h.json({ origin: r.origin?.label || null, radius_miles: r.radius, stops: stops.slice(0, limit).map(({ _t, ...s }) => s) });
      },
    },
  },
});
