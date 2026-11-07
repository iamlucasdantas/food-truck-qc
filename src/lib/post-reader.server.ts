// Reads a screenshot of a social post with Gemini: who posted it, when, and the full text.

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
  const { hasGemini, geminiJson } = await import("./gemini.server");
  if (!hasGemini()) return { readable: false, author: "", posted: "", text: "", error: "The AI reader isn't configured." };
  try { return await geminiJson<ReadPost>({ system: PROMPT, text: "Read this post.", images: [image], schema: SCHEMA }); }
  catch (e) { console.error("[post reader] gemini", e); return { readable: false, author: "", posted: "", text: "", error: "Couldn't read the screenshot. Try again or paste the text." }; }
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
