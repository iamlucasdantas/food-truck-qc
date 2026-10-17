import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { cleanAgentParams, isBlankParam, type KeyStatus } from "@/data/agent-params";

// Shared helpers for the read-only HighLevel chat/voice agent API (x-api-key or Bearer auth, CORS, public data only).
export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "x-api-key, authorization, content-type",
};

export { groupStops } from "@/data/trucks";
export const json = (body: unknown, status = 200) => Response.json(body, { status, headers: CORS });
export const preflight = () => new Response(null, { status: 204, headers: CORS });

async function sha(s: string) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
}
async function same(a0: string, b0: string) {
  const [a, b] = await Promise.all([sha(a0), sha(b0)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

/** Checks x-api-key, then Authorization: Bearer, against CHAT_AGENT_API_KEY (constant-time). */
export async function keyStatus(request: Request): Promise<KeyStatus> {
  const expected = process.env["CHAT_AGENT_API_KEY"];
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? null;
  const candidates = [request.headers.get("x-api-key")?.trim() ?? null, bearer].filter((v): v is string => !!v);
  if (!candidates.length) return "missing";
  if (expected) for (const c of candidates) if (await same(c, expected)) return "matched";
  return candidates.every((c) => isBlankParam(c)) ? "placeholder" : "mismatch";
}
export async function authorized(request: Request) { return (await keyStatus(request)) === "matched"; }

export const unauthorized = () => json({ error: "unauthorized" }, 401);

export const publicClient = () =>
  createClient<Database>(process.env["SUPABASE_URL"]!, process.env["SUPABASE_PUBLISHABLE_KEY"]!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

/** Query string merged with a JSON/form body (POST); body wins. */
async function readParams(request: Request): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = Object.fromEntries(new URL(request.url).searchParams);
  if (request.method === "POST") {
    try {
      const text = await request.text();
      if (text.trim()) {
        let body: unknown;
        try { body = JSON.parse(text); } catch { body = Object.fromEntries(new URLSearchParams(text)); }
        if (body && typeof body === "object" && !Array.isArray(body)) {
          const b = body as Record<string, unknown>;
          const inner = b["params"] ?? b["parameters"] ?? b["arguments"];
          Object.assign(out, b, inner && typeof inner === "object" ? inner : {});
        }
      }
    } catch { /* unreadable body = no params */ }
  }
  return out;
}

async function logCall(row: { endpoint: string; method: string; status: number; auth: KeyStatus; params: Record<string, unknown>; error: string | null; ua: string | null }) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const safe: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row.params)) if (!/key|token|auth|secret|password/i.test(k)) safe[k] = typeof v === "string" ? v.slice(0, 200) : v;
    await supabaseAdmin.from("chat_api_logs").insert({
      endpoint: row.endpoint, method: row.method, status: row.status, auth_ok: row.auth === "matched", auth_detail: row.auth,
      params: safe as never, error: row.error, user_agent: row.ua?.slice(0, 300) ?? null,
    });
  } catch (e) { console.error("chat_api_logs insert failed", e); }
}

/** One handler for GET and POST on both agent endpoints: auth, lenient params, search, log. */
export async function handleAgentRequest(request: Request, endpoint: string, upcoming: boolean) {
  const ua = request.headers.get("user-agent");
  const raw = await readParams(request);
  const auth = await keyStatus(request);
  const finish = async (body: unknown, status: number, error: string | null) => {
    await logCall({ endpoint, method: request.method, status, auth, params: raw, error, ua });
    return json(body, status);
  };
  if (auth !== "matched") return finish({ error: "unauthorized" }, 401, `key ${auth}`);
  try {
    const { SearchQuery, runSearch, agentResponse } = await import("@/lib/api-search.server");
    const p = SearchQuery.safeParse(cleanAgentParams(raw));
    if (!p.success) return finish({ error: "invalid query" }, 400, p.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    const r = await runSearch(p.data, { days: 3, limit: 10, upcoming });
    if ("error" in r) return finish(r, r.error === "location not found" ? 400 : 500, r.error);
    return finish(agentResponse(r, upcoming), 200, null);
  } catch (e) {
    return finish({ error: "server error" }, 500, e instanceof Error ? e.message : String(e));
  }
}

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
