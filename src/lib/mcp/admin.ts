import { ToolError, type ToolContext } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "./supabase";

/** Admin tools run as the caller (RLS applies); this only fails fast for non-admins. */
export async function adminClient(ctx: ToolContext) {
  const uid = ctx.getUserId();
  if (!uid) throw new ToolError("Not signed in.");
  const sb = supabaseForUser(ctx);
  const { data } = await sb.rpc("has_role", { _user_id: uid, _role: "admin" });
  if (!data) throw new ToolError("Admins only.");
  return sb;
}

export async function ownerIdFor(sb: Awaited<ReturnType<typeof adminClient>>, input: { owner_id?: string; owner_email?: string }) {
  if (input.owner_id) return input.owner_id;
  if (!input.owner_email) throw new ToolError("Give owner_id or owner_email.");
  const { data, error } = await sb.rpc("admin_user_id_by_email", { _email: input.owner_email });
  if (error) throw new ToolError(error.message);
  if (!data) throw new ToolError("No account with that email. The owner must sign up first.");
  return data;
}

export const json = <T,>(text: string, data: T) => ({ content: [{ type: "text" as const, text }], structuredContent: data });

/** Drops undefined keys so updates only touch the fields the caller sent. */
export function defined<T extends Record<string, unknown>>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}
