import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export function useFavorites() {
  const { user, openAuth } = useAuth();
  const qc = useQueryClient();
  const uid = user?.id;
  const { data = [] } = useQuery({
    queryKey: ["me", "favorites", uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase.from("favorites").select("truck_id");
      if (error) throw error;
      return data.map((r) => r.truck_id);
    },
  });
  const ids = uid ? data : [];

  const toggle = useCallback(async (truckId: string) => {
    if (!uid) return openAuth("Sign in to save your favorite trucks.");
    const key = ["me", "favorites", uid];
    const has = ids.includes(truckId);
    qc.setQueryData<string[]>(key, has ? ids.filter((x) => x !== truckId) : [...ids, truckId]);
    const { error } = has
      ? await supabase.from("favorites").delete().eq("user_id", uid).eq("truck_id", truckId)
      : await supabase.from("favorites").insert({ user_id: uid, truck_id: truckId });
    if (error) toast.error(error.message);
    void qc.invalidateQueries({ queryKey: key });
  }, [uid, ids, openAuth, qc]);

  const isFav = useCallback((id: string) => ids.includes(id), [ids]);
  return { ids, toggle, isFav };
}
