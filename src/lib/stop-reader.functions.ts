import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseStopDrafts, type StopDraft } from "@/data/stop-drafts";

const MODEL = "google/gemini-2.5-flash";
const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

const PROMPT = (today: string, truck: string) => `You read screenshots of food truck schedules (Facebook/Instagram posts, flyers, calendars) for the truck "${truck}".
Today is ${today} (America/Chicago). Return JSON {"stops":[...]} with one entry per dated appearance:
{"venue": place name, "address": street address if shown or known from the text else "", "city": city + state if shown else "",
 "date": "YYYY-MM-DD" (infer the year: the next occurrence on/after today unless clearly past), "start": "HH:MM" 24h or "", "end": "HH:MM" 24h or "",
 "private": true when marked private/closed event/booked}.
Never invent places, dates or times. If the image has no schedule, return {"stops":[]}.`;

/** Owner/Admin: read a schedule screenshot into editable stop drafts for one truck. Never saves anything. */
export const readStopsScreenshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { truckId: string; image: string }) => {
    if (typeof d?.image !== "string" || !/^data:image\/(jpeg|png|webp);base64,/.test(d.image) || d.image.length > 6_000_000) throw new Error("Add a JPG, PNG or WebP screenshot under 4 MB.");
    return { truckId: String(d.truckId).slice(0, 120), image: d.image };
  })
  .handler(async ({ data, context }): Promise<{ stops: StopDraft[]; skipped: number; error?: string }> => {
    const [{ data: owns }, { data: admin }] = await Promise.all([
      context.supabase.rpc("owns_truck", { _truck_id: data.truckId }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
    ]);
    if (!owns && !admin) throw new Error("Only this truck's owner or an admin can add stops.");
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) return { stops: [], skipped: 0, error: "The AI reader isn't configured." };
    const { data: truck } = await context.supabase.from("trucks").select("name").eq("id", data.truckId).maybeSingle();
    const { chicagoDate } = await import("@/data/trucks");
    const today = chicagoDate();
    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL, response_format: { type: "json_object" },
        messages: [{ role: "user", content: [{ type: "text", text: PROMPT(today, truck?.name ?? "this truck") }, { type: "image_url", image_url: { url: data.image } }] }],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[stop reader] gateway failed [${res.status}]: ${body.slice(0, 300)}`);
      return { stops: [], skipped: 0, error: res.status === 429 ? "The AI reader is busy — try again in a minute." : res.status === 402 ? "AI credits are used up." : "Couldn't read the screenshot." };
    }
    const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    let raw: unknown = [];
    try { raw = (JSON.parse(j.choices?.[0]?.message?.content ?? "{}") as { stops?: unknown }).stops ?? []; } catch { raw = []; }
    return parseStopDrafts(raw, today);
  });
