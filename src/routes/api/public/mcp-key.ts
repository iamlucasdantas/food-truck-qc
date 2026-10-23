import { createFileRoute } from "@tanstack/react-router";
import { defineMcp } from "@lovable.dev/mcp-js";
import { createTanStackMcpHandler } from "@lovable.dev/mcp-js/stacks/tanstack";
import { mcpInstructions, mcpTools } from "@/lib/mcp/tools";

// MCP for clients that can't do OAuth: same tools as /mcp, authenticated with a
// personal API key (Authorization: Bearer ftqc_… or x-api-key). Tools run as the
// key owner, so admin keys get admin tools and everyone else gets "Admins only".
export const Route = createFileRoute("/api/public/mcp-key")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      ANY: async ({ request }) => {
        const { apiKeyUserId, unauthorized } = await import("@/lib/api-key-auth.server");
        const xKey = request.headers.get("x-api-key");
        const authReq = xKey && !request.headers.get("authorization")
          ? new Request(request, { headers: { ...Object.fromEntries(request.headers), authorization: `Bearer ${xKey}` } })
          : request;
        const userId = await apiKeyUserId(authReq);
        if (!userId) return unauthorized();
        const { sessionForUser } = await import("@/lib/mcp/key-session.server");
        const identity = await sessionForUser(userId);
        if (!identity) return Response.json({ error: "Couldn't start a session for this key." }, { status: 500 });
        const mcp = defineMcp({
          name: "food-truck-qc",
          title: "Food Truck QC",
          version: "0.1.0",
          instructions: mcpInstructions,
          tools: mcpTools,
          createAppContext: () => identity,
        });
        return createTanStackMcpHandler(mcp, { resourcePath: "/api/public/mcp-key" })({ request });
      },
    },
  },
});
