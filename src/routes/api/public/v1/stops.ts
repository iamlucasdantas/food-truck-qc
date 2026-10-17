import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

// GET /api/public/v1/stops?truck_id=…&city=Davenport&days=3
// Personal-API-key access to upcoming stops (times are UTC; Central is UTC-5/-6).
export const Route = createFileRoute("/api/public/v1/stops")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { apiKeyUserId, unauthorized } = await import("@/lib/api-key-auth.server");
        const userId = await apiKeyUserId(request);
        if (!userId) return unauthorized();

        const url = new URL(request.url);
        const truckId = url.searchParams.get("truck_id");
        const city = (url.searchParams.get("city") ?? "").slice(0, 60).trim();
        const days = Math.min(Math.max(Number(url.searchParams.get("days")) || 3, 1), 14);

        const sb = createClient<Database>(
          process.env["SUPABASE_URL"]!,
          process.env["SUPABASE_PUBLISHABLE_KEY"]!,
          { auth: { persistSession: false, autoRefreshToken: false } },
        );
        const now = new Date();
        const until = new Date(now.getTime() + days * 86400_000);
        let q = sb
          .from("stops")
          .select("truck_id, venue_name, address, city, starts_at, ends_at, trucks(name)")
          .eq("cancelled", false)
          .gte("ends_at", now.toISOString())
          .lte("starts_at", until.toISOString())
          .order("starts_at")
          .limit(100);
        if (truckId) q = q.eq("truck_id", truckId);
        if (city) q = q.ilike("city", city);
        const { data, error } = await q;
        if (error) return Response.json({ error: error.message }, { status: 500 });

        const stops = (data ?? []).map((s) => ({
          truck_id: s.truck_id,
          truck: (s.trucks as { name?: string } | null)?.name ?? null,
          venue: s.venue_name,
          address: s.address ?? null,
          city: s.city ?? null,
          starts_at: s.starts_at,
          ends_at: s.ends_at,
          open_now: new Date(s.starts_at) <= now && new Date(s.ends_at) > now,
        }));
        return Response.json({ stops });
      },
    },
  },
});
