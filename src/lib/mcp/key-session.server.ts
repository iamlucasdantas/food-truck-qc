// Turns a verified API key owner into a real, short-lived session token so MCP
// tools run as that user: RLS, has_role() and auth.uid() in DB rules all apply
// exactly as with OAuth. No email is sent (admin generateLink only returns a hash).
import { createClient } from "@supabase/supabase-js";
import type { KeyIdentity } from "./identity";

const cache = new Map<string, { id: KeyIdentity; exp: number }>();

export async function sessionForUser(userId: string): Promise<KeyIdentity | null> {
  const hit = cache.get(userId);
  if (hit && hit.exp > Date.now() + 120_000) return hit.id;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: u } = await supabaseAdmin.auth.admin.getUserById(userId);
  const email = u?.user?.email;
  if (!email) return null;
  const { data: link, error } = await supabaseAdmin.auth.admin.generateLink({ type: "magiclink", email });
  const hash = link?.properties?.hashed_token;
  if (error || !hash) return null;
  const url = process.env["SUPABASE_URL"]!, key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  const anon = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: v } = await anon.auth.verifyOtp({ type: "magiclink", token_hash: hash });
  const s = v?.session;
  if (!s || s.user.id !== userId) return null;
  const id = { token: s.access_token, userId };
  cache.set(userId, { id, exp: (s.expires_at ?? 0) * 1000 });
  return id;
}
