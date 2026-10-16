import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

const PENDING_KEY = "ftqc:pendingFavs";
const EVT = "ftqc:pending-favs";

function readPending(): string[] {
  try { return JSON.parse(localStorage.getItem(PENDING_KEY) ?? "[]") as string[]; } catch { return []; }
}
function writePending(ids: string[]) {
  localStorage.setItem(PENDING_KEY, JSON.stringify([...new Set(ids)]));
  window.dispatchEvent(new Event(EVT));
}

export function useFavorites() {
  const { user, openAuth } = useAuth();
  const qc = useQueryClient();
  const uid = user?.id;
  const key = ["me", "favorites", uid];
  const { data = [], isLoading } = useQuery({
    queryKey: key,
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase.from("favorites").select("truck_id");
      if (error) throw error;
      return data.map((r) => r.truck_id);
    },
  });
  const [pending, setPending] = useState<string[]>([]);
  useEffect(() => {
    const sync = () => setPending(readPending());
    sync();
    window.addEventListener(EVT, sync);
    return () => window.removeEventListener(EVT, sync);
  }, []);
  const ids = uid ? data : pending;

  const setFav = useCallback(async (truckId: string, on: boolean) => {
    if (!uid) {
      const cur = readPending();
      writePending(on ? [...cur, truckId] : cur.filter((x) => x !== truckId));
      return;
    }
    const k = ["me", "favorites", uid];
    const cur = qc.getQueryData<string[]>(k) ?? [];
    qc.setQueryData<string[]>(k, on ? [...new Set([...cur, truckId])] : cur.filter((x) => x !== truckId));
    const { error } = on
      ? await supabase.from("favorites").upsert({ user_id: uid, truck_id: truckId }, { onConflict: "user_id,truck_id", ignoreDuplicates: true })
      : await supabase.from("favorites").delete().eq("user_id", uid).eq("truck_id", truckId);
    if (error) { toast.error("Couldn't update favorites. Please try again."); qc.setQueryData(k, cur); }
  }, [uid, qc]);

  const toggle = useCallback((truckId: string) => {
    const has = ids.includes(truckId);
    void setFav(truckId, !has);
    if (!uid && !has) { openAuth("Sign in to save your favorite trucks"); return; }
    if (has) toast("Removed from favorites", { action: { label: "Undo", onClick: () => void setFav(truckId, true) } });
    else toast.success("Saved to favorites", { action: { label: "Undo", onClick: () => void setFav(truckId, false) } });
  }, [ids, uid, setFav, openAuth]);

  const isFav = useCallback((id: string) => ids.includes(id), [ids]);
  return { ids, toggle, isFav, loading: !!uid && isLoading };
}

/** After sign-in, move hearts tapped while logged out into the database (no duplicates). */
export function FavoritesSync() {
  const { user } = useAuth();
  const qc = useQueryClient();
  useEffect(() => {
    if (!user) return;
    const pending = readPending();
    if (!pending.length) return;
    void supabase.from("favorites")
      .upsert(pending.map((truck_id) => ({ user_id: user.id, truck_id })), { onConflict: "user_id,truck_id", ignoreDuplicates: true })
      .then(({ error }) => {
        if (error) return;
        writePending([]);
        void qc.invalidateQueries({ queryKey: ["me", "favorites", user.id] });
        toast.success(pending.length === 1 ? "Your favorite truck was saved" : `${pending.length} favorite trucks saved`);
      });
  }, [user, qc]);
  return null;
}
