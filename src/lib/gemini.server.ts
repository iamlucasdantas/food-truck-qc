// Direct Google Gemini calls using the owner's own GOOGLE_API_KEY. When the key is missing,
// callers fall back to the built-in AI path, so nothing breaks if the key is removed.
const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
export const GEMINI_MODEL = "gemini-2.5-flash";

export class GeminiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export const hasGemini = () => !!process.env["GOOGLE_API_KEY"];

type Part = { text: string } | { inline_data: { mime_type: string; data: string } };

async function imagePart(src: string): Promise<Part | null> {
  const m = src.match(/^data:([^;]+);base64,(.+)$/);
  if (m) return { inline_data: { mime_type: m[1]!, data: m[2]! } };
  if (!/^https:\/\//.test(src)) return null;
  try {
    const r = await fetch(src, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf.length > 4_000_000) return null;
    let bin = "";
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { inline_data: { mime_type: r.headers.get("content-type")?.split(";")[0] || "image/jpeg", data: btoa(bin) } };
  } catch { return null; }
}

async function call(body: unknown, timeoutMs: number): Promise<string> {
  const key = process.env["GOOGLE_API_KEY"];
  if (!key) throw new GeminiError(0, "GOOGLE_API_KEY is not set");
  const res = await fetch(`${BASE}/${GEMINI_MODEL}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const t = await res.text();
    console.error(`[gemini] [${res.status}]: ${t.slice(0, 500)}`);
    throw new GeminiError(res.status, `Gemini failed [${res.status}]: ${t.slice(0, 300)}`);
  }
  const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  return (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
}

/** Structured JSON answer, optionally reading images (data URLs or https links). */
export async function geminiJson<T = unknown>(o: { system?: string; text: string; images?: string[]; schema: object; timeoutMs?: number }): Promise<T> {
  const imgs = (await Promise.all((o.images ?? []).map(imagePart))).filter((p): p is Part => !!p);
  const text = await call({
    ...(o.system ? { systemInstruction: { parts: [{ text: o.system }] } } : {}),
    contents: [{ role: "user", parts: [{ text: o.text }, ...imgs] }],
    generationConfig: { responseMimeType: "application/json", responseJsonSchema: o.schema, temperature: 0.1 },
  }, o.timeoutMs ?? 60000);
  return JSON.parse(text) as T;
}

/** Free-text answer grounded with Google Search. */
export async function geminiSearch(prompt: string, timeoutMs = 45000): Promise<string> {
  return call({ contents: [{ role: "user", parts: [{ text: prompt }] }], tools: [{ google_search: {} }] }, timeoutMs);
}
