import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Q = z.object({
  city: z.string().max(60).optional(),
  truck_id: z.string().max(120).regex(/^[a-z0-9-]+$/i).optional(),
  days: z.coerce.number().int().min(1).max(14).optional(),
});

// GET /api/public/chat-upcoming-stops?city=Moline&truck_id=…&days=3 — read-only, x-api-key required.
export const Route = createFileRoute("/api/public/chat-upcoming-stops")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/lib/chat-agent.server")).preflight(),
      GET: async ({ request }) => {
        const h = await import("@/lib/chat-agent.server");
        if (!(await h.authorized(request))) return h.unauthorized();
        const p = Q.safeParse(Object.fromEntries(new URL(request.url).searchParams));
        if (!p.success) return h.json({ error: "invalid query" }, 400);
        const city = p.data.city?.trim().replace(/[%_]/g, "") ?? "";
        const now = new Date();
        const until = new Date(now.getTime() + (p.data.days ?? 3) * 86400_000);
        const sb = h.publicClient();

        let q = sb.from("stops")
          .select("truck_id, venue_name, source, address, city, starts_at, ends_at, created_at, trucks!inner(name, category, status, deleted_at)")
          .eq("cancelled", false).eq("trucks.status", "active").is("trucks.deleted_at", null)
          .gte("ends_at", now.toISOString()).lte("starts_at", until.toISOString())
          .order("starts_at").limit(100);
        if (p.data.truck_id) q = q.eq("truck_id", p.data.truck_id);
        if (city) q = q.ilike("city", city);
        const { data, error } = await q;
        if (error) return h.json({ error: "lookup failed" }, 500);

        const stops: Record<string, unknown>[] = h.groupStops(data ?? []).slice(0, 25).map((s) => ({
          truck_id: s.truck_id,
          truck_name: s.trucks.name,
          cuisine: s.trucks.category || null,
          city: s.city || h.cityFromAddress(s.address),
          address: s.address || null,
          is_base_location: s.source === "apify_maps",
          starts_at: s.source === "apify_maps" ? null : h.chicago(s.starts_at),
          ends_at: s.source === "apify_maps" ? null : h.chicago(s.ends_at),
          open_now: s.source === "apify_maps" ? null : new Date(s.starts_at) <= now && new Date(s.ends_at) > now,
        }));

        // Fixed trucks without a scheduled stop in range: report their base location (hours unknown).
        if (stops.length < 25) {
          const scheduled = new Set(stops.map((s) => s["truck_id"]));
          let b = sb.from("trucks").select("id, name, category, base_address")
            .eq("status", "active").is("deleted_at", null).eq("truck_type", "fixed")
            .not("base_address", "is", null).neq("base_address", "").order("name").limit(100);
          if (p.data.truck_id) b = b.eq("id", p.data.truck_id);
          if (city) b = b.ilike("base_address", `%${city}%`);
          const { data: base } = await b;
          for (const t of base ?? []) {
            if (stops.length >= 25) break;
            if (scheduled.has(t.id)) continue;
            const c = h.cityFromAddress(t.base_address);
            if (city && c?.toLowerCase() !== city.toLowerCase()) continue;
            stops.push({
              truck_id: t.id, truck_name: t.name, cuisine: t.category || null, city: c,
              address: t.base_address, is_base_location: true, starts_at: null, ends_at: null, open_now: null,
            });
          }
        }
        return h.json({ stops });
      },
    },
  },
});
