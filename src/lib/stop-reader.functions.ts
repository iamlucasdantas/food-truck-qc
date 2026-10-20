import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseStopDrafts, type StopDraft } from "@/data/stop-drafts";

const MODEL = "openai/gpt-6-astra";
const GATEWAY = "https://ai.gateway.lovable.dev/v1/responses";
const str = { type: "string" };
const SCHEMA = {
  type: "object", additionalProperties: false, required: ["stops"],
  properties: { stops: { type: "array", items: { type: "object", additionalProperties: false,
    required: ["venue", "address", "city", "date", "start", "end", "private"],
    properties: { venue: str, address: str, city: str, date: str, start: str, end: str, private: { type: "boolean" } } } } },
};

const PROMPT = (today: string, truck: string) => `You read screenshots of food truck schedules (Facebook/Instagram posts, flyers, calendars) for the truck "${truck}".
Today is ${today} (America/Chicago). Return JSON {"stops":[...]} with one entry per dated appearance:
{"venue": place name, "address": street address visibly written in the image only, otherwise "", "city": city + state if shown else "",
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
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model: MODEL, stream: true, store: false, reasoning: { effort: "low", summary: "auto" }, include: ["reasoning.encrypted_content"],
        input: [{ role: "user", content: [{ type: "input_text", text: PROMPT(today, truck?.name ?? "this truck") }, { type: "input_image", image_url: data.image }] }],
        text: { format: { type: "json_schema", name: "stops", strict: true, schema: SCHEMA } },
      }),
    });
    if (!res.ok || !res.body) {
      const body = await res.text().catch(() => "");
      console.error(`[stop reader] gateway failed [${res.status}]: ${body.slice(0, 300)}`);
      return { stops: [], skipped: 0, error: res.status === 429 ? "The AI reader is busy — try again in a minute." : res.status === 402 ? "AI credits are used up." : "Couldn't read the screenshot." };
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "", text = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i: number;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const line = buf.slice(0, i).split("\n").find((l) => l.startsWith("data:")); buf = buf.slice(i + 2);
        if (!line) continue;
        try { const ev = JSON.parse(line.slice(5).trim()) as { type?: string; delta?: string }; if (ev.type === "response.output_text.delta" && ev.delta) text += ev.delta; } catch { /* keep-alive */ }
      }
    }
    let raw: unknown = [];
    try { raw = (JSON.parse(text || "{}") as { stops?: unknown }).stops ?? []; } catch { raw = []; }
    return parseStopDrafts(raw, today);
  });
