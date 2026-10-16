import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseSocialLink } from "@/data/onboarding";

export interface SocialPrefillResult {
  ok: boolean;
  platform: string | null;
  handle: string;
  name: string;
  description: string;
  logoUrl: string | null;
  website: string | null;
  error?: string;
}

/**
 * Signed-in owners paste a Facebook/Instagram/website link; we fetch the public page's
 * Open Graph tags and prefill name/description/logo. Best-effort: social networks often
 * block scraping, in which case we still return the parsed handle so the form can use it.
 */
export const prefillFromSocialLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ url: z.string().trim().min(2).max(500) }).parse(input))
  .handler(async ({ data }): Promise<SocialPrefillResult> => {
    const parsed = parseSocialLink(data.url);
    if (!parsed) return { ok: false, platform: null, handle: "", name: "", description: "", logoUrl: null, website: null, error: "That doesn't look like a Facebook, Instagram or website link." };
    const base = { ok: true, platform: parsed.platform, handle: parsed.handle, name: "", description: "", logoUrl: null as string | null, website: parsed.platform === "website" ? parsed.url : null };
    try {
      const res = await fetch(parsed.url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; FoodTruckQC/1.0; +https://app.foodtruckqc.com)", Accept: "text/html" },
        redirect: "follow",
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return { ...base, error: "Couldn't read that page — fill in the fields yourself." };
      const html = (await res.text()).slice(0, 300_000);
      const og = (prop: string) =>
        html.match(new RegExp(`<meta[^>]+property=["']og:${prop}["'][^>]+content=["']([^"']+)["']`, "i"))?.[1]
        ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:${prop}["']`, "i"))?.[1]
        ?? "";
      const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
      return {
        ...base,
        name: decode(og("title")).slice(0, 120),
        description: decode(og("description")).slice(0, 600),
        logoUrl: og("image") || null,
      };
    } catch {
      return { ...base, error: "Couldn't read that page — fill in the fields yourself." };
    }
  });

export interface AddressSuggestion { label: string; placeId: string }

/** Signed-in address autocomplete, biased to the Quad Cities, via the Google Maps connector. */
export const addressAutocomplete = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ input: z.string().trim().min(2).max(200) }).parse(input))
  .handler(async ({ data }): Promise<{ suggestions: AddressSuggestion[] }> => {
    const lovable = process.env["LOVABLE_API_KEY"], maps = process.env["GOOGLE_MAPS_API_KEY"];
    if (!lovable || !maps) return { suggestions: [] };
    const res = await fetch("https://connector-gateway.lovable.dev/google_maps/places/v1/places:autocomplete", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovable}`, "X-Connection-Api-Key": maps, "Content-Type": "application/json",
        "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text",
      },
      body: JSON.stringify({
        input: data.input,
        locationBias: { circle: { center: { latitude: 41.52, longitude: -90.55 }, radius: 60000 } },
      }),
    });
    if (!res.ok) {
      console.error(`[onboarding] autocomplete failed [${res.status}]: ${(await res.text()).slice(0, 300)}`);
      return { suggestions: [] };
    }
    const j = (await res.json()) as { suggestions?: { placePrediction?: { placeId?: string; text?: { text?: string } } }[] };
    const suggestions = (j.suggestions ?? [])
      .map((s) => ({ label: s.placePrediction?.text?.text ?? "", placeId: s.placePrediction?.placeId ?? "" }))
      .filter((s) => s.label)
      .slice(0, 5);
    return { suggestions };
  });
