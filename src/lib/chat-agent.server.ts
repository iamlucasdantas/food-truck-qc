import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

// Shared helpers for the read-only HighLevel chat-agent API (x-api-key auth, CORS, public data only).
export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "x-api-key, content-type",
};

export { groupStops } from "@/data/trucks";
export const json = (body: unknown, status = 200) => Response.json(body, { status, headers: CORS });
export const preflight = () => new Response(null, { status: 204, headers: CORS });

async function sha(s: string) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
}

/** Constant-time comparison of the x-api-key header against CHAT_AGENT_API_KEY. */
export async function authorized(request: Request) {
  const expected = process.env["CHAT_AGENT_API_KEY"];
  const got = request.headers.get("x-api-key");
  if (!expected || !got) return false;
  const [a, b] = await Promise.all([sha(got), sha(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export const unauthorized = () => json({ error: "unauthorized" }, 401);

export const publicClient = () =>
  createClient<Database>(process.env["SUPABASE_URL"]!, process.env["SUPABASE_PUBLISHABLE_KEY"]!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

/** "4115 Kennedy Dr, East Moline, IL 61244" → "East Moline". */
export function cityFromAddress(addr: string | null | undefined): string | null {
  if (!addr) return null;
  const parts = addr.split(",").map((p) => p.trim()).filter(Boolean);
  const i = parts.findIndex((p) => /^[A-Z]{2}(\s+\d{5}(-\d{4})?)?$/.test(p));
  if (i > 0) return parts[i - 1]!;
  return parts.length >= 2 ? parts[parts.length - 2]! : null;
}

export const chicago = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Chicago", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });

const money = (p: unknown) => (typeof p === "number" && p > 0 ? ` $${Number.isInteger(p) ? p : p.toFixed(2)}` : "");

/** Up to 5 "Name $price" strings from published menu sections, else the legacy menu list. */
export function menuHighlights(sections: unknown, legacy: unknown): string[] {
  const out: string[] = [];
  if (Array.isArray(sections)) {
    for (const s of sections as { items?: { name?: string; price?: unknown }[] }[])
      for (const it of s.items ?? []) if (it?.name) out.push(`${it.name}${money(it.price)}`);
  }
  if (!out.length && Array.isArray(legacy)) {
    for (const it of legacy as { item?: string; price?: unknown }[]) if (it?.item) out.push(`${it.item}${money(it.price)}`);
  }
  return out.slice(0, 5);
}
