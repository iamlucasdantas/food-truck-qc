import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export const createApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ label: z.string().trim().min(1).max(60) }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    const key = "ftqc_" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    const { error } = await supabase.from("api_keys").insert({
      user_id: userId,
      label: data.label,
      key_hash: await sha256Hex(key),
      key_prefix: key.slice(0, 13),
    });
    if (error) throw new Error("Couldn't create the API key. Please try again.");
    // The full key is returned once and never stored — only its hash is kept.
    return { key };
  });

export const listApiKeys = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("api_keys")
      .select("id, label, key_prefix, created_at, last_used_at, revoked_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error("Couldn't load your API keys.");
    return data ?? [];
  });

export const revokeApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    // RLS scopes the delete to the caller's own keys.
    const { error } = await context.supabase.from("api_keys").delete().eq("id", data.id);
    if (error) throw new Error("Couldn't revoke the API key. Please try again.");
    return { ok: true };
  });
