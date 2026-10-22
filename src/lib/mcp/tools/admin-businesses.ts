import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { adminClient, defined, json, ownerIdFor } from "../admin";

const BIZ = "owner_id,name,description,website,instagram,facebook,reddit,payment_methods,payment_other";

export const adminListBusinesses = defineTool({
  name: "admin_list_businesses",
  title: "Admin: list businesses",
  description: "Admin only. List businesses (optionally filtered by name) with the trucks each one owns.",
  inputSchema: { query: z.string().max(100).optional().describe("Part of the business name.") },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async ({ query }, ctx) => {
    const sb = await adminClient(ctx);
    let q = sb.from("businesses").select(BIZ).order("name").limit(50);
    if (query) q = q.ilike("name", `%${query}%`);
    const { data, error } = await q;
    if (error) throw new ToolError(error.message);
    const ids = (data ?? []).map((b) => b.owner_id);
    const { data: trucks } = ids.length ? await sb.from("trucks").select("id,name,status,claimed_by").in("claimed_by", ids).is("deleted_at", null) : { data: [] };
    const businesses = (data ?? []).map((b) => ({ ...b, trucks: (trucks ?? []).filter((t) => t.claimed_by === b.owner_id).map((t) => ({ id: t.id, name: t.name, status: t.status })) }));
    return json(JSON.stringify(businesses), { businesses });
  },
});

export const adminSaveBusiness = defineTool({
  name: "admin_save_business",
  title: "Admin: create or edit a business",
  description: "Admin only. Create or update the business of an owner account (one business per owner, identified by owner_id or owner_email). Only sent fields change.",
  inputSchema: {
    owner_id: z.string().uuid().optional(),
    owner_email: z.string().email().optional().describe("Account email of the owner (must already have signed up)."),
    name: z.string().min(1).max(150).optional(),
    description: z.string().max(2000).optional(),
    website: z.string().max(300).nullable().optional(),
    instagram: z.string().max(300).nullable().optional(),
    facebook: z.string().max(300).nullable().optional(),
    payment_methods: z.array(z.string().max(40)).max(12).optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ owner_id, owner_email, ...fields }, ctx) => {
    const sb = await adminClient(ctx);
    const owner = await ownerIdFor(sb, { owner_id, owner_email });
    const { data: existing } = await sb.from("businesses").select("owner_id").eq("owner_id", owner).maybeSingle();
    const patch = defined(fields);
    if (existing) {
      const { error } = await sb.from("businesses").update({ ...patch, updated_at: new Date().toISOString() }).eq("owner_id", owner);
      if (error) throw new ToolError(error.message);
    } else {
      if (!fields.name) throw new ToolError("name is required to create a business.");
      const { error } = await sb.from("businesses").insert({ description: "", ...patch, name: fields.name, owner_id: owner });
      if (error) throw new ToolError(error.message);
    }
    const { data } = await sb.from("businesses").select(BIZ).eq("owner_id", owner).single();
    return json(`${existing ? "Updated" : "Created"} business.`, { business: data });
  },
});

export const adminDeleteBusiness = defineTool({
  name: "admin_delete_business",
  title: "Admin: delete a business",
  description: "Admin only. Delete an owner's business record. Their trucks are kept (use admin_delete_truck for those).",
  inputSchema: { owner_id: z.string().uuid() },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ owner_id }, ctx) => {
    const sb = await adminClient(ctx);
    const { data, error } = await sb.from("businesses").delete().eq("owner_id", owner_id).select("name");
    if (error) throw new ToolError(error.message);
    if (!data?.length) throw new ToolError("Business not found.");
    return json(`Deleted business ${data[0].name}.`, { deleted: true });
  },
});
