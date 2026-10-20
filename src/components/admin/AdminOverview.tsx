import { UsageStats } from "./UsageStats";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Truck, Radio, Clock, BadgeCheck, CalendarDays, ScanSearch, MapPinOff, MessageSquareText, ArrowUpRight, ArrowDownRight, Activity, CheckCircle2, Inbox } from "lucide-react";
import type { ComponentType } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, EmptyState, SectionHeader, StatusPill, statusTone } from "./ui";
import { Skeleton } from "@/components/ui/skeleton";

const DAY = 864e5;
const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 6e4);
  if (m < 1) return "just now"; if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
};

function useOverview() {
  return useQuery({
    queryKey: ["admin", "overview"],
    queryFn: async () => {
      const now = new Date();
      const start = new Date(now); start.setHours(0, 0, 0, 0);
      const end = new Date(start.getTime() + DAY);
      const wk = new Date(now.getTime() - 7 * DAY).toISOString();
      const wk2 = new Date(now.getTime() - 14 * DAY).toISOString();
      const iso = now.toISOString();
      const head = { count: "exact" as const, head: true };
      const [total, newWk, newPrev, live, pending, claims, claimsWk, today, lastWkDay, sugg, addr, scan, pendList, claimList, suggList, dels, runs, newTrucks] = await Promise.all([
        supabase.from("trucks").select("id", head).eq("status", "active").is("deleted_at", null),
        supabase.from("trucks").select("id", head).is("deleted_at", null).gte("created_at", wk),
        supabase.from("trucks").select("id", head).is("deleted_at", null).gte("created_at", wk2).lt("created_at", wk),
        supabase.from("stops").select("id", head).eq("cancelled", false).neq("source", "apify_maps").lte("starts_at", iso).gt("ends_at", iso),
        supabase.from("trucks").select("id", head).eq("status", "pending").is("deleted_at", null),
        supabase.from("claims").select("id", head).eq("status", "pending"),
        supabase.from("claims").select("id", head).gte("created_at", wk),
        supabase.from("stops").select("id", head).eq("cancelled", false).neq("source", "apify_maps").gte("starts_at", start.toISOString()).lt("starts_at", end.toISOString()),
        supabase.from("stops").select("id", head).eq("cancelled", false).neq("source", "apify_maps").gte("starts_at", new Date(start.getTime() - 7 * DAY).toISOString()).lt("starts_at", new Date(end.getTime() - 7 * DAY).toISOString()),
        supabase.from("suggested_stops").select("id", head).eq("status", "pending"),
        supabase.from("suggested_stops").select("id", head).eq("status", "pending").eq("needs_address_check", true),
        supabase.from("ingestion_runs").select("status,started_at,finished_at,items_created").eq("source", "apify_facebook").order("started_at", { ascending: false }).limit(1),
        supabase.from("trucks").select("id,name,created_at,source").eq("status", "pending").is("deleted_at", null).order("created_at").limit(5),
        supabase.from("claims").select("id,created_at,user_email,trucks(name)").eq("status", "pending").order("created_at").limit(5),
        supabase.from("suggested_stops").select("id,venue_name,starts_at,needs_address_check,truck_id").eq("status", "pending").order("starts_at").limit(5),
        supabase.from("truck_deletions").select("id,created_at,truck_name,action,actor_email").order("created_at", { ascending: false }).limit(8),
        supabase.from("ingestion_runs").select("id,started_at,source,status,items_created").order("started_at", { ascending: false }).limit(8),
        supabase.from("trucks").select("id,name,created_at,source").order("created_at", { ascending: false }).limit(8),
      ]);
      const activity = [
        ...(dels.data ?? []).map((d) => ({ id: `d${d.id}`, at: d.created_at, icon: "del" as const, text: `${d.truck_name} ${d.action}${d.actor_email ? ` by ${d.actor_email}` : ""}` })),
        ...(runs.data ?? []).map((r) => ({ id: `r${r.id}`, at: r.started_at, icon: "run" as const, text: `${r.source.replace("apify_", "")} import ${r.status} · ${r.items_created} added` })),
        ...(newTrucks.data ?? []).map((t) => ({ id: `t${t.id}`, at: t.created_at, icon: "truck" as const, text: `${t.name} added (${t.source})` })),
      ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 12);
      return {
        total: total.count ?? 0, newWk: newWk.count ?? 0, newPrev: newPrev.count ?? 0, live: live.count ?? 0,
        pending: pending.count ?? 0, claims: claims.count ?? 0, claimsWk: claimsWk.count ?? 0,
        today: today.count ?? 0, lastWkDay: lastWkDay.count ?? 0, sugg: sugg.count ?? 0, addr: addr.count ?? 0,
        scan: scan.data?.[0] ?? null, pendList: pendList.data ?? [], claimList: claimList.data ?? [], suggList: suggList.data ?? [], activity,
      };
    },
    refetchInterval: 60_000,
  });
}

function Trend({ now, prev, label }: { now: number; prev: number; label: string }) {
  const d = now - prev;
  const Icon = d >= 0 ? ArrowUpRight : ArrowDownRight;
  return <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground"><Icon className="h-3.5 w-3.5" aria-hidden />{d >= 0 ? "+" : ""}{d} {label}</span>;
}

function Kpi({ icon: Icon, label, value, foot, onClick }: { icon: ComponentType<{ className?: string }>; label: string; value: React.ReactNode; foot?: React.ReactNode; onClick?: () => void }) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent"><Icon className="h-4 w-4 text-foreground" /></span>
      </div>
      <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
      <div className="mt-1 min-h-4">{foot}</div>
    </>
  );
  return onClick
    ? <button onClick={onClick} className="rounded-xl border border-border bg-card p-4 text-left shadow-pop transition-shadow hover:shadow-pop-sm hover:ring-1 hover:ring-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{body}</button>
    : <div className="rounded-xl border border-border bg-card p-4 shadow-pop">{body}</div>;
}

export function AdminOverview() {
  const navigate = useNavigate({ from: "/admin" });
  const go = (search: Record<string, string | undefined>) => void navigate({ search });
  const { data: d, isLoading } = useOverview();

  return (
    <>
      <SectionHeader title="Overview" description="What needs you today across trucks, claims and imports." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {isLoading || !d ? Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-[124px] rounded-xl" />) : (
          <>
            <Kpi icon={Truck} label="Active trucks" value={d.total} foot={<Trend now={d.newWk} prev={d.newPrev} label="new vs last wk" />} onClick={() => go({ tab: "trucks" })} />
            <Kpi icon={Radio} label="Live now" value={d.live} foot={<span className="text-xs text-muted-foreground">serving now (excl. map hours)</span>} />
            <Kpi icon={Clock} label="Pending approvals" value={d.pending} foot={<span className="text-xs text-muted-foreground">trucks to review</span>} onClick={() => go({ tab: "pending" })} />
            <Kpi icon={BadgeCheck} label="Open claims" value={d.claims} foot={<span className="text-xs text-muted-foreground">{d.claimsWk} this week</span>} onClick={() => go({ tab: "claims" })} />
            <Kpi icon={CalendarDays} label="Stops today" value={d.today} foot={<Trend now={d.today} prev={d.lastWkDay} label="vs last week" />} />
            <Kpi icon={ScanSearch} label="Facebook scan" onClick={() => go({ tab: "facebook" })}
              value={<span className="text-lg">{d.scan ? <StatusPill tone={statusTone(d.scan.status)}>{d.scan.status}</StatusPill> : "Never run"}</span>}
              foot={d.scan && <span className="text-xs text-muted-foreground">{ago(d.scan.started_at)} · {d.scan.items_created} stops</span>} />
          </>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">Needs your attention</h2>
            {d && <span className="text-xs text-muted-foreground">{d.pending + d.claims + d.sugg} items</span>}
          </div>
          {isLoading || !d ? <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</div>
            : d.pending + d.claims + d.sugg === 0 ? <div className="p-4"><EmptyState icon={CheckCircle2} title="All caught up" hint="No trucks, claims or suggested stops are waiting for review." /></div>
            : (
              <ul className="divide-y divide-border">
                {d.pendList.map((t) => (
                  <Row key={t.id} icon={Clock} title={t.name} meta={`Pending truck · ${t.source} · ${ago(t.created_at)}`} onClick={() => go({ tab: "pending" })} />
                ))}
                {d.claimList.map((c) => (
                  <Row key={c.id} icon={BadgeCheck} title={(c.trucks as { name: string } | null)?.name ?? "Claim"} meta={`Claim by ${c.user_email ?? "unknown"} · ${ago(c.created_at)}`} onClick={() => go({ tab: "claims" })} />
                ))}
                {d.suggList.map((s) => (
                  <Row key={s.id} icon={s.needs_address_check ? MapPinOff : MessageSquareText} title={s.venue_name || "Suggested stop"}
                    meta={`${s.needs_address_check ? "Check address" : "Stop to review"} · ${new Date(s.starts_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`}
                    tag={s.needs_address_check ? <StatusPill tone="warning">Check address</StatusPill> : undefined} onClick={() => go({ tab: "facebook" })} />
                ))}
                {d.addr > 0 && <li className="px-4 py-2 text-xs text-muted-foreground">{d.addr} suggested stop{d.addr === 1 ? "" : "s"} need an address check in total.</li>}
              </ul>
            )}
        </Card>

        <Card>
          <div className="flex items-center gap-2 border-b border-border px-4 py-3"><Activity className="h-4 w-4 text-muted-foreground" /><h2 className="text-sm font-semibold">Recent activity</h2></div>
          {isLoading || !d ? <div className="space-y-2 p-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-8" />)}</div>
            : !d.activity.length ? <div className="p-4"><EmptyState icon={Inbox} title="No activity yet" /></div>
            : (
              <ol className="relative space-y-3 p-4">
                {d.activity.map((a) => (
                  <li key={a.id} className="grid grid-cols-[auto_minmax(0,1fr)] gap-3">
                    <span className={`mt-1.5 h-2 w-2 rounded-full ${a.icon === "del" ? "bg-destructive" : a.icon === "run" ? "bg-pin-today" : "bg-pin-open"}`} aria-hidden />
                    <div className="min-w-0"><p className="truncate text-sm">{a.text}</p><p className="text-xs text-muted-foreground">{ago(a.at)}</p></div>
                  </li>
                ))}
              </ol>
            )}
        </Card>
      </div>
      <UsageStats />
    </>
  );
}

function Row({ icon: Icon, title, meta, tag, onClick }: { icon: ComponentType<{ className?: string }>; title: string; meta: string; tag?: React.ReactNode; onClick: () => void }) {
  return (
    <li>
      <button onClick={onClick} className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted focus-visible:outline-none">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-muted"><Icon className="h-4 w-4 text-muted-foreground" /></span>
        <span className="min-w-0"><span className="block truncate text-sm font-medium">{title}</span><span className="block truncate text-xs text-muted-foreground">{meta}</span></span>
        {tag ?? <ArrowUpRight className="h-4 w-4 text-muted-foreground" aria-hidden />}
      </button>
    </li>
  );
}
