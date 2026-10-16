import { ClientOnly } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarPlus, ChevronLeft, ChevronRight, Link2, Plus } from "lucide-react";
import { lazy, Suspense, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fmtRange, QC_CENTER, type Stop, type Truck } from "@/data/trucks";
import { describeRule, WEEKDAYS, ymd, type Freq, type Series } from "@/data/schedule";
import { useStops } from "@/lib/queries";
import { geocode } from "@/lib/geocode";
import { listFeedEvents, saveFeedUrl } from "@/lib/calendar.functions";

const TruckMap = lazy(() => import("@/components/TruckMap"));
const hhmm = (iso: string) => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const ok = (error: { message: string } | null, msg: string) => (error ? (toast.error(error.message), false) : (toast.success(msg), true));

type Draft = {
  date: string; start: string; end: string; venue: string; address: string; note: string;
  pos: { lat: number; lng: number } | null; city: string;
  repeat: "none" | Freq; weekdays: number[]; nth: number; until: string; externalUid?: string | undefined;
};
type EditTarget = { draft: Draft; stop?: Stop | undefined; series?: Series | undefined };

export function OwnerSchedule({ truck }: { truck: Truck }) {
  const [view, setView] = useState<"month" | "week">("month");
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; });
  const [edit, setEdit] = useState<EditTarget | null>(null);

  const [from, to] = useMemo(() => {
    if (view === "week") { const b = new Date(cursor); b.setDate(b.getDate() + 7); return [cursor, b]; }
    const a = new Date(cursor.getFullYear(), cursor.getMonth(), 1); a.setDate(a.getDate() - a.getDay());
    const b = new Date(a); b.setDate(a.getDate() + 42); return [a, b];
  }, [view, cursor]);
  const { data: stops = [] } = useStops(from, to, [truck.id]);
  const { data: series = [] } = useQuery({
    queryKey: ["stops", "series", truck.id],
    queryFn: async () => ((await supabase.from("stop_series").select("*").eq("truck_id", truck.id).order("created_at")).data ?? []) as Series[],
  });
  const visible = stops.filter((s) => s.source !== "apify_maps");
  const byDay = useMemo(() => { const m = new Map<string, Stop[]>(); for (const s of visible) { const k = ymd(new Date(s.starts_at)); m.set(k, [...(m.get(k) ?? []), s]); } return m; }, [visible]);

  const blank = (date: string): Draft => ({ date, start: "11:00", end: "14:00", venue: "", address: "", note: "", pos: null, city: "", repeat: "none", weekdays: [new Date(`${date}T12:00`).getDay()], nth: 1, until: "" });
  const openStop = (s: Stop) => {
    const sr = s.series_id ? series.find((x) => x.id === s.series_id) : undefined;
    setEdit({ stop: s, series: sr, draft: { ...blank(ymd(new Date(s.starts_at))), start: hhmm(s.starts_at), end: hhmm(s.ends_at), venue: s.venue_name, address: s.address ?? "", note: s.note ?? "", pos: { lat: s.lat, lng: s.lng }, city: s.city } });
  };
  const shift = (n: number) => setCursor((c) => view === "week" ? new Date(c.getFullYear(), c.getMonth(), c.getDate() + 7 * n) : new Date(c.getFullYear(), c.getMonth() + n, 1));
  const today = ymd(new Date());
  const icsUrl = typeof window !== "undefined" ? `${window.location.origin}/api/public/calendar/${truck.id}` : "";

  const chipFor = (s: Stop) => s.source === "owner" ? (s.series_id ? "bg-accent text-accent-foreground" : "bg-primary text-primary-foreground") : "bg-muted text-muted-foreground";

  return (
    <section className="panel space-y-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold">Schedule</h2>
        <div className="flex flex-wrap gap-2">
          <div className="flex rounded-full bg-muted p-1">
            {(["month", "week"] as const).map((v) => <button key={v} onClick={() => setView(v)} className={`h-9 rounded-full px-4 text-sm font-medium ${view === v ? "bg-card shadow-pop-sm" : "text-muted-foreground"}`}>{v === "month" ? "Month" : "Week"}</button>)}
          </div>
          <button onClick={() => setEdit({ draft: blank(today) })} className="chip"><Plus className="h-4 w-4" />Add stop</button>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <button onClick={() => shift(-1)} className="chip h-11 w-11 justify-center p-0" aria-label="Previous"><ChevronLeft className="h-5 w-5" /></button>
        <span className="font-semibold">{view === "month" ? cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" }) : `${from.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${new Date(to.getTime() - 864e5).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}</span>
        <button onClick={() => shift(1)} className="chip h-11 w-11 justify-center p-0" aria-label="Next"><ChevronRight className="h-5 w-5" /></button>
      </div>

      {view === "month" ? (
        <div className="grid grid-cols-7 gap-1 text-xs">
          {WEEKDAYS.map((d) => <div key={d} className="py-1 text-center font-semibold text-muted-foreground">{d}</div>)}
          {Array.from({ length: 42 }, (_, i) => { const d = new Date(from); d.setDate(from.getDate() + i); return d; }).map((d) => {
            const k = ymd(d), list = byDay.get(k) ?? [], other = d.getMonth() !== cursor.getMonth();
            return (
              <div key={k} role="button" tabIndex={0} onClick={() => setEdit({ draft: blank(k) })} onKeyDown={(e) => e.key === "Enter" && setEdit({ draft: blank(k) })}
                className={`min-h-16 cursor-pointer rounded-lg border border-border p-1 text-left transition-colors duration-150 hover:bg-secondary sm:min-h-24 ${other ? "opacity-50" : ""}`}>
                <div className={`mb-1 grid h-6 w-6 place-items-center rounded-full font-semibold ${k === today ? "bg-primary text-primary-foreground" : ""}`}>{d.getDate()}</div>
                <div className="space-y-0.5">
                  {list.slice(0, 3).map((s) => (
                    <button key={s.id} onClick={(e) => { e.stopPropagation(); openStop(s); }} className={`block w-full truncate rounded px-1 py-0.5 text-left text-[10px] font-medium sm:text-xs ${chipFor(s)}`}>
                      <span className="hidden sm:inline">{hhmm(s.starts_at)} </span>{s.venue_name}
                    </button>
                  ))}
                  {list.length > 3 && <span className="block text-[10px] text-muted-foreground">+{list.length - 3} more</span>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {Array.from({ length: 7 }, (_, i) => { const d = new Date(from); d.setDate(from.getDate() + i); return d; }).map((d) => {
            const k = ymd(d), list = byDay.get(k) ?? [];
            return (
              <li key={k} className="flex gap-3 py-2 text-sm">
                <span className="w-24 shrink-0 pt-2 font-semibold">{d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span>
                <div className="min-w-0 flex-1 space-y-1">
                  {list.map((s) => (
                    <button key={s.id} onClick={() => openStop(s)} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left hover:bg-secondary">
                      <span className={`h-3 w-3 shrink-0 rounded-full ${chipFor(s)}`} />
                      <span className="min-w-0 flex-1 truncate">{s.venue_name} · {fmtRange(s)}{s.series_id && <span className="text-muted-foreground"> · repeats</span>}{s.source !== "owner" && <span className="text-muted-foreground"> · imported</span>}</span>
                    </button>
                  ))}
                  <button onClick={() => setEdit({ draft: blank(k) })} className="min-h-11 px-2 text-xs text-muted-foreground hover:text-foreground">+ Add</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-primary" />One-time</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-accent" />Repeating</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-muted" />Imported</span>
      </div>

      {series.length > 0 && (
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">Repeating stops</h3>
          {series.map((s) => (
            <button key={s.id} onClick={() => setEdit({ series: s, draft: { ...blank(s.start_date), start: s.start_time, end: s.end_time, venue: s.venue_name, address: s.address ?? "", note: s.note ?? "", pos: { lat: s.lat, lng: s.lng }, city: s.city, repeat: s.freq as Freq, weekdays: s.weekdays, nth: s.month_nth ?? 1, until: s.end_date ?? "" } })}
              className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg bg-secondary px-3 text-left text-sm">
              <span className="min-w-0 truncate"><b>{s.venue_name}</b> · {describeRule(s)} · {s.start_time}–{s.end_time}</span>
              <span className="text-xs text-muted-foreground">Edit</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <a href={icsUrl.replace(/^https?:/, "webcal:")} className="chip"><CalendarPlus className="h-4 w-4" />Add to my calendar</a>
        <a href={icsUrl} download={`${truck.id}.ics`} className="chip">Download .ics</a>
      </div>

      <CalendarConnect truck={truck} onImport={(d) => setEdit({ draft: d })} />

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>{edit?.stop || edit?.series ? "Edit stop" : "Add stop"}</DialogTitle></DialogHeader>
          {edit && <StopEditor key={edit.stop?.id ?? edit.series?.id ?? edit.draft.date + edit.draft.externalUid} truck={truck} target={edit} done={() => setEdit(null)} />}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function StopEditor({ truck, target, done }: { truck: Truck; target: EditTarget; done: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState<Draft>(target.draft);
  const [showMap, setShowMap] = useState(false);
  const [busy, setBusy] = useState(false);
  const { stop, series } = target;
  const isOccurrence = !!stop && !!series && stop.id.includes(":");
  const editingSeriesOnly = !!series && !stop;
  const [scope, setScope] = useState<"one" | "all">(editingSeriesOnly ? "all" : "one");
  const seriesMode = !stop && !series ? f.repeat !== "none" : scope === "all" && !!series;
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setF((x) => ({ ...x, [k]: v }));
  const refresh = () => void qc.invalidateQueries({ queryKey: ["stops"] });

  async function locate(): Promise<{ lat: number; lng: number; city: string } | null> {
    if (f.pos && (f.address === target.draft.address || showMap)) return { ...f.pos, city: f.city };
    if (!f.address.trim()) return f.pos ? { ...f.pos, city: f.city } : null;
    const g = await geocode(f.address);
    return g ? { lat: g.lat, lng: g.lng, city: g.city } : null;
  }
  async function find() { const g = await geocode(f.address); if (!g) return void toast.error("Address not found"); setF((x) => ({ ...x, pos: g, city: g.city })); setShowMap(true); }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (f.end === f.start) return void toast.error("End time must differ from start");
    setBusy(true);
    const loc = await locate();
    if (!loc) { setBusy(false); return void toast.error("Add an address or drop a pin"); }
    const place = { venue_name: f.venue || f.address, address: f.address || null, city: loc.city, lat: loc.lat, lng: loc.lng, note: f.note || null };
    const span = () => { const s = new Date(`${f.date}T${f.start}`), en = new Date(`${f.date}T${f.end}`); if (en <= s) en.setDate(en.getDate() + 1); return { starts_at: s.toISOString(), ends_at: en.toISOString() }; };
    let error: { message: string } | null = null;
    if (seriesMode) {
      const rule = { ...place, start_time: f.start, end_time: f.end, freq: series && scope === "all" ? (f.repeat === "none" ? series.freq : f.repeat) : f.repeat, weekdays: f.weekdays, month_nth: f.repeat === "monthly" ? f.nth : null, end_date: f.until || null };
      if (!rule.weekdays.length) { setBusy(false); return void toast.error("Pick at least one weekday"); }
      error = series
        ? (await supabase.from("stop_series").update(rule).eq("id", series.id)).error
        : (await supabase.from("stop_series").insert({ ...rule, truck_id: truck.id, start_date: f.date, external_uid: f.externalUid ?? null })).error;
    } else if (isOccurrence) {
      // Detach this one date: skip it in the rule and store a single concrete stop.
      const occ = stop!.occurrence_date!;
      error = (await supabase.from("stop_series").update({ skip_dates: [...series!.skip_dates, occ] }).eq("id", series!.id)).error
        ?? (await supabase.from("stops").insert({ ...place, ...span(), truck_id: truck.id, source: "owner", confidence: 1, series_id: series!.id, occurrence_date: occ })).error;
    } else if (stop) {
      error = (await supabase.from("stops").update({ ...place, ...span(), source: "owner", confidence: 1 }).eq("id", stop.id)).error;
    } else {
      error = (await supabase.from("stops").insert({ ...place, ...span(), truck_id: truck.id, source: "owner", confidence: 1 })).error;
    }
    setBusy(false);
    if (ok(error, "Schedule saved")) { refresh(); done(); }
  }

  async function remove() {
    setBusy(true);
    let error: { message: string } | null = null;
    if (series && (scope === "all" || editingSeriesOnly)) error = (await supabase.from("stop_series").delete().eq("id", series.id)).error;
    else if (isOccurrence) error = (await supabase.from("stop_series").update({ skip_dates: [...series!.skip_dates, stop!.occurrence_date!] }).eq("id", series!.id)).error;
    else if (stop) error = (await supabase.from("stops").update({ cancelled: true }).eq("id", stop.id)).error;
    setBusy(false);
    if (ok(error, "Removed")) { refresh(); done(); }
  }

  const showRepeat = (!stop && !series) || seriesMode;
  return (
    <form onSubmit={save} className="space-y-3">
      {series && stop && (
        <div className="grid grid-cols-2 gap-1 rounded-full bg-muted p-1 text-sm">
          {([["one", "This date only"], ["all", "Whole series"]] as const).map(([k, l]) => (
            <button type="button" key={k} onClick={() => setScope(k)} className={`h-10 rounded-full font-medium ${scope === k ? "bg-card shadow-pop-sm" : "text-muted-foreground"}`}>{l}</button>
          ))}
        </div>
      )}
      <label className="block text-sm font-medium">{seriesMode ? "Starts on" : "Date"}
        <input className="field mt-1" type="date" required value={f.date} disabled={!!series && scope === "all"} onChange={(e) => set("date", e.target.value)} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-sm font-medium">Start<input className="field mt-1" type="time" required value={f.start} onChange={(e) => set("start", e.target.value)} /></label>
        <label className="text-sm font-medium">End<input className="field mt-1" type="time" required value={f.end} onChange={(e) => set("end", e.target.value)} /></label>
      </div>
      <input className="field" placeholder="Venue name (optional)" value={f.venue} onChange={(e) => set("venue", e.target.value)} />
      <div className="flex gap-2">
        <input className="field" placeholder="Address, e.g. 1200 River Dr, Moline" value={f.address} onChange={(e) => set("address", e.target.value)} />
        <button type="button" onClick={find} className="chip shrink-0">Find</button>
      </div>
      <button type="button" onClick={() => { if (!f.pos) set("pos", { lat: truck.base_lat ?? QC_CENTER.lat, lng: truck.base_lng ?? QC_CENTER.lng }); setShowMap((v) => !v); }} className="text-sm font-medium text-primary">{showMap ? "Hide map" : "Pin on the map"}</button>
      {showMap && f.pos && (
        <div className="h-52 overflow-hidden rounded-xl border border-border">
          <ClientOnly fallback={null}><Suspense fallback={null}>
            <TruckMap pins={[]} center={f.pos} radiusMi={0} zoom={15} showRadius={false} onSelect={() => {}} onCenterChange={(p) => set("pos", p)} />
          </Suspense></ClientOnly>
        </div>
      )}
      <textarea className="field" rows={2} placeholder="Note (optional)" value={f.note} onChange={(e) => set("note", e.target.value)} />
      {showRepeat && (
        <div className="space-y-2">
          <select className="field" value={f.repeat} onChange={(e) => set("repeat", e.target.value as Draft["repeat"])}>
            {!series && <option value="none">Doesn't repeat</option>}
            <option value="weekly">Weekly</option>
            <option value="biweekly">Every 2 weeks</option>
            <option value="monthly">Monthly</option>
          </select>
          {f.repeat !== "none" && (
            <>
              {f.repeat === "monthly" && (
                <select className="field" value={f.nth} onChange={(e) => set("nth", Number(e.target.value))}>
                  {[[1, "First"], [2, "Second"], [3, "Third"], [4, "Fourth"], [-1, "Last"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              )}
              <div className="flex flex-wrap gap-1">
                {WEEKDAYS.map((d, i) => {
                  const on = f.weekdays.includes(i);
                  return <button type="button" key={d} onClick={() => set("weekdays", f.repeat === "monthly" ? [i] : on ? f.weekdays.filter((x) => x !== i) : [...f.weekdays, i].sort())}
                    className={`h-11 min-w-11 rounded-full px-2 text-sm font-medium ${on ? "bg-primary text-primary-foreground" : "border border-border bg-card"}`}>{d}</button>;
                })}
              </div>
              <label className="block text-sm font-medium">Ends (leave empty for no end)
                <input className="field mt-1" type="date" value={f.until} onChange={(e) => set("until", e.target.value)} />
              </label>
            </>
          )}
        </div>
      )}
      <div className="flex gap-2 pt-1">
        {(stop || series) && <button type="button" disabled={busy} onClick={remove} className="chip justify-center text-destructive">{isOccurrence && scope === "one" ? "Skip this date" : "Delete"}</button>}
        <button disabled={busy} className="chip flex-1 justify-center bg-primary text-primary-foreground">{busy ? "Saving…" : "Save"}</button>
      </div>
    </form>
  );
}

type FeedEvent = { uid: string; title: string; start: string; end: string; allDay: boolean; location: string; recurrence: { freq: Freq; weekdays: number[]; month_nth: number | null; end_date: string | null } | null };

function CalendarConnect({ truck, onImport }: { truck: Truck; onImport: (d: Draft) => void }) {
  const qc = useQueryClient();
  const list = useServerFn(listFeedEvents);
  const saveUrl = useServerFn(saveFeedUrl);
  const [url, setUrl] = useState("");
  const { data: feed } = useQuery({
    queryKey: ["feed", truck.id],
    queryFn: async () => (await supabase.from("calendar_feeds").select("id, url").eq("truck_id", truck.id).maybeSingle()).data,
  });
  const { data: ev, isFetching, refetch } = useQuery({
    queryKey: ["feed-events", truck.id, feed?.id],
    enabled: !!feed,
    queryFn: () => list({ data: { truckId: truck.id } }),
  });
  const { data: imported = [] } = useQuery({
    queryKey: ["stops", "imported-uids", truck.id],
    queryFn: async () => ((await supabase.from("stop_series").select("external_uid").eq("truck_id", truck.id).not("external_uid", "is", null)).data ?? []).map((r) => r.external_uid),
  });

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    try { await saveUrl({ data: { truckId: truck.id, url } }); setUrl(""); toast.success("Calendar connected"); void qc.invalidateQueries({ queryKey: ["feed", truck.id] }); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Couldn't connect"); }
  }
  async function disconnect() {
    const { error } = await supabase.from("calendar_feeds").delete().eq("truck_id", truck.id);
    if (ok(error, "Calendar disconnected")) void qc.invalidateQueries({ queryKey: ["feed", truck.id] });
  }
  const toDraft = (e: FeedEvent): Draft => {
    const s = new Date(e.start);
    return {
      date: ymd(s), start: e.allDay ? "11:00" : hhmm(e.start), end: e.allDay ? "14:00" : hhmm(e.end), venue: e.title, address: e.location, note: "",
      pos: null, city: "", repeat: e.recurrence?.freq ?? "none", weekdays: e.recurrence?.weekdays ?? [s.getDay()], nth: e.recurrence?.month_nth ?? 1,
      until: e.recurrence?.end_date ?? "", externalUid: e.recurrence ? e.uid : undefined,
    };
  };

  return (
    <div className="space-y-3 rounded-xl bg-secondary p-4">
      <div>
        <h3 className="flex items-center gap-2 font-semibold"><Link2 className="h-4 w-4" />Connect a calendar</h3>
        <p className="text-xs text-muted-foreground">Paste a private calendar link (iCal / webcal). Apple Calendar: share the calendar as a public calendar and copy the link. Google Calendar: Settings → your calendar → "Secret address in iCal format". Events stay private until you import them.</p>
      </div>
      {!feed ? (
        <form onSubmit={connect} className="flex gap-2">
          <input className="field" type="url" required placeholder="webcal://… or https://….ics" value={url} onChange={(e) => setUrl(e.target.value.replace(/^webcal/i, "https"))} />
          <button className="chip shrink-0">Connect</button>
        </form>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="min-w-0 flex-1 truncate text-muted-foreground">Connected: {new URL(feed.url).hostname}</span>
            <button onClick={() => void refetch()} className="chip">{isFetching ? "Loading…" : "Refresh"}</button>
            <button onClick={disconnect} className="chip">Disconnect</button>
          </div>
          {ev?.error && <p className="text-sm text-destructive">{ev.error}</p>}
          {ev && !ev.error && ev.events.length === 0 && <p className="text-sm text-muted-foreground">No upcoming events found.</p>}
          <ul className="max-h-72 divide-y divide-border overflow-y-auto">
            {(ev?.events ?? []).map((e) => (
              <li key={e.uid + e.start} className="flex items-center gap-2 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{e.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {new Date(e.start).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}{!e.allDay && ` · ${new Date(e.start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`}
                    {e.recurrence && ` · ${describeRule(e.recurrence)}`}{e.location && ` · ${e.location}`}
                  </p>
                </div>
                {imported.includes(e.uid) ? <span className="text-xs text-muted-foreground">Imported</span>
                  : <button onClick={() => onImport(toDraft(e))} className="chip shrink-0">Import</button>}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
