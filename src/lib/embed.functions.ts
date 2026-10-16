import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const opt = (max: number) => z.string().trim().max(max).optional().default("");

export const truckSignupSchema = z.object({
  contactName: z.string().trim().min(1, "Enter your name").max(100),
  email: z.string().trim().email("Enter a valid email").max(255),
  phone: z.string().trim().min(7, "Enter a phone number").max(30),
  truckName: z.string().trim().min(1, "Enter the truck name").max(100),
  category: z.string().trim().min(1, "Pick a category").max(50),
  city: opt(120),
  instagram: opt(200),
  facebook: opt(200),
  website: opt(200),
  description: opt(600),
  company: opt(200), // honeypot: real people leave this empty
});

/** Public endpoint for the embeddable owner signup form: creates a pending truck for admin review and notifies HighLevel. */
export const submitTruckSignup = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => truckSignupSchema.parse(input))
  .handler(async ({ data }) => {
    if (data.company) return { ok: true };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const slug = data.truckName.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "truck";
    const id = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
    const contact = `Owner contact: ${data.contactName} · ${data.email} · ${data.phone}`;
    const { error } = await supabaseAdmin.from("trucks").insert({
      id,
      name: data.truckName,
      category: data.category,
      phone: data.phone,
      website: data.website || null,
      instagram: data.instagram || null,
      facebook: data.facebook || null,
      base_address: data.city || null,
      description: [data.description, contact].filter(Boolean).join("\n\n"),
      status: "pending",
      source: "embed_form",
    });
    if (error) {
      console.error("[embed signup] insert failed", error);
      return { ok: false, error: "Could not save. Please try again." };
    }
    const hook = process.env["HIGHLEVEL_SIGNUP_WEBHOOK_URL"];
    if (hook) {
      const [first = "", ...rest] = data.contactName.split(" ");
      await fetch(hook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "owner_signup", source: "FoodTruckQC embed", email: data.email, phone: data.phone,
          first_name: first, last_name: rest.join(" "), truck_name: data.truckName, truck_id: id,
          category: data.category, city: data.city, instagram: data.instagram, facebook: data.facebook, website: data.website,
          claim_url: `https://app.foodtruckqc.com/truck/${id}`,
        }),
      }).catch((e) => console.error("[HighLevel] owner webhook failed", e));
    }
    return { ok: true };
  });
