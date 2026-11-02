// Owner tools: see, register and update the caller's own truck. Mirrors the onboarding wizard
// (business upsert → pending truck + claim → owner webhook) so an AI assistant with the owner's
// API key can do exactly what the owner could do in the app, and nothing more.
import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { contactLine, parseBusinessName, parseContact } from "@/data/business";
import { cleanHandle, missingFor, newTruckId, pickMyTruck, publicTruckUrl, statusLine, todayCentral } from "@/data/owner-tools";
import { centralToUtc } from "@/data/trucks";
import { defined } from "../admin";
import { geocodeOrFail, myTrucks, ownerClient, reply, TRUCK_COLS, type MyTruck } from "../owner";

const handle = z.string().max(300).nullable().optional();

async function summarize(sb: ReturnType<typeof ownerClient>["sb"], t: MyTruck) {
  const from = centralToUtc(todayCentral(), "00:00").toISOString();
  const [{ count: photos }, { count: stops }] = await Promise.all([
    sb.from("truck_photos").select("id", { count: "exact", head: true }).eq("truck_id", t.id),
    sb.from("stops").select("id", { count: "exact", head: true }).eq("truck_id", t.id).eq("cancelled", false).gte("ends_at", from),
  ]);
  const missing = missingFor(t, { photos: photos ?? 0, upcomingStops: stops ?? 0 });
  return {
    truck_id: t.id, name: t.name, business_name: t.business_name, cuisine: t.category, truck_type: t.truck_type, status: t.status, status_text: statusLine(t.status),
    phone: t.phone, website: t.website, instagram: t.instagram, facebook: t.facebook, base_address: t.base_address, menu_summary: t.menu_summary,
    photos: photos ?? 0, upcoming_stops: stops ?? 0, missing, public_url: publicTruckUrl(t.id),
  };
}

export const myTruck = defineTool({
  name: "my_truck",
  title: "My truck",
  description: "The signed-in owner's business and food truck(s): status (pending review / live), contact details, photo and schedule counts, and what is still missing. Call this first to get truck_id for the other owner tools.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_a, ctx) => {
    const { sb, uid } = ownerClient(ctx);
    const [{ data: biz }, trucks] = await Promise.all([
      sb.from("businesses").select("name,description,website,instagram,facebook,payment_methods").eq("owner_id", uid).maybeSingle(),
      myTrucks(sb, uid),
    ]);
    const summaries = await Promise.all(trucks.map((t) => summarize(sb, t)));
    const text = trucks.length
      ? summaries.map((s) => `${s.name} (${s.truck_id}) — ${s.status_text}${s.missing.length ? ` Still missing: ${s.missing.join(", ")}.` : " Profile complete."} ${s.public_url}`).join("\n")
      : "No truck linked to your account yet. Use register_my_truck to put it on the map, or open your truck's public page in the app and tap “Is this your truck? Claim it”.";
    return reply(text, { business: biz ?? null, trucks: summaries });
  },
});

export const registerMyTruck = defineTool({
  name: "register_my_truck",
  title: "Put my truck on the map",
  description: "Register the signed-in owner's food truck on FoodTruckQC: creates their business profile if needed and submits the truck for approval (it appears on the public map once the FoodTruckQC team approves it, usually within a day). Ask the owner for anything you don't know instead of guessing: truck name, kind of food, mobile or fixed, home city or address, phone.",
  inputSchema: {
    truck_name: z.string().min(1).max(150).describe("Name painted on the truck, e.g. \"Taco One\"."),
    category: z.string().min(1).max(60).describe("Kind of food, e.g. Tacos, BBQ, Pizza, Coffee."),
    truck_type: z.enum(["mobile", "fixed", "hybrid"]).default("mobile").describe("mobile = moves between stops; fixed = always at one address; hybrid = both."),
    base_address: z.string().min(2).max(300).describe("Home base: a street address, or just the city, e.g. \"Davenport, IA\". Fixed trucks need the full address."),
    business_name: z.string().min(1).max(150).optional().describe("Business/LLC name if different from the truck; defaults to the truck name or the existing business."),
    phone: z.string().max(40).optional().describe("Public phone customers can call."),
    description: z.string().max(1500).optional().describe("One or two sentences for the public page."),
    website: handle, instagram: handle, facebook: handle,
    owner_name: z.string().max(120).optional().describe("Owner's name for the FoodTruckQC team (not public)."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  handler: async (a, ctx) => {
    const { sb, uid } = ownerClient(ctx);
    const existing = await myTrucks(sb, uid);
    const dup = existing.find((t) => t.name.trim().toLowerCase() === a.truck_name.trim().toLowerCase());
    if (dup) throw new ToolError(`You already have a truck called ${dup.name} (${dup.id}, ${statusLine(dup.status)}). Use update_my_truck to change it.`);

    const { data: u } = await sb.auth.getUser();
    const email = u?.user?.email ?? "";
    const { data: biz } = await sb.from("businesses").select("name,description,website,instagram,facebook").eq("owner_id", uid).maybeSingle();
    const bizName = (a.business_name ?? biz?.name ?? a.truck_name).trim();
    const isNewBusiness = !biz?.name;
    if (isNewBusiness || a.business_name || a.description || a.website || a.instagram || a.facebook) {
      const { error } = await sb.from("businesses").upsert({
        owner_id: uid, name: bizName, description: a.description ?? biz?.description ?? "",
        website: cleanHandle(a.website) ?? biz?.website ?? null, instagram: cleanHandle(a.instagram) ?? biz?.instagram ?? null, facebook: cleanHandle(a.facebook) ?? biz?.facebook ?? null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "owner_id" });
      if (error) throw new ToolError(`Couldn't save the business: ${error.message}`);
    }

    const g = await geocodeOrFail(a.base_address);
    const id = newTruckId(a.truck_name);
    const description = `${bizName ? `Business: ${bizName}\n\n` : ""}${contactLine({ name: a.owner_name ?? (email.split("@")[0] ?? ""), email, phone: a.phone ?? "" })}`;
    const { error } = await sb.from("trucks").insert({
      id, name: a.truck_name.trim(), category: a.category.trim(), emoji: a.truck_type === "fixed" ? "🏠" : "🚚", status: "pending", created_by: uid,
      truck_type: a.truck_type, business_name: bizName, description, phone: a.phone ?? null,
      website: cleanHandle(a.website), instagram: cleanHandle(a.instagram), facebook: cleanHandle(a.facebook),
      base_address: a.base_address.trim(), base_lat: g.lat, base_lng: g.lng, is_food_truck: true,
    });
    if (error) throw new ToolError(`Couldn't create the truck: ${error.message}`);
    await sb.from("claims").insert({ truck_id: id, user_id: uid, user_email: email || null, message: "New truck submitted by the owner's AI assistant (MCP)" });
    try {
      const { postOwnerWebhook } = await import("@/lib/owner-webhook.server");
      const c = parseContact(description) ?? { name: "", email, phone: a.phone ?? "" };
      await postOwnerWebhook({
        source: "owner_dashboard", isNewBusiness, contact: { ...c, email: c.email || email },
        businessName: bizName || parseBusinessName(description), truckId: id, truckName: a.truck_name.trim(), truckType: a.truck_type,
        cuisine: a.category, city: a.base_address, instagram: cleanHandle(a.instagram) ?? biz?.instagram, facebook: cleanHandle(a.facebook) ?? biz?.facebook, website: cleanHandle(a.website) ?? biz?.website,
        description: isNewBusiness ? (a.description ?? "") : "",
      });
    } catch (e) { console.error("[mcp register_my_truck] owner webhook failed", e); }

    const url = publicTruckUrl(id);
    return reply(
      `${a.truck_name} is submitted (id ${id}). ${statusLine("pending")} Meanwhile you can add photos, a menu and stops in the app or with add_my_stop. Public page once approved: ${url}`,
      { truck_id: id, status: "pending", public_url: url, business_name: bizName, next_steps: ["add_my_stop for this week's stops", "upload truck photos and a menu photo in the app (Owner dashboard)", "check_in with “I'm here” when you open"] },
    );
  },
});

export const updateMyTruck = defineTool({
  name: "update_my_truck",
  title: "Update my truck",
  description: "Change details of the signed-in owner's own truck: name, kind of food, mobile/fixed, description, phone, website, Instagram, Facebook, short menu summary, or home address (re-pinned on the map). Only sent fields change. Owners can't change approval status.",
  inputSchema: {
    truck_id: z.string().max(150).optional().describe("From my_truck; optional when the owner has one truck."),
    name: z.string().min(1).max(150).optional(),
    category: z.string().min(1).max(60).optional(),
    truck_type: z.enum(["mobile", "fixed", "hybrid"]).optional(),
    description: z.string().max(3000).optional(),
    menu_summary: z.string().max(1500).nullable().optional().describe("Short text menu shown on the page, e.g. \"Street tacos $3 · Burrito $9 · Horchata $2\"."),
    phone: z.string().max(40).nullable().optional(),
    website: handle, instagram: handle, facebook: handle,
    base_address: z.string().max(300).nullable().optional().describe("Home base / fixed location; geocoded to the map pin."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  handler: async ({ truck_id, base_address, website, instagram, facebook, ...fields }, ctx) => {
    const { sb, uid } = ownerClient(ctx);
    const picked = pickMyTruck(await myTrucks(sb, uid), truck_id);
    if (!picked.ok) throw new ToolError(picked.error);
    const patch: Record<string, unknown> = defined({ ...fields, website: website === undefined ? undefined : cleanHandle(website), instagram: instagram === undefined ? undefined : cleanHandle(instagram), facebook: facebook === undefined ? undefined : cleanHandle(facebook) });
    if (base_address !== undefined) {
      patch["base_address"] = base_address;
      if (base_address) { const g = await geocodeOrFail(base_address); patch["base_lat"] = g.lat; patch["base_lng"] = g.lng; }
      else { patch["base_lat"] = null; patch["base_lng"] = null; }
    }
    if (!Object.keys(patch).length) throw new ToolError("Nothing to change — send at least one field.");
    patch["updated_at"] = new Date().toISOString();
    const { data, error } = await sb.from("trucks").update(patch as never).eq("id", picked.truck.id).select(TRUCK_COLS);
    if (error) throw new ToolError(error.message);
    if (!data?.length) throw new ToolError("Couldn't update that truck.");
    const t = data[0] as unknown as MyTruck;
    const changed = Object.keys(patch).filter((k) => k !== "updated_at" && !k.startsWith("base_l"));
    return reply(`Updated ${t.name}: ${changed.join(", ")}. ${publicTruckUrl(t.id)}`, { truck: await summarize(sb, t), changed });
  },
});
