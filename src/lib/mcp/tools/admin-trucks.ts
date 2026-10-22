import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { slugify } from "@/data/trucks";
import { geocode } from "@/lib/geocode";
import { adminClient, defined, json } from "../admin";

const TRUCK = "id,name,business_name,category,truck_type,status,description,menu_summary,phone,website,instagram,facebook,base_address,base_lat,base_lng,claimed_by,is_food_truck";

export const adminGetTruck = defineTool({
  name: "admin_get_truck",
  title: "Admin: get a truck",
  description: "Admin only. Find trucks by id or name (any status) with their business owner.",
  inputSchema: { id: z.string().max(150).optional(), name: z.string().max(150).optional() },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async ({ id, name }, ctx) => {
    const sb = await adminClient(ctx);
    if (!id && !name) throw new ToolError("Give id or name.");
    let q = sb.from("trucks").select(TRUCK).is("deleted_at", null).limit(10);
    q = id ? q.eq("id", id) : q.ilike("name", `%${name}%`);
    const { data, error } = await q;
    if (error) throw new ToolError(error.message);
    return json(JSON.stringify(data), { trucks: data ?? [] });
  },
});

export const adminSaveTruck = defineTool({
  name: "admin_save_truck",
  title: "Admin: create or edit a truck",
  description: "Admin only. Without id creates a truck; with id updates only the sent fields. owner_id links the truck to a business (its owner account). base_address is geocoded to a map pin. Fixed trucks need an address to be active.",
  inputSchema: {
    id: z.string().max(150).optional().describe("Truck id to edit; omit to create."),
    name: z.string().min(1).max(150).optional(),
    category: z.string().max(60).optional(),
    truck_type: z.enum(["mobile", "fixed", "hybrid"]).optional(),
    status: z.enum(["active", "pending", "archived"]).optional(),
    description: z.string().max(3000).optional(),
    menu_summary: z.string().max(1500).nullable().optional(),
    phone: z.string().max(40).nullable().optional(),
    website: z.string().max(300).nullable().optional(),
    instagram: z.string().max(300).nullable().optional(),
    facebook: z.string().max(300).nullable().optional(),
    base_address: z.string().max(300).nullable().optional(),
    is_food_truck: z.boolean().optional(),
    owner_id: z.string().uuid().nullable().optional().describe("Business owner account id; null unlinks."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  handler: async ({ id, owner_id, base_address, ...fields }, ctx) => {
    const sb = await adminClient(ctx);
    const patch: Record<string, unknown> = defined(fields);
    if (owner_id !== undefined) patch["claimed_by"] = owner_id;
    if (base_address !== undefined) {
      patch["base_address"] = base_address;
      if (base_address) {
        const g = await geocode(base_address).catch(() => null);
        if (!g) throw new ToolError("Couldn't find that address on the map. Try adding city and state.");
        patch["base_lat"] = g.lat; patch["base_lng"] = g.lng;
      } else { patch["base_lat"] = null; patch["base_lng"] = null; }
    }
    let truckId = id;
    if (id) {
      const { data, error } = await sb.from("trucks").update(patch as never).eq("id", id).select("id");
      if (error) throw new ToolError(error.message);
      if (!data?.length) throw new ToolError("Truck not found.");
    } else {
      if (!fields.name) throw new ToolError("name is required to create a truck.");
      truckId = `${slugify(fields.name)}-${crypto.randomUUID().slice(0, 5)}`;
      const { error } = await sb.from("trucks").insert({ category: "", description: "", source: "admin", is_food_truck: true, status: "pending", ...patch, name: fields.name, id: truckId } as never);
      if (error) throw new ToolError(error.message);
    }
    const { data } = await sb.from("trucks").select(TRUCK).eq("id", truckId!).single();
    return json(`${id ? "Updated" : "Created"} truck ${data?.name} (${truckId}), status ${data?.status}.`, { truck: data });
  },
});

export const adminDeleteTruck = defineTool({
  name: "admin_delete_truck",
  title: "Admin: delete a truck",
  description: "Admin only. Deletes a truck (logged; restorable from Admin for 30 days, then purged with its stops).",
  inputSchema: { id: z.string().min(1).max(150) },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ id }, ctx) => {
    const sb = await adminClient(ctx);
    const { data, error } = await sb.rpc("admin_delete_trucks", { _ids: [id] });
    if (error) throw new ToolError(error.message);
    if (!data) throw new ToolError("Truck not found or already deleted.");
    return json("Truck deleted (restorable for 30 days in Admin).", { deleted: true });
  },
});
