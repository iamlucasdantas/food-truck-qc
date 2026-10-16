import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "search_trucks",
  title: "Search food trucks",
  description: "Find approved Quad Cities food trucks by name, cuisine or dish.",
  inputSchema: {
    query: z.string().max(100).optional().describe("Truck name, cuisine or dish, e.g. 'tacos'. Omit to list all."),
    limit: z.number().int().min(1).max(50).optional().describe("Max results (default 20)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, limit }, ctx) => {
    const sb = supabaseForUser(ctx);
    let q = sb.from("trucks").select("id, name, business_name, category, description, truck_type, website")
      .eq("status", "active").is("deleted_at", null).order("name").limit(limit ?? 20);
    const term = query?.trim().replace(/[%,()]/g, " ");
    if (term) q = q.or(`name.ilike.%${term}%,category.ilike.%${term}%,menu_search.ilike.%${term}%,description.ilike.%${term}%`);
    const { data, error } = await q;
    if (error) throw new ToolError(error.message);
    const trucks = (data ?? []).map((t) => ({
      id: t.id, name: t.name, business: t.business_name ?? null, cuisine: t.category ?? null,
      type: t.truck_type ?? null, website: t.website ?? null,
    }));
    const text = trucks.length ? trucks.map((t) => `${t.id}: ${t.name}${t.cuisine ? ` (${t.cuisine})` : ""}`).join("\n") : "No trucks found.";
    return { content: [{ type: "text", text }], structuredContent: { trucks } };
  },
});
