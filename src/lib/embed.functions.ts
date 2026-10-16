import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { buildSignup, parseBusinessName, parseContact, signupStepsFor, type ExistingBusiness } from "@/data/business";

const opt = (max: number) => z.string().trim().max(max).optional().default("");

export const truckSignupSchema = z.object({
  contactName: z.string().trim().min(1, "Enter your name").max(100),
  email: z.string().trim().email("Enter a valid email").max(255),
  phone: opt(30),
  businessName: opt(120),
  truckName: z.string().trim().min(1, "Enter the truck name").max(100),
  category: z.string().trim().min(1, "Pick a category").max(50),
  truckType: z.string().trim().refine((v) => v === "fixed" || v === "mobile", "Pick fixed location or mobile"),
  city: opt(120),
  instagram: opt(200),
  facebook: opt(200),
  website: opt(200),
  description: opt(600),
  company: opt(200), // honeypot: real people leave this empty
}).superRefine((d, ctx) => {
  if (d.truckType === "fixed" && !d.city) ctx.addIssue({ code: "custom", path: ["city"], message: "A fixed location needs its address" });
});

/** Fields shown on each step of the two-step owner form (first truck). */
export const SIGNUP_STEPS = signupStepsFor(false);

/** Look up an existing business by email: an account's business, or an earlier embed submission. Server-only. */
async function findExistingBusiness(email: string): Promise<ExistingBusiness | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const e = email.trim().toLowerCase();
  const { data: ownerId } = await supabaseAdmin.rpc("owner_id_by_email", { _email: e });
  if (ownerId) {
    const { data: biz } = await supabaseAdmin.from("businesses").select("*").eq("owner_id", ownerId).maybeSingle();
    if (biz) {
      const { data: trucks } = await supabaseAdmin.from("trucks").select("name, description, created_at")
        .or(`claimed_by.eq.${ownerId},created_by.eq.${ownerId}`).order("created_at");
      const contact = (trucks ?? []).map((t) => parseContact(t.description)).find((c) => c && c.name) ?? { name: "", email: e, phone: "" };
      return { ownerId, businessName: biz.name, contact, website: biz.website, instagram: biz.instagram, facebook: biz.facebook, truckNames: (trucks ?? []).map((t) => t.name) };
    }
  }
  const { data: rows } = await supabaseAdmin.from("trucks").select("name, description, website, instagram, facebook, created_at")
    .eq("source", "embed_form").neq("status", "archived").ilike("description", `%${e.replace(/[%_]/g, "")}%`).order("created_at");
  const mine = (rows ?? []).filter((t) => parseContact(t.description)?.email.toLowerCase() === e);
  const first = mine[0];
  if (!first) return null;
  return {
    ownerId: null, businessName: parseBusinessName(first.description), contact: parseContact(first.description)!,
    website: first.website, instagram: first.instagram, facebook: first.facebook, truckNames: mine.map((t) => t.name),
  };
}

/** Public: says only whether this email already has a business (no account details are returned). */
export const checkBusinessEmail = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ email: z.string().trim().email().max(255) }).parse(input))
  .handler(async ({ data }) => ({ known: !!(await findExistingBusiness(data.email)) }));

/** Public endpoint for the embeddable owner signup form: creates a pending truck for admin review and notifies HighLevel. */
export const submitTruckSignup = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => truckSignupSchema.parse(input))
  .handler(async ({ data }) => {
    if (data.company) return { ok: true };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const existing = await findExistingBusiness(data.email);
    const s = buildSignup(data, existing);
    if (!s.ok) return { ok: false, field: s.field, error: s.error };
    const slug = data.truckName.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "truck";
    const id = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
    const { error } = await supabaseAdmin.from("trucks").insert({ id, ...s.truck, status: "pending", source: "embed_form" });
    if (error) {
      console.error("[embed signup] insert failed", error);
      return { ok: false, error: "Could not save. Please try again." };
    }
    if (s.truck.created_by) {
      await supabaseAdmin.from("claims").insert({ truck_id: id, user_id: s.truck.created_by, user_email: s.contact.email, message: "Additional truck submitted via the embed form" });
    }
    const hook = process.env["HIGHLEVEL_OWNER_WEBHOOK_URL"];
    if (hook) {
      const [first = "", ...rest] = s.contact.name.split(" ");
      try {
        const res = await fetch(hook, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: "owner_signup", email: s.contact.email, first_name: first, last_name: rest.join(" "), name: s.contact.name,
            phone: s.contact.phone, business_name: s.businessName, truck_name: s.truck.name, cuisine: data.category, city: data.city, truck_type: data.truckType,
            instagram: s.truck.instagram ?? "", facebook: s.truck.facebook ?? "", website: s.truck.website ?? "", description: s.linked ? "" : data.description,
            truck_url: `https://app.foodtruckqc.com/truck/${id}`, tags: ["owner"],
          }),
        });
        if (!res.ok) console.error(`[HighLevel] owner webhook failed [${res.status}]: ${await res.text().catch(() => "")}`);
      } catch (e) { console.error("[HighLevel] owner webhook failed", e); }
    }
    return { ok: true };
  });
