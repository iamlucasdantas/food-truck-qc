import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const exportMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const tables = ["profiles", "profile_settings", "profile_trucks", "favorites", "claims", "businesses", "trucks"] as const;
    const results = await Promise.all(tables.map(async table => {
      let q = supabase.from(table).select("*");
      if (table === "profiles") q = q.eq("id", userId);
      else if (table === "businesses") q = q.eq("owner_id", userId);
      else if (table === "trucks") q = q.or(`claimed_by.eq.${userId},created_by.eq.${userId}`);
      else q = q.eq("user_id", userId);
      const { data, error } = await q;
      if (error) throw new Error("Couldn't export your data. Please try again.");
      return [table, data] as const;
    }));
    return { exported_at: new Date().toISOString(), data: Object.fromEntries(results) };
  });