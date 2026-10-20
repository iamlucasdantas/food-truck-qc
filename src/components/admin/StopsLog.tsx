import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, CalendarX } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { chicagoDate } from "@/data/trucks";
import { inDateRange, stopStatus, toCsv, type LogStatus } from "@/data/stop-drafts";
import { EmptyState, StatusPill } from "./ui";
import { SectionHeader } from "./AdminShell";

const TONE: Record<LogStatus, "success" | "neutral" | "warning" | "danger"> = { live: "success", past: "neutral", upcoming: "warning", cancelled: "danger" };

/** Every stop any truck has made or scheduled, filterable by Chicago date range, truck/venue, source and status. */
export function StopsLog() {
  const today = chicagoDate();
  const [from, setFrom] = useState(() => chicagoDate(new Date(Date.now() - 30 * 864e5)));
  const [to, setTo] = useState(today);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<LogStatus | "">("");
  const [source, setSource] = useState("");
  const { data = [], isLoading } = useQuery({
    queryKey: ["admin", "stops-log", from, to],
    queryFn: async () => {
      let qq = supabase.from("stops").select("id,truck_id,venue_name,address,city,starts_at,ends_at,cancelled,source,trucks(name)").order("starts_at", { ascending: false }).limit(3000);
      if (from) qq = qq.gte("ends_at", new Date(`${from}T00:00:00-06:00`).toISOString());
      if (to) qq = qq.lte("starts_at", new Date(`${to}T23:59:59-05:00`).toISOString());
      return (await qq).data ?? [];
    },
  });
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return data.filter((s) => inDateRange(s, from, to) && (!status || stopStatus(s) === status) && (!source || s.source === source)
      && (!n || `${s.trucks?.name ?? ""} ${s.venue_name} ${s.address ?? ""} ${s.city}`.toLowerCase().includes(n)));
  }, [data, q, status, source, from, to]);
  const sources = [...new Set(data.map((s) => s.source))].sort();
  const fmt = (iso: string) => new Date(iso).toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  const exportCsv = () => {
    const csv = toCsv([["truck", "venue", "address", "city", "starts (Central)", "ends (Central)", "status", "source"],
      ...rows.map((s) => [s.trucks?.name ?? s.truck_id, s.venue_name, s.address, s.city, fmt(s.starts_at), fmt(s.ends_at), stopStatus(s), s.source])]);
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = `stops-${from}-to-${to}.csv`; a.click();
  };
  return (
    <>
      <SectionHeader title="Stops log" description="Every stop trucks have made or scheduled. Times in Central." />
      <div className="mb-3 flex flex-wrap items-end gap-2 text-sm">
        <label className="grid gap-1">From<input type="date" className="field" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="grid gap-1">To<input type="date" className="field" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <label className="grid flex-1 gap-1">Truck, venue or city<input className="field" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" /></label>
        <label className="grid gap-1">Status<select className="field" value={status} onChange={(e) => setStatus(e.target.value as LogStatus | "")}><option value="">All</option><option value="past">Past</option><option value="live">Live</option><option value="upcoming">Upcoming</option><option value="cancelled">Cancelled</option></select></label>
        <label className="grid gap-1">Source<select className="field" value={source} onChange={(e) => setSource(e.target.value)}><option value="">All</option>{sources.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
        <button onClick={exportCsv} disabled={!rows.length} className="chip"><Download className="h-4 w-4" />CSV</button>
      </div>
      <p className="mb-2 text-sm text-muted-foreground">{isLoading ? "Loading…" : `${rows.length} stops`}</p>
      {!isLoading && !rows.length ? <EmptyState icon={CalendarX} title="No stops in this range" hint="Change the dates or filters." /> : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase text-muted-foreground"><tr><th className="p-2">When</th><th className="p-2">Truck</th><th className="p-2">Venue</th><th className="p-2">Source</th><th className="p-2">Status</th></tr></thead>
            <tbody className="divide-y divide-border">
              {rows.slice(0, 500).map((s) => (
                <tr key={s.id}>
                  <td className="whitespace-nowrap p-2">{fmt(s.starts_at)}</td>
                  <td className="p-2 font-medium">{s.trucks?.name ?? s.truck_id}</td>
                  <td className="p-2">{s.venue_name}<span className="block text-xs text-muted-foreground">{s.address ?? s.city}</span></td>
                  <td className="p-2 text-xs">{s.source}</td>
                  <td className="p-2"><StatusPill tone={TONE[stopStatus(s)]}>{stopStatus(s)}</StatusPill></td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 500 && <p className="p-2 text-xs text-muted-foreground">Showing first 500 — export CSV for all {rows.length}.</p>}
        </div>
      )}
    </>
  );
}
