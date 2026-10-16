import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "my_favorites",
  title: "My favorite trucks",
  description: "List the signed-in user's favorite (hearted) food trucks.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_args, ctx) => {
    const { data, error } = await supabaseForUser(ctx).from("favorites").select("truck_id, trucks(name, category)").limit(200);
    if (error) throw new ToolError(error.message);
    const favorites = (data ?? []).map((f) => ({ truck_id: f.truck_id, name: f.trucks?.name ?? null, cuisine: f.trucks?.category ?? null }));
    const text = favorites.length ? favorites.map((f) => `${f.truck_id}: ${f.name ?? "Unknown"}`).join("\n") : "No favorites yet.";
    return { content: [{ type: "text", text }], structuredContent: { favorites } };
  },
});
