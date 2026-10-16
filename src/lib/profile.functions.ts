import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const exportMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const results = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId),
      supabase.from("profile_settings").select("*").eq("user_id", userId),
      supabase.from("profile_trucks").select("*").eq("user_id", userId),
      supabase.from("favorites").select("*").eq("user_id", userId),
      supabase.from("claims").select("*").eq("user_id", userId),
      supabase.from("businesses").select("*").eq("owner_id", userId),
      supabase.from("trucks").select("*").or(`claimed_by.eq.${userId},created_by.eq.${userId}`),
    ]);
    if (results.some(r => r.error)) throw new Error("Couldn't export your data. Please try again.");
    return { exported_at: new Date().toISOString(), data: Object.fromEntries(["profiles", "profile_settings", "profile_trucks", "favorites", "claims", "businesses", "trucks"].map((key, i) => [key, results[i]?.data ?? []])) };
  });