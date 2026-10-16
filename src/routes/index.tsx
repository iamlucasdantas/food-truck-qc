import { SiteFooter } from "@/components/SiteFooter";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  pickStop, placeTruck, byStatusThenDistance, chooseCenter, milesBetween, fmtRange, QC_CENTER, SOURCE_LABEL,
  type Window, type Status, type Stop,
} from "@/data/trucks";
import { useFavorites } from "@/hooks/use-favorites";
import { useTrucks, useStops, groupBy, dayBounds, useStopsRealtime } from "@/lib/queries";
import { AccountButton } from "@/components/AccountButton";

const TruckMap = lazy(() => import("@/components/TruckMap"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FoodTruckQC — Find food trucks in the Quad Cities" },
      { name: "description", content: "Live map of food trucks in Davenport, Bettendorf, Rock Island, Moline and East Moline. Search by distance and date." },
      { property: "og:title", content: "FoodTruckQC — Food trucks near you" },
      { property: "og:description", content: "See which Quad Cities food trucks are open now or this weekend." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const STATUS_TEXT: Record<Status, string> = { open: "Open now", today: "Scheduled", none: "No data" };
const STATUS_DOT: Record<Status, string> = { open: "bg-pin-open", today: "bg-pin-today", none: "bg-pin-none" };

function dayOptions() {
  const out: Date[] = [];
  const d = new Date(); d.setHours(12, 0, 0, 0);
  for (let i = 0; i <= 30; i++) { const x = new Date(d); x.setDate(d.getDate() + i); out.push(x); }
  return out;
}

function Index() {
  const [now, setNow] = useState<Date | null>(null);
  const [dayIdx, setDayIdx] = useState(0);
  const [win, setWin] = useState<Window>("now");
  const [radius, setRadius] = useState(10);
  const [center, setCenter] = useState(QC_CENTER);
  const [q, setQ] = useState("");
  const [onlyFav, setOnlyFav] = useState(false);
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [card, setCard] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [mapFailed, setMapFailed] = useState(false);
  const [sheetH, setSheetH] = useState<number | null>(null);
  const drag = useRef<{ y: number; h: number } | null>(null);
  const { isFav, toggle } = useFavorites();

  useEffect(() => {
    setNow(new Date());
    navigator.geolocation?.getCurrentPosition(
      (p) => setCenter(chooseCenter({ lat: p.coords.latitude, lng: p.coords.longitude })),
      () => {}, { timeout: 5000 },
    );
  }, []);

  const days = useMemo(() => (now ? dayOptions() : []), [now]);
  const date = days[dayIdx];

  const [from, to] = date ? dayBounds(date) : [null, null];
  const { data: trucks = [] } = useTrucks();
  const { data: stops = [] } = useStops(from, to);
  useStopsRealtime();
  const byTruck = useMemo(() => groupBy(stops, (s) => s.truck_id), [stops]);

  const results = useMemo(() => {
    if (!now || !date) return [];
    const effWin: Window = dayIdx > 0 && win === "now" ? "all" : win;
    const term = q.trim().toLowerCase();
    return trucks
      .map((t) => {
        const p = placeTruck(t, pickStop(byTruck.get(t.id) ?? [], date, effWin, now));
        return p ? { t, stop: p.stop as Stop | null, status: p.status, lat: p.lat, lng: p.lng, dist: milesBetween(center, p) } : null;
      })
      .filter((r): r is NonNullable<typeof r> => !!r && r.dist <= radius)
      .filter((r) => !term || [r.t.name, r.t.category, r.stop?.city ?? r.t.base_address ?? ""].some((s) => s.toLowerCase().includes(term)))
      .filter((r) => !onlyFav || isFav(r.t.id))
      .filter((r) => !onlyOpen || r.status === "open")
      .filter((r) => !card || r.t.accepts_card)
      .sort(byStatusThenDistance);
  }, [now, date, dayIdx, win, q, center, radius, onlyFav, onlyOpen, card, isFav, trucks, byTruck]);

  const pins = useMemo(() => results.map((r) => ({
    id: r.t.id, lat: r.lat, lng: r.lng, status: r.status, emoji: r.t.emoji, name: r.t.name,
  })), [results]);

  const sel = results.find((r) => r.t.id === selected);

  const snaps = () => { const vh = window.innerHeight; return [148, Math.round(vh * 0.45), Math.round(vh * 0.88)]; };
  const onDown = (e: React.PointerEvent) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); drag.current = { y: e.clientY, h: sheetH ?? snaps()[1]! }; };
  const onMove = (e: React.PointerEvent) => { if (!drag.current) return; const [a, , c] = snaps(); setSheetH(Math.min(c!, Math.max(a!, drag.current.h + drag.current.y - e.clientY))); };
  const onUp = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const moved = Math.abs(e.clientY - drag.current.y) > 6;
    const s = snaps(); const h = sheetH ?? s[1]!;
    setSheetH(moved ? s.reduce((b, x) => (Math.abs(x - h) < Math.abs(b - h) ? x : b)) : (h >= s[2]! ? s[0]! : s[Math.min(2, s.findIndex((x) => x >= h) + 1)]!));
    drag.current = null;
  };

  const dateSelect = (
    <select value={dayIdx} onChange={(e) => setDayIdx(Number(e.target.value))} className="chip h-11 shrink-0 cursor-pointer" aria-label="Date">
      {days.map((d, i) => (
        <option key={i} value={i}>{i === 0 ? "Today" : i === 1 ? "Tomorrow" : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</option>
      ))}
    </select>
  );
  const chipCls = (on: boolean) => `chip h-11 shrink-0 whitespace-nowrap ${on ? "chip-active" : ""}`;
  const chips = (
    <>
      {dateSelect}
      {(["now", "lunch", "dinner", "all"] as Window[]).filter((w) => dayIdx === 0 || w !== "now").map((w) => (
        <button key={w} onClick={() => setWin(w)} className={chipCls(win === w || (dayIdx > 0 && win === "now" && w === "all"))}>
          {w === "now" ? "Now" : w === "lunch" ? "Lunch 11–2" : w === "dinner" ? "Dinner 5–9" : "All day"}
        </button>
      ))}
      {[1, 3, 5, 10, 25].map((r) => <button key={r} onClick={() => setRadius(r)} className={chipCls(radius === r)}>{r} mi</button>)}
      <button onClick={() => setOnlyOpen(!onlyOpen)} className={chipCls(onlyOpen)}>Open now</button>
      <button onClick={() => setOnlyFav(!onlyFav)} className={chipCls(onlyFav)}>Favorites only</button>
      <button onClick={() => setCard(!card)} className={chipCls(card)}>Takes card</button>
    </>
  );
  const brandRow = (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2">
      <h1 className="text-lg font-extrabold sm:text-xl"><span className="text-primary">FoodTruck</span>QC</h1>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tacos, BBQ, Moline…" aria-label="Search trucks"
        className="h-11 w-full min-w-0 rounded-full border-2 border-border bg-background px-4 text-sm outline-none focus:ring-2 focus:ring-ring" />
      <Link to="/favorites" className="chip h-11 w-11 shrink-0 justify-center" aria-label="My favorites">♥</Link>
      <AccountButton />
    </div>
  );
  const list = (
    <ul className="space-y-2 px-3 pb-4">
      {results.length === 0 && now && <li className="py-8 text-center text-sm text-muted-foreground">No trucks match. Try a bigger radius or another time.</li>}
      {results.map((r) => (
        <li key={r.t.id}>
          <button onClick={() => setSelected(r.t.id)}
            className={`flex min-h-11 w-full items-center gap-3 rounded-xl border-2 border-border p-2.5 text-left transition-all hover:shadow-pop-sm ${selected === r.t.id ? "bg-accent" : "bg-background"}`}>
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-secondary text-xl">{r.t.emoji}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-bold">{r.t.name}</span>
              <span className="block truncate text-xs text-muted-foreground">{r.t.category} · {r.stop ? `${r.stop.venue_name}, ${r.stop.city}` : (r.t.base_address ?? "Base location")}</span>
            </span>
            <span className="max-w-[40%] shrink-0 text-right text-xs">
              <span className="flex items-center justify-end gap-1 font-semibold">
                <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[r.status]}`} /><span className="truncate">{r.stop ? fmtRange(r.stop) : "Not confirmed"}</span>
              </span>
              <span className="text-muted-foreground">{r.dist.toFixed(1)} mi</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
  const countLine = <p className="px-3 text-sm font-semibold">{results.length} trucks within {radius} mi {!mapFailed && <span className="font-normal text-muted-foreground">· drag the orange dot to search elsewhere</span>}</p>;

  return (
    <div className="relative h-dvh w-full overflow-hidden">
      {/* Map: full screen on mobile/tablet, right of the 420px column on desktop */}
      {!mapFailed && (
        <div className="absolute inset-0 min-[1200px]:left-[420px]">
          <ClientOnly fallback={<div className="h-full w-full bg-muted" />}>
            <Suspense fallback={<div className="h-full w-full bg-muted" />}>
              <TruckMap pins={pins} center={center} radiusMi={radius} onSelect={setSelected} onCenterChange={setCenter} onFail={() => setMapFailed(true)} />
            </Suspense>
          </ClientOnly>
        </div>
      )}

      {/* Mobile top bar */}
      <div className="absolute inset-x-0 top-0 z-[1000] space-y-2 border-b-2 border-border bg-card p-2 md:hidden">
        {brandRow}
        <div className="-mx-2 flex gap-2 overflow-x-auto px-2 pb-1 [scrollbar-width:none]">{chips}</div>
      </div>

      {/* Mobile bottom sheet (full screen list if the map fails) */}
      <div className={`absolute inset-x-0 bottom-0 z-[1000] flex flex-col rounded-t-3xl border-2 border-b-0 border-border bg-card md:hidden ${mapFailed ? "top-[118px] rounded-none" : ""}`}
        style={mapFailed ? undefined : { height: sheetH ?? "45dvh", transition: drag.current ? "none" : "height .25s" }}>
        {!mapFailed && (
          <button onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} aria-label="Drag to resize list"
            className="flex h-11 shrink-0 touch-none flex-col items-center justify-center gap-1">
            <span className="h-1.5 w-12 rounded-full bg-muted-foreground/40" />
          </button>
        )}
        {countLine}
        <div className="mt-2 flex-1 overflow-y-auto overscroll-contain">{list}<SiteFooter /></div>
      </div>

      {/* Tablet side panel (360px) / desktop column (420px); full width if the map fails */}
      <aside className={`absolute inset-y-0 left-0 z-[1000] hidden flex-col border-r-2 border-border bg-card md:flex ${mapFailed ? "w-full" : "w-[360px] min-[1200px]:w-[420px]"}`}>
        <div className={`space-y-3 border-b-2 border-border p-3 ${mapFailed ? "mx-auto w-full max-w-[1100px]" : ""}`}>
          {brandRow}
          <div className="flex flex-wrap gap-2">{chips}</div>
        </div>
        <div className={`flex-1 overflow-y-auto pt-3 ${mapFailed ? "mx-auto w-full max-w-[1100px]" : ""}`}>{countLine}<div className="mt-2">{list}</div><SiteFooter /></div>
      </aside>

      {/* Selected truck card */}
      {sel && (
        <div className="absolute inset-x-0 bottom-[calc(45dvh+8px)] z-[1001] px-3 md:bottom-auto md:left-auto md:right-3 md:top-3 md:w-96 md:px-0">
          <div className="panel p-4">
            <div className="flex items-start gap-3">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border-2 border-border bg-secondary text-2xl">{sel.t.emoji}</div>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-lg font-bold">{sel.t.name}</h2>
                <p className="text-sm text-muted-foreground">{sel.t.category} · {sel.dist.toFixed(1)} mi · {sel.stop?.venue_name ?? sel.t.base_address ?? "Base location"}</p>
                <p className="mt-1 flex items-center gap-1.5 text-sm font-medium">
                  <span className={`h-2.5 w-2.5 rounded-full border border-border ${STATUS_DOT[sel.status]}`} />
                  {sel.stop ? `${STATUS_TEXT[sel.status]} · ${fmtRange(sel.stop)}` : "Location not confirmed"}
                </p>
                {sel.stop && <p className="mt-0.5 text-xs text-muted-foreground">{SOURCE_LABEL[sel.stop.source]}</p>}
              </div>
              <button onClick={() => setSelected(null)} aria-label="Close" className="grid h-11 w-11 shrink-0 place-items-center text-muted-foreground">✕</button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => toggle(sel.t.id)} className={`chip h-11 ${isFav(sel.t.id) ? "chip-active" : ""}`}>♥ {isFav(sel.t.id) ? "Saved" : "Save"}</button>
              <a target="_blank" rel="noreferrer" className="chip h-11" href={`https://www.google.com/maps/dir/?api=1&destination=${sel.lat},${sel.lng}`}>Directions</a>
              {sel.t.phone && <a className="chip h-11" href={`tel:${sel.t.phone}`}>Call</a>}
              {sel.t.website && <a target="_blank" rel="noreferrer" className="chip h-11" href={sel.t.website}>Website</a>}
              {sel.t.instagram && <a target="_blank" rel="noreferrer" className="chip h-11" href={sel.t.instagram.startsWith("http") ? sel.t.instagram : `https://instagram.com/${sel.t.instagram.replace(/^@/, "")}`}>Instagram</a>}
              <Link to="/truck/$id" params={{ id: sel.t.id }} className="chip ml-auto h-11 bg-primary text-primary-foreground">Details →</Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
