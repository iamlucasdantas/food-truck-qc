import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";
import { callerUserId } from "../identity";

export default defineTool({
  name: "set_favorite",
  title: "Heart or unheart a truck",
  description: "Add a truck to, or remove it from, the signed-in user's favorites.",
  inputSchema: {
    truck_id: z.string().uuid().describe("Truck id from search_trucks."),
    favorite: z.boolean().describe("true to add, false to remove."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ truck_id, favorite }, ctx) => {
    const uid = callerUserId(ctx);
    if (!uid) throw new ToolError("Not signed in.");
    const sb = supabaseForUser(ctx);
    const { error } = favorite
      ? await sb.from("favorites").upsert({ user_id: uid, truck_id }, { onConflict: "user_id,truck_id", ignoreDuplicates: true })
      : await sb.from("favorites").delete().eq("user_id", uid).eq("truck_id", truck_id);
    if (error) throw new ToolError(error.message);
    return { content: [{ type: "text", text: favorite ? "Added to favorites." : "Removed from favorites." }] };
  },
});
