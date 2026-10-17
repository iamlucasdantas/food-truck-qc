import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Stop, Truck } from "@/data/trucks";
import { expandSeries, type Series } from "@/data/schedule";
import { expandGoogleHours, googleHours } from '@/data/google-hours';

export function useTrucks() {
  return useQuery({
    queryKey: ["trucks"],
    queryFn: async (): Promise<Truck[]> => {
      const { data, error } = await supabase.from("trucks").select("*").eq("status", "active").eq("is_food_truck", true).order("name");
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
      if (!from || !to) return [];
      let q = supabase.from("stops").select("*").eq("cancelled", false)
        .lt("starts_at", to.toISOString()).gt("ends_at", from.toISOString())
        .order("starts_at").limit(1000);
      if (truckIds) q = q.in("truck_id", truckIds);
      let sq = supabase.from("stop_series").select("*").lt("start_date", to.toISOString().slice(0, 10))
        .or(`end_date.is.null,end_date.gte.${new Date(from.getTime() - 864e5).toISOString().slice(0, 10)}`);
      if (truckIds) sq = sq.in("truck_id", truckIds);
      let tq = supabase.from('trucks').select('id,name,is_food_truck,base_address,base_lat,base_lng,google_regular_hours,google_place_id,google_hours_updated_at').eq('status', 'active').eq('is_food_truck', true).is('deleted_at', null);
      if (truckIds) tq = tq.in('id', truckIds);
      const [{ data, error }, { data: series }, { data: hoursTrucks, error: hoursError }] = await Promise.all([q, sq, tq]);
      if (error) throw error;
      if (hoursError) throw hoursError;
      const timed = new Set((hoursTrucks ?? []).filter(t => googleHours(t.google_regular_hours)?.periods.length).map(t => t.id));
      return [...data.filter(s => s.source !== 'apify_maps' || !timed.has(s.truck_id)), ...expandSeries((series ?? []) as Series[], from, to), ...expandGoogleHours(hoursTrucks ?? [], from, to)].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
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
      .on("postgres_changes", { event: "*", schema: "public", table: "stop_series" }, () => {
        void qc.invalidateQueries({ queryKey: ["stops"] });
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [qc]);
}
