import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Stop, Truck } from "@/data/trucks";

export function useTrucks() {
  return useQuery({
    queryKey: ["trucks"],
    queryFn: async (): Promise<Truck[]> => {
      const { data, error } = await supabase.from("trucks").select("*").eq("status", "active").order("name");
      if (error) throw error;
      return data;
    },
  });
}

/** Non-cancelled stops overlapping [from, to). */
export function useStops(from: Date | null, to: Date | null, truckIds?: string[]) {
  return useQuery({
    queryKey: ["stops", from?.toISOString(), to?.toISOString(), truckIds?.join(",")],
    enabled: !!from && !!to && (!truckIds || truckIds.length > 0),
    queryFn: async (): Promise<Stop[]> => {
      let q = supabase.from("stops").select("*").eq("cancelled", false)
        .lt("starts_at", to!.toISOString()).gt("ends_at", from!.toISOString())
        .order("starts_at").limit(1000);
      if (truckIds) q = q.in("truck_id", truckIds);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

export function groupBy<T, K extends string>(xs: T[], key: (x: T) => K) {
  const m = new Map<K, T[]>();
  for (const x of xs) { const k = key(x); m.set(k, [...(m.get(k) ?? []), x]); }
  return m;
}

export function dayBounds(d: Date) {
  const a = new Date(d); a.setHours(0, 0, 0, 0);
  const b = new Date(a); b.setDate(a.getDate() + 1);
  return [a, b] as const;
}

/** Refetch stop queries whenever any stop changes (owner check-ins, cancellations). */
export function useStopsRealtime() {
  const qc = useQueryClient();
  useEffect(() => {
    const ch = supabase.channel("stops-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "stops" }, () => {
        void qc.invalidateQueries({ queryKey: ["stops"] });
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [qc]);
}
