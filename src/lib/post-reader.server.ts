// Reads a screenshot of a social post with the built-in AI vision model: who posted it, when, and the full text.
const MODEL = "openai/gpt-6-astra";
const GATEWAY = "https://ai.gateway.lovable.dev/v1/responses";

const SCHEMA = {
  type: "object", additionalProperties: false, required: ["readable", "author", "posted", "text"],
  properties: {
    readable: { type: "boolean" },
    author: { type: "string", description: "Name of the page or person who wrote the post, as shown." },
    posted: { type: "string", description: "Post time as shown, e.g. '2d', 'Yesterday at 9:14 AM', 'October 14'. Empty if not visible." },
    text: { type: "string", description: "The full post text exactly as written, including tagged place names." },
  },
};

const PROMPT = `You read screenshots of Facebook, Instagram or Reddit posts about food trucks.
Return the post author (page or person name), the post time exactly as shown, and the complete post text word for word.
Tagged places and pages appear as bold names — keep them in the text exactly where they appear.
If the image is not a readable post, return readable=false and empty strings.`;

export type ReadPost = { readable: boolean; author: string; posted: string; text: string; error?: string };

export async function readPostScreenshot(image: string): Promise<ReadPost> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) return { readable: false, author: "", posted: "", text: "", error: "The AI reader isn't configured." };
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "fetch" },
    body: JSON.stringify({
      model: MODEL, stream: true, store: false,
      reasoning: { effort: "low", summary: "auto" }, include: ["reasoning.encrypted_content"],
      instructions: PROMPT,
      input: [{ role: "user", content: [{ type: "input_text", text: "Read this post." }, { type: "input_image", image_url: image }] }],
      text: { format: { type: "json_schema", name: "post", strict: true, schema: SCHEMA } },
    }),
  });
  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    console.error(`[post reader] gateway failed [${res.status}]: ${body}`);
    const error = res.status === 429 ? "The AI reader is busy — try again in a minute."
      : res.status === 402 || res.status === 403 ? "The AI reader is unavailable (AI credits or access)."
      : "Couldn't read the screenshot. Try again or paste the text.";
    return { readable: false, author: "", posted: "", text: "", error };
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "", text = "", failed = "", refused = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const frame = buf.slice(0, i); buf = buf.slice(i + 2);
      const line = frame.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;
      try {
        const ev = JSON.parse(line.slice(5).trim()) as { type?: string; delta?: string; error?: { message?: string }; response?: { error?: { message?: string } } };
        if (ev.type === "response.output_text.delta" && ev.delta) text += ev.delta;
        else if (ev.type === "response.refusal.delta") refused = true;
        else if (ev.type === "response.failed" || ev.type === "error") failed = ev.error?.message ?? ev.response?.error?.message ?? "failed";
      } catch { /* partial frame */ }
    }
  }
  if (refused) return { readable: false, author: "", posted: "", text: "", error: "This image couldn't be read." };
  if (failed || !text.trim()) { console.error("[post reader] stream failed", failed || "empty"); return { readable: false, author: "", posted: "", text: "", error: "Couldn't read the screenshot. Try again or paste the text." }; }
  try { return JSON.parse(text) as ReadPost; } catch { return { readable: false, author: "", posted: "", text: "", error: "Unexpected reader output. Paste the text instead." }; }
}

/** "2d", "3 hrs", "Yesterday", "October 14", "Oct 14 at 9:14 AM" → YYYY-MM-DD (Central), else null. */
export function postedToDate(posted: string, today: string): string | null {
  const p = posted.trim().toLowerCase();
  if (!p) return null;
  const minus = (d: number) => new Date(Date.parse(`${today}T12:00:00Z`) - d * 86_400_000).toISOString().slice(0, 10);
  if (/^(just now|\d+\s*(m|min|mins|minutes?|h|hr|hrs|hours?))\b/.test(p)) return today;
  if (/^yesterday/.test(p)) return minus(1);
  const d = p.match(/^(\d+)\s*(d|days?)\b/); if (d) return minus(Number(d[1]));
  const w = p.match(/^(\d+)\s*(w|wks?|weeks?)\b/); if (w) return minus(Number(w[1]) * 7);
  const m = p.match(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})(?:,?\s+(\d{4}))?/);
  if (m) {
    const month = "janfebmaraprmayjunjulaugsepoctnovdec".indexOf(m[1]!) / 3;
    let year = m[3] ? Number(m[3]) : Number(today.slice(0, 4));
    let iso = `${year}-${String(month + 1).padStart(2, "0")}-${m[2]!.padStart(2, "0")}`;
    if (!m[3] && iso > today) { year--; iso = `${year}${iso.slice(4)}`; }
    return iso;
  }
  return null;
}
