import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { summarizeUsage } from "@/data/usage";
import { Skeleton } from "@/components/ui/skeleton";

/** Usage statistics from first-party events (collected from 2026-10-20 onward) plus favorites and agent API calls. */
export function UsageStats() {
  const [days, setDays] = useState(7);
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "usage", days],
    queryFn: async () => {
      const since = new Date(Date.now() - days * 864e5).toISOString();
      const [ev, trucks, fav, api] = await Promise.all([
        supabase.from("app_events").select("kind,truck_id,venue,path,visitor").gte("created_at", since).limit(20000),
        supabase.from("trucks").select("id,name"),
        supabase.from("favorites").select("id", { count: "exact", head: true }).gte("created_at", since),
        supabase.from("chat_api_logs").select("id", { count: "exact", head: true }).gte("created_at", since),
      ]);
      return { ...summarizeUsage(ev.data ?? []), names: new Map((trucks.data ?? []).map((t) => [t.id, t.name])), favorites: fav.count ?? 0, api: api.count ?? 0 };
    },
  });
  return (
    <section className="mt-6 rounded-xl border border-border bg-card p-4 shadow-pop">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-semibold">Usage</h2>
        <select className="field w-auto" value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Period">
          <option value={1}>Last 24 hours</option><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option>
        </select>
      </div>
      {isLoading || !data ? <Skeleton className="h-40" /> : (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {([["Visitors", data.visitors], ["Page views", data.pageViews], ["Truck page views", data.truckViews], ["Direction clicks", data.directions], ["New favorites", data.favorites], ["Agent API calls", data.api]] as const).map(([k, v]) => (
              <div key={k} className="rounded-lg bg-muted p-3"><dt className="text-xs text-muted-foreground">{k}</dt><dd className="text-xl font-bold tabular-nums">{v}</dd></div>
            ))}
          </dl>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Top trucks (page views)</h3>
              <ol className="space-y-1 text-sm">{data.topTrucks.length ? data.topTrucks.map(([id, n]) => <li key={id} className="flex justify-between"><span className="truncate">{data.names.get(id) ?? id}</span><span className="tabular-nums">{n}</span></li>) : <li className="text-muted-foreground">No data yet</li>}</ol>
            </div>
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">People heading to each location (direction clicks)</h3>
              <ol className="space-y-1 text-sm">{data.topVenues.length ? data.topVenues.map(([v, n]) => <li key={v} className="flex justify-between"><span className="truncate">{v}</span><span className="tabular-nums">{n}</span></li>) : <li className="text-muted-foreground">No data yet</li>}</ol>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Counted on this site from Oct 20, 2026. Admin pages aren't counted.</p>
        </>
      )}
    </section>
  );
}
