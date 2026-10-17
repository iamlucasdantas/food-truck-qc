import { createFileRoute } from "@tanstack/react-router";

// GET /api/public/v1/favorites
// Returns the API key owner's favorite trucks. Uses the privileged client
// scoped explicitly to the verified key owner's id.
export const Route = createFileRoute("/api/public/v1/favorites")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { apiKeyUserId, unauthorized } = await import("@/lib/api-key-auth.server");
        const userId = await apiKeyUserId(request);
        if (!userId) return unauthorized();

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("favorites")
          .select("truck_id, trucks(name, category)")
          .eq("user_id", userId)
          .limit(200);
        if (error) return Response.json({ error: error.message }, { status: 500 });

        const favorites = (data ?? []).map((f) => ({
          truck_id: f.truck_id,
          name: (f.trucks as { name?: string; category?: string } | null)?.name ?? null,
          cuisine: (f.trucks as { name?: string; category?: string } | null)?.category ?? null,
        }));
        return Response.json({ favorites });
      },
    },
  },
});
