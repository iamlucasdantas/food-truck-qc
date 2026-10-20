import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { StatusPill } from "./ui";

type Alert = { truckId: string; name: string; missing: number; review: number; next: string };

/** Trucks whose upcoming stops (or stops waiting for review) have no address. Click opens the truck's Stops tab. */
export function StopAlerts({ open }: { open: (truckId: string) => void }) {
  const { data = [] } = useQuery({
    queryKey: ["admin", "stop-alerts"],
    queryFn: async (): Promise<Alert[]> => {
      const now = new Date().toISOString();
      const [s, g] = await Promise.all([
        supabase.from("stops").select("truck_id,starts_at,address,trucks(name)").gte("ends_at", now).eq("cancelled", false).or("address.is.null,address.eq.").limit(500),
        supabase.from("suggested_stops").select("truck_id,starts_at,address,lat,needs_address_check,trucks(name)").eq("status", "pending").gte("ends_at", now).or("address.is.null,address.eq.,lat.is.null,needs_address_check.eq.true").limit(500),
      ]);
      const map = new Map<string, Alert>();
      const add = (r: { truck_id: string; starts_at: string; trucks: { name: string } | null }, k: "missing" | "review") => {
        const a = map.get(r.truck_id) ?? { truckId: r.truck_id, name: r.trucks?.name ?? r.truck_id, missing: 0, review: 0, next: r.starts_at };
        a[k]++; if (r.starts_at < a.next) a.next = r.starts_at; map.set(r.truck_id, a);
      };
      (s.data ?? []).forEach((r) => add(r, "missing"));
      (g.data ?? []).forEach((r) => add(r, "review"));
      return [...map.values()].sort((a, b) => a.next.localeCompare(b.next));
    },
  });
  if (!data.length) return null;
  return (
    <section className="mb-6">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><AlertTriangle className="h-4 w-4 text-destructive" />Stops missing an address ({data.length})</h3>
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-pop">
        {data.map((a) => (
          <li key={a.truckId}>
            <button onClick={() => open(a.truckId)} className="flex w-full items-center gap-3 p-4 text-left hover:bg-muted">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{a.name}</span>
                <span className="block text-sm text-muted-foreground">
                  Next {new Date(a.next).toLocaleString([], { timeZone: "America/Chicago", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </span>
              </span>
              {a.missing > 0 && <StatusPill tone="danger">{a.missing} without address</StatusPill>}
              {a.review > 0 && <StatusPill tone="warning">{a.review} to review</StatusPill>}
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
