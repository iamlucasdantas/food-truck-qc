import { createClient } from "@supabase/supabase-js";
import type { ToolContext } from "@lovable.dev/mcp-js";
import type { Database } from "@/integrations/supabase/types";

type RuntimeGlobals = typeof globalThis & { process?: { env?: Record<string, string | undefined> } };

function env(names: readonly string[]): string | undefined {
  const e = (globalThis as RuntimeGlobals).process?.env;
  for (const n of names) { const v = e?.[n]?.trim(); if (v) return v; }
  return undefined;
}

function url() {
  const u = env(["SUPABASE_URL", "VITE_SUPABASE_URL"]);
  if (!u) throw new Error("SUPABASE_URL is required");
  return u;
}
function key() {
  const k = env(["SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY"]);
  if (!k) throw new Error("SUPABASE_PUBLISHABLE_KEY is required");
  return k;
}

/** Caller-scoped client: RLS applies as the signed-in user behind the OAuth token. */
export function supabaseForUser(ctx: ToolContext) {
  const token = ctx.getToken();
  if (!token) throw new Error("supabaseForUser requires a verified OAuth token");
  return createClient<Database>(url(), key(), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
