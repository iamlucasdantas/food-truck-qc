import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeMenu, type MenuRead } from "@/data/menu";

const MODEL = "openai/gpt-6-astra";
const GATEWAY = "https://ai.gateway.lovable.dev/v1/responses";

const nullableStr = { type: ["string", "null"] };
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["readable", "problem", "sections"],
  properties: {
    readable: { type: "boolean" },
    problem: { type: "string", description: "Empty when readable; otherwise a short friendly reason (blurry, not a menu, no text)." },
    sections: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["name", "items"],
        properties: {
          name: { type: "string" },
          items: {
            type: "array",
            items: {
              type: "object", additionalProperties: false, required: ["name", "description", "price", "tags", "confidence"],
              properties: {
                name: { type: "string" },
                description: nullableStr,
                price: nullableStr,
                tags: { type: "array", items: { type: "string", enum: ["vegan", "vegetarian", "spicy", "gluten-free"] } },
                confidence: { type: "string", enum: ["high", "low"] },
              },
            },
          },
        },
      },
    },
  },
};

const PROMPT = `You read food truck menus from photos (menu boards, paper menus, delivery-app screenshots).
Extract every item exactly as written: group by the menu's own sections (use "Menu" if none), item name, short description if shown, price as written (null if none).
Tags only when clearly marked or obvious from the menu text: vegan, vegetarian, spicy, gluten-free.
confidence "low" when the text is partly unreadable or you are guessing.
If the photos are too blurry, not a menu, or contain no readable text, return readable=false, sections=[] and a short friendly problem sentence.
Never invent items or prices.`;

type In = { truckId: string; images: string[] };

/** Owner-only: read menu photos with the built-in AI vision model and return a structured draft. Never saves anything. */
export const readMenuPhotos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: In) => {
    const images = Array.isArray(d?.images) ? d.images.filter((s) => typeof s === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(s)) : [];
    if (!images.length) throw new Error("Add at least one menu photo.");
    if (images.length > 6) throw new Error("Up to 6 menu photos at a time.");
    if (images.some((s) => s.length > 4_000_000)) throw new Error("One of the photos is too large.");
    return { truckId: String(d.truckId), images };
  })
  .handler(async ({ data, context }): Promise<MenuRead & { error?: string }> => {
    const { data: owns } = await context.supabase.rpc("owns_truck", { _truck_id: data.truckId });
    const { data: admin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!owns && !admin) throw new Error("Only this truck's owner can update its menu.");
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) return { sections: [], readable: false, problem: "", error: "The menu reader isn't configured yet." };

    return readMenuWithAI(key, data.images);
  });

/** Calls the AI vision model and returns a normalized menu (or a friendly error). */
export async function readMenuWithAI(key: string, images: string[]): Promise<MenuRead & { error?: string }> {
    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model: MODEL, stream: true, store: false,
        reasoning: { effort: "low", summary: "auto" }, include: ["reasoning.encrypted_content"],
        instructions: PROMPT,
        input: [{ role: "user", content: [{ type: "input_text", text: "Read this menu." }, ...images.map((u) => ({ type: "input_image", image_url: u }))] }],
        text: { format: { type: "json_schema", name: "menu", strict: true, schema: SCHEMA } },
      }),
  }