import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

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

/** Fields shown on each step of the two-step owner form (used for per-step validation). */
export const SIGNUP_STEPS = [
  ["contactName", "email", "phone", "businessName", "website", "instagram", "facebook"],
  ["truckName", "truckType", "category", "city", "description"],
] as const;

/** Public endpoint for the embeddable owner signup form: creates a pending truck for admin review and notifies HighLevel. */
export const submitTruckSignup = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => truckSignupSchema.parse(input))
  .handler(async ({ data }) => {
    if (data.company) return { ok: true };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const slug = data.truckName.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "truck";
    const id = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
    const contact = `Owner contact: ${[data.contactName, data.email, data.phone].filter(Boolean).join(" · ")}`;
    const { error } = await supabaseAdmin.from("trucks").insert({
      id,
      name: data.truckName,
      category: data.category,
      phone: data.phone || null,
      website: data.website || null,
      instagram: data.instagram || null,
      facebook: data.facebook || null,
      base_address: data.city || null,
      description: [data.description, data.businessName && `Business: ${data.businessName}`, contact].filter(Boolean).join("\n\n"),
      status: "pending",
      source: "embed_form",
      truck_type: data.truckType,
    });
    if (error) {
      console.error("[embed signup] insert failed", error);
      return { ok: false, error: "Could not save. Please try again." };
    }
    const hook = process.env["HIGHLEVEL_OWNER_WEBHOOK_URL"];
    if (hook) {
      const [first = "", ...rest] = data.contactName.split(" ");
      try {
        const res = await fetch(hook, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: "owner_signup", email: data.email, first_name: first, last_name: rest.join(" "), name: data.contactName,
            phone: data.phone, business_name: data.businessName, truck_name: data.truckName, cuisine: data.category, city: data.city, truck_type: data.truckType,
            instagram: data.instagram, facebook: data.facebook, website: data.website, description: data.description,
            truck_url: `https://app.foodtruckqc.com/truck/${id}`, tags: ["owner"],
          }),
        });
        if (!res.ok) console.error(`[HighLevel] owner webhook failed [${res.status}]: ${await res.text().catch(() => "")}`);
      } catch (e) { console.error("[HighLevel] owner webhook failed", e); }
    }
    return { ok: true };
  });
