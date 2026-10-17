// Shared auth for the public REST API (/api/public/v1/*): verifies a personal
// API key (Bearer ftqc_...) against its stored SHA-256 hash and returns the
// key owner's user id. Loaded dynamically inside route handlers only.

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function apiKeyUserId(request: Request): Promise<string | null> {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(ftqc_[a-f0-9]{48})$/i.exec(header.trim());
  if (!match) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("api_keys")
    .select("id, user_id")
    .eq("key_hash", await sha256Hex(match[1].toLowerCase()))
    .is("revoked_at", null)
    .maybeSingle();
  if (error || !data) return null;
  await supabaseAdmin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  return data.user_id;
}

export function unauthorized() {
  return Response.json(
    { error: "Missing or invalid API key. Send 'Authorization: Bearer ftqc_…'." },
    { status: 401 },
  );
}
