import { CUISINES, cityOf, matchesFilters, parseFilters, filtersToSearch, type CuisineKey, type Filters } from "@/data/filters";
import { truckByline } from "@/data/onboarding";
import { locationVerified } from '@/data/location-confirmation';
import { Logo } from "@/components/Logo";
import { SiteFooter } from "@/components/SiteFooter";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Search, SlidersHorizontal, Heart, X, ExternalLink, Utensils, ArrowRight, Navigation, ChevronDown } from "lucide-react";
import {
  pickStop, placeTruck, byStatusThenDistance, chooseCenter, milesBetween, fmtRange, fmtTime, QC_CENTER, SOURCE_LABEL,
  fmtCentral, type Window, type Status, type Stop,
} from "@/data/trucks";
import { useFavorites } from "@/hooks/use-favorites";
import { useTrucks, useStops, groupBy, dayBounds, useStopsRealtime } from "@/lib/queries";
import { AccountButton } from "@/components/AccountButton";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

const TruckMap = lazy(() => import("@/components/TruckMap"));

export const Route = createFileRoute("/")({
  staticData: { sitemap: true },
  validateSearch: (s: Record<string, unknown>) => s as Record<string, string | undefined>,
  head: () => ({
    meta: [
      { title: "Quad Cities Food Trucks Open Now — Live Map | FoodTruckQC" },
      { name: "description", content: "Find Quad Cities food trucks open now in Davenport, Bettendorf, Rock Island and Moline. Live map, today's locations, menus and weekly schedules." },
      { property: "og:title", content: "Quad Cities Food Trucks Open Now — Live Map | FoodTruckQC" },
      { property: "og:image", content: "https://app.foodtruckqc.com/og-image.jpg" },
      { name: "twitter:image", content: "https://app.foodtruckqc.com/og-image.jpg" },
      { property: "og:description", content: "Find Quad Cities food trucks open now in Davenport, Bettendorf, Rock Island and Moline. Live map, today's locations, menus and weekly schedules." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const WIN_LABEL: Record<Window, string> = { now: "Now", lunch: "Lunch 11–2", dinner: "Dinner 5–9", all: "All day" };
const PILL: Record<Status, string> = {
  open: "bg-pin-open-soft text-foreground", today: "bg-pin-today-soft text-foreground", none: "bg-muted text-muted-foreground",
};
const DOT: Record<Status, string> = { open: "bg-pin-open", today: "bg-pin-today", none: "bg-pin-none" };
const RADIUS_DEFAULT = 10;

function dayOptions() {
  const out: Date[] = [];
  const d = new Date(); d.setHours(12, 0, 0, 0);
  for (let i = 0; i <= 30; i++) { const x = new Date(d); x.setDate(d.getDate() + i); out.push(x); }
  return out;
}
const dayLabel = (d: Date, i: number) => i === 0 ? "Today" : i === 1 ? "Tomorrow" : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

const focus = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function Index() {
  const isMobile = useIsMobile();
  const [now, setNow] = useState<Date | null>(null);
  const [dayIdx, setDayIdx] = useState(0);
  const [win, setWin] = useState<Window>("now");
  const [center, setCenter] = useState(QC_CENTER);
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const f = parseFilters(search);
  const urlRadius = Number(search["radius"]);
  const setF = (next: Partial<Filters>, extra: Record<string, string | undefined> = {}) =>
    void navigate({ search: (prev: Record<string, string | undefined>) => ({ ...prev, ...filtersToSearch({ ...f, ...next, status: [] }), ...extra }), replace: true });
  const q = f.q, cuisines = f.cuisines, onlyOpen = f.open;
  const setQ = (v: string) => setF({ q: v });
  const setCuisines = (fn: (xs: CuisineKey[]) => CuisineKey[]) => setF({ cuisines: fn(cuisines) });
  const setOnlyOpen = (v: boolean) => setF({ open: v });
  const [onlyFav, setOnlyFav] = useState(false);
  const [card, setCard] = useState(false);
  const [sort, setSort] = useState<"nearest" | "open">("open");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const radius = urlRadius >= 1 && urlRadius <= 25 ? Math.round(urlRadius) : RADIUS_DEFAULT;
  const setRadius = (r: number) => setF({}, { radius: r === RADIUS_DEFAULT ? undefined : String(r) });
  const [mapFailed, setMapFailed] = useState(false);
  const [sheetH, setSheetH] = useState<number | null>(null);
  const drag = useRef<{ y: number; h: number } | null>(null);
  const { isFav, toggle } = useFavorites();

  useEffect(() => {
    // Refresh "now" every minute so live check-ins drop off the map exactly when they end.
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
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
  const { data: trucks = [], isLoading } = useTrucks();
  const { data: stops = [] } = useStops(from, to);
  useStopsRealtime();
  const byTruck = useMemo(() => groupBy(stops, (s) => s.truck_id), [stops]);
  const effWin: Window = dayIdx > 0 && win === "now" ? "all" : win;

  const results = useMemo(() => {
    if (!now || !date) return [];
    const rows = trucks
      .map((t) => {
        const p = placeTruck(t, pickStop(byTruck.get(t.id) ?? [], date, effWin, now));
        return p ? { t, stop: p.stop as Stop | null, status: p.status, lat: p.lat, lng: p.lng, dist: milesBetween(center, p) } : null;
      })
      .filter((r): r is NonNullable<typeof r> => !!r && r.dist <= radius)
      .filter((r) => matchesFilters({ ...r.t, city: (r.stop && r.status !== "none" ? r.stop.city : "") || cityOf(r.t.base_address), open: r.status === "open" }, { ...f, status: [], open: false }))
      .filter((r) => !onlyFav || isFav(r.t.id))
      .filter((r) => !onlyOpen || r.status === "open")
      .filter((r) => !card || r.t.accepts_card);
    return sort === "open" ? rows.sort(byStatusThenDistance) : rows.sort((a, b) => a.dist - b.dist);
  }, [now, date, effWin, search, center, radius, onlyFav, onlyOpen, card, isFav, trucks, byTruck, sort]); // eslint-disable-line react-hooks/exhaustive-deps

  const cityList = useMemo(() => Array.from(new Set(trucks.map((t) => cityOf(t.base_address)).filter(Boolean))).sort(), [trucks]);
  const pins = useMemo(() => results.map((r) => ({
    id: r.t.id, lat: r.lat, lng: r.lng, status: r.status, emoji: r.t.emoji, name: r.t.name,
  })), [results]);

  const sel = results.find((r) => r.t.id === selected);

  // Active (non-default) filters, each removable.
  const active: { key: string; label: string; clear: () => void }[] = [];
  if (dayIdx !== 0) active.push({ key: "day", label: date ? dayLabel(date, dayIdx) : "", clear: () => setDayIdx(0) });
  if (effWin !== "now" && !(dayIdx > 0 && effWin === "all")) active.push({ key: "win", label: WIN_LABEL[effWin], clear: () => setWin("now") });
  if (radius !== RADIUS_DEFAULT) active.push({ key: "r", label: `${radius} mi`, clear: () => setRadius(RADIUS_DEFAULT) });
  for (const c of cuisines) { const m = CUISINES.find((x) => x.key === c)!; active.push({ key: c, label: `${m.emoji} ${m.label}`, clear: () => setCuisines((xs) => xs.filter((x) => x !== c)) }); }
  if (f.dish) active.push({ key: "dish", label: `Dish: ${f.dish}`, clear: () => setF({ dish: "" }) });
  if (f.city) active.push({ key: "city", label: f.city, clear: () => setF({ city: "" }) });
  if (f.type) active.push({ key: "type", label: f.type === "fixed" ? "Fixed location" : "Mobile", clear: () => setF({ type: "" }) });
  if (onlyOpen) active.push({ key: "open", label: "Open now", clear: () => setOnlyOpen(false) });
  if (card) active.push({ key: "card", label: "Takes card", clear: () => setCard(false) });
  if (onlyFav) active.push({ key: "fav", label: "Favorites only", clear: () => setOnlyFav(false) });
  const clearAll = () => { setDayIdx(0); setWin("now"); setCard(false); setOnlyFav(false); void navigate({ search: {}, replace: true }); };
  const toggleCuisine = (k: CuisineKey) => setCuisines((xs) => xs.includes(k) ? xs.filter((x) => x !== k) : [...xs, k]);

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

  const chip = (on: boolean) => `chip h-10 shrink-0 whitespace-nowrap ${on ? "chip-active" : ""}`;

  const searchRow = (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2">
      <label className="relative block min-w-0">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search trucks, tacos, BBQ…" aria-label="Search trucks"
          className="h-12 w-full min-w-0 rounded-full border border-border bg-card pl-11 pr-4 text-sm shadow-pop outline-none transition-shadow duration-150 focus:ring-2 focus:ring-ring" />
      </label>
      <button onClick={() => setFiltersOpen(true)} className={`relative inline-flex h-12 shrink-0 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-semibold shadow-pop transition-all duration-150 hover:bg-muted ${focus}`} aria-label={`Filters${active.length ? ` (${active.length} active)` : ""}`}>
        <SlidersHorizontal className="h-4 w-4" /><span className="hidden sm:inline">Filters</span>
        {active.length > 0 && <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[11px] font-bold text-primary-foreground">{active.length}</span>}
      </button>
      <AccountButton />
    </div>
  );

  const quickRow = (
    <div className="no-scrollbar edge-fade -mx-3 flex gap-2 overflow-x-auto px-3 py-1">
      <button onClick={() => setOnlyOpen(!onlyOpen)} className={chip(onlyOpen)} aria-pressed={onlyOpen}>
        <span className="h-2 w-2 rounded-full bg-pin-open" />Open now
      </button>
      <label className={`${chip(dayIdx !== 0)} relative cursor-pointer pr-8`}>
        {date ? dayLabel(date, dayIdx) : "Today"}
        <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4" />
        <select value={dayIdx} onChange={(e) => setDayIdx(Number(e.target.value))} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Date">
          {days.map((d, i) => <option key={i} value={i}>{dayLabel(d, i)}</option>)}
        </select>
      </label>
      <span className="my-2 w-px shrink-0 bg-border" />
      {CUISINES.map((c) => (
        <button key={c.key} onClick={() => toggleCuisine(c.key)} className={chip(cuisines.includes(c.key))} aria-pressed={cuisines.includes(c.key)}>
          <span aria-hidden>{c.emoji}</span>{c.label}
        </button>
      ))}
    </div>
  );

  const activeRow = active.length > 0 && (
    <div className="flex flex-wrap items-center gap-1.5">
      {active.map((a) => (
        <button key={a.key} onClick={a.clear} className={`inline-flex h-8 items-center gap-1 rounded-full bg-accent px-3 text-xs font-medium transition-colors duration-150 hover:bg-accent/70 ${focus}`} aria-label={`Remove ${a.label}`}>
          {a.label}<X className="h-3 w-3" />
        </button>
      ))}
      <button onClick={clearAll} className={`h-8 rounded-full px-2 text-xs font-semibold text-primary hover:underline ${focus}`}>Clear all</button>
    </div>
  );

  const listHeader = (
    <div className="flex items-center justify-between gap-2 px-3">
      <p className="min-w-0 truncate text-sm font-semibold">{results.length} trucks within {radius} mi</p>
      <label className="relative inline-flex h-10 shrink-0 items-center gap-1 rounded-full px-3 text-sm text-muted-foreground hover:bg-muted">
        Sort: <span className="font-semibold text-foreground">{sort === "open" ? "Open now first" : "Nearest"}</span><ChevronDown className="h-4 w-4" />
        <select value={sort} onChange={(e) => setSort(e.target.value as "nearest" | "open")} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Sort">
          <option value="open">Open now first</option><option value="nearest">Nearest</option>
        </select>
      </label>
    </div>
  );

  const statusText = (r: (typeof results)[number]) =>
    !r.stop || r.status === "none" ? (locationVerified(r.t) ? "Location verified" : "Location awaiting confirmation")
      : r.status === "open" ? (r.stop.is_live ? `Here until ${fmtCentral(r.stop.ends_at)}` : `Open now · until ${fmtTime(r.stop.ends_at)}`)
        : `${dayIdx === 0 ? "Today" : dayIdx === 1 ? "Tomorrow" : "Scheduled"} ${fmtRange(r.stop)}`;

  const loading = isLoading || !now;
  const list = (
    <ul className="space-y-2 px-3 pb-4">
      {loading && Array.from({ length: 5 }).map((_, i) => (
        <li key={i} className="flex gap-3 rounded-2xl bg-card p-3 shadow-pop"><Skeleton className="h-[72px] w-[72px] rounded-xl" /><div className="flex-1 space-y-2 py-1"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-1/3" /><Skeleton className="h-3 w-1/2" /></div></li>
      ))}
      {!loading && results.length === 0 && (
        <li className="flex flex-col items-center gap-3 px-4 py-12 text-center">
          <span className="text-4xl" aria-hidden>🚚</span>
          <p className="text-base">0 trucks within {radius} mi — widen the radius or pick another date.</p>
          <button onClick={clearAll} className={`h-11 rounded-full border border-border bg-card px-5 text-sm font-medium transition-colors duration-150 hover:bg-muted ${focus}`}>Clear filters</button>
        </li>
      )}
      {!loading && results.map((r) => (
        <li key={r.t.id} className="relative" onMouseEnter={() => setHovered(r.t.id)} onMouseLeave={() => setHovered(null)}>
          <button onClick={() => setSelected(r.t.id)}
            className={`flex w-full items-start gap-3 rounded-2xl border bg-card p-3 pr-12 text-left shadow-pop transition-all duration-150 hover:shadow-pop-sm ${focus} ${selected === r.t.id ? "border-primary" : "border-transparent"}`}>
            <span className="grid h-[72px] w-[72px] shrink-0 place-items-center overflow-hidden rounded-xl bg-muted text-3xl">
              {r.t.logo_url ? <img src={r.t.logo_url} alt="" className="h-full w-full object-cover" loading="lazy" /> : r.t.emoji}
            </span>
            <span className="min-w-0 flex-1 space-y-0.5">
              <span className="block truncate font-bold">{r.t.name}</span>
              {truckByline(r.t.name, r.t.business_name) && <span className="block truncate text-xs text-muted-foreground">{truckByline(r.t.name, r.t.business_name)}</span>}
              <span className="block truncate text-sm">{r.t.category} · {r.dist.toFixed(1)} mi</span>
              <span className="block truncate text-xs text-muted-foreground">{r.stop && r.status !== "none" ? `${r.stop.venue_name}, ${r.stop.city}` : (r.t.base_address ?? "Base location")}</span>
              {r.stop?.note === 'Google opening hours' && <span className="block text-xs text-muted-foreground">Google hours · {fmtRange(r.stop)} Central</span>}
              <span className={`mt-1 inline-flex max-w-full items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${PILL[r.status]}`}>
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[r.status]}`} /><span className="truncate">{statusText(r)}</span>
              </span>
            </span>
          </button>
          <button onClick={() => toggle(r.t.id)} aria-label={isFav(r.t.id) ? "Remove from favorites" : "Save to favorites"}
            className={`absolute right-1 top-1 grid h-11 w-11 place-items-center rounded-full transition-colors duration-150 hover:bg-muted ${focus}`}>
            <Heart className={`h-5 w-5 ${isFav(r.t.id) ? "fill-primary text-primary" : "text-muted-foreground"}`} />
          </button>
        </li>
      ))}
    </ul>
  );

  const filtersBody = (
    <div className="space-y-6">
      <Section title="When">
        <div className="grid grid-cols-4 gap-1 rounded-full bg-muted p-1">
          {([["Now", dayIdx === 0 && win === "now", () => { setDayIdx(0); setWin("now"); }],
            ["Today", dayIdx === 0 && win !== "now", () => { setDayIdx(0); if (win === "now") setWin("all"); }],
            ["Tomorrow", dayIdx === 1, () => setDayIdx(1)],
            ["Pick date", dayIdx > 1, () => { if (dayIdx < 2) setDayIdx(2); }]] as [string, boolean, () => void][]).map(([l, on, fn]) => (
            <button key={l} onClick={fn} className={`h-10 rounded-full text-sm font-medium transition-all duration-150 ${focus} ${on ? "bg-card shadow-pop-sm" : "text-muted-foreground"}`}>{l}</button>
          ))}
        </div>
        {dayIdx > 1 && (
          <select value={dayIdx} onChange={(e) => setDayIdx(Number(e.target.value))} className="field mt-3" aria-label="Pick a date">
            {days.slice(2).map((d, i) => <option key={i + 2} value={i + 2}>{dayLabel(d, i + 2)}</option>)}
          </select>
        )}
        {!(dayIdx === 0 && win === "now") && (
          <div className="mt-3 flex flex-wrap gap-2">
            {(["lunch", "dinner", "all"] as Window[]).map((w) => <button key={w} onClick={() => setWin(w)} className={chip(effWin === w)}>{WIN_LABEL[w]}</button>)}
          </div>
        )}
      </Section>
      <Section title="Distance" aside={<span className="text-sm font-semibold text-primary">{radius} mi</span>}>
        <Slider min={1} max={25} step={1} value={[radius]} onValueChange={(v) => setRadius(v[0] ?? RADIUS_DEFAULT)} aria-label="Distance in miles" className="py-3" />
        <div className="flex justify-between text-xs text-muted-foreground"><span>1 mi</span><span>25 mi</span></div>
      </Section>
      <Section title="Food">
        <div className="grid gap-2 sm:grid-cols-2">
          <input className="field" placeholder="Dish, e.g. tacos" aria-label="Dish" value={f.dish} onChange={(e) => setF({ dish: e.target.value })} />
          <select className="field" aria-label="City" value={f.city} onChange={(e) => setF({ city: e.target.value })}>
            <option value="">Any city</option>{cityList.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-1 rounded-full bg-muted p-1" role="group" aria-label="Fixed or mobile">
          {([["", "All"], ["mobile", "Mobile"], ["fixed", "Fixed"]] as const).map(([v, l]) => (
            <button key={l} onClick={() => setF({ type: v })} aria-pressed={f.type === v} className={`h-10 rounded-full text-sm font-medium ${focus} ${f.type === v ? "bg-card shadow-pop-sm" : "text-muted-foreground"}`}>{l}</button>
          ))}
        </div>
      </Section>
      <Section title="Cuisine">
        <div className="flex flex-wrap gap-2">
          {CUISINES.map((c) => <button key={c.key} onClick={() => toggleCuisine(c.key)} className={chip(cuisines.includes(c.key))}><span aria-hidden>{c.emoji}</span>{c.label}</button>)}
        </div>
      </Section>
      <Section title="Extras">
        <div className="divide-y divide-border">
          {([["Open now", onlyOpen, setOnlyOpen], ["Takes card", card, setCard], ["Favorites only", onlyFav, setOnlyFav]] as [string, boolean, (v: boolean) => void][]).map(([l, v, set]) => (
            <label key={l} className="flex min-h-12 cursor-pointer items-center justify-between gap-3 text-sm font-medium">{l}<Switch checked={v} onCheckedChange={set} /></label>
          ))}
        </div>
      </Section>
    </div>
  );
  const filtersFooter = (
    <div className="flex items-center justify-between gap-3 border-t border-border bg-card px-5 py-3">
      <button onClick={clearAll} className={`h-11 rounded-full px-2 text-sm font-semibold underline-offset-4 hover:underline ${focus}`}>Clear all</button>
      <button onClick={() => setFiltersOpen(false)} className={`h-12 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground transition-colors duration-150 hover:bg-primary/90 ${focus}`}>Show {results.length} trucks</button>
    </div>
  );

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-background">
      {!mapFailed && (
        <div className="absolute inset-0 md:left-[360px] min-[1200px]:left-[420px]">
          <ClientOnly fallback={<div className="h-full w-full bg-muted" />}>
            <Suspense fallback={<div className="h-full w-full bg-muted" />}>
              <TruckMap pins={pins} center={center} radiusMi={radius} onSelect={setSelected} onCenterChange={setCenter} onFail={() => setMapFailed(true)}
                highlightId={hovered ?? selected} pillClass="top-[176px] md:top-3" locateClass="right-3 top-[176px] md:top-auto md:bottom-6" />
            </Suspense>
          </ClientOnly>
        </div>
      )}

      {/* Mobile top bar */}
      <div className="absolute inset-x-0 top-0 z-[1000] space-y-2 bg-card/95 p-3 pb-2 shadow-pop backdrop-blur md:hidden">
        {searchRow}{quickRow}{activeRow}
      </div>

      {/* Mobile bottom sheet */}
      <div className={`absolute inset-x-0 bottom-0 z-[1000] flex flex-col rounded-t-3xl bg-background shadow-[0_-4px_16px_rgb(0_0_0/0.08)] md:hidden ${mapFailed ? "top-[150px] rounded-none" : ""}`}
        style={mapFailed ? undefined : { height: sheetH ?? "45dvh", transition: drag.current ? "none" : "height .25s" }}>
        {!mapFailed && (
          <button onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} aria-label="Drag to resize list"
            className="flex h-8 shrink-0 touch-none items-center justify-center">
            <span className="h-1.5 w-10 rounded-full bg-border" />
          </button>
        )}
        {listHeader}
        <div className="mt-1 flex-1 overflow-y-auto overscroll-contain">{list}<SiteFooter /></div>
      </div>

      {/* Tablet / desktop column */}
      <aside className={`absolute inset-y-0 left-0 z-[1000] hidden flex-col bg-secondary shadow-pop md:flex ${mapFailed ? "w-full" : "w-[360px] min-[1200px]:w-[420px]"}`}>
        <div className={`space-y-2 bg-card p-3 shadow-pop ${mapFailed ? "mx-auto w-full max-w-[1100px]" : ""}`}>
          <h1 className="px-1"><Logo /><span className="sr-only">Quad Cities food trucks open now: live map and schedules</span></h1>
          {searchRow}{quickRow}{activeRow}
        </div>
        <div className={`flex-1 overflow-y-auto pt-2 ${mapFailed ? "mx-auto w-full max-w-[1100px]" : ""}`}>{listHeader}<div className="mt-1">{list}</div><SiteFooter /></div>
      </aside>

      {/* Filters panel */}
      {isMobile ? (
        <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
          <SheetContent side="bottom" className="z-[1100] flex max-h-[90dvh] flex-col gap-0 rounded-t-3xl p-0">
            <SheetHeader className="border-b border-border px-5 py-4"><SheetTitle>Filters</SheetTitle></SheetHeader>
            <div className="flex-1 overflow-y-auto px-5 py-5">{filtersBody}</div>
            {filtersFooter}
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
          <DialogContent className="z-[1100] flex max-h-[85dvh] max-w-lg flex-col gap-0 overflow-hidden rounded-2xl p-0">
            <DialogHeader className="border-b border-border px-5 py-4"><DialogTitle className="text-center">Filters</DialogTitle></DialogHeader>
            <div className="flex-1 overflow-y-auto px-5 py-5">{filtersBody}</div>
            {filtersFooter}
          </DialogContent>
        </Dialog>
      )}

      {/* Selected truck preview */}
      {sel && (
        <div className="absolute inset-x-0 bottom-[calc(45dvh+8px)] z-[1001] px-3 md:bottom-auto md:left-auto md:right-3 md:top-3 md:w-96 md:px-0">
          <div className="rounded-2xl bg-card p-4 shadow-[0_4px_20px_rgb(0_0_0/0.12)]">
            <div className="flex items-start gap-3">
              <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-muted text-2xl">
                {sel.t.logo_url ? <img src={sel.t.logo_url} alt="" className="h-full w-full object-cover" /> : sel.t.emoji}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-base font-bold">{sel.t.name}</h2>
                {truckByline(sel.t.name, sel.t.business_name) && <p className="truncate text-xs text-muted-foreground">{truckByline(sel.t.name, sel.t.business_name)}</p>}
                <p className="truncate text-sm text-muted-foreground">{sel.t.category} · {sel.dist.toFixed(1)} mi</p>
                {sel.stop?.note === 'Google opening hours' && <p className="text-xs text-muted-foreground">Google hours · {fmtRange(sel.stop)} Central</p>}
                <span className={`mt-1 inline-flex max-w-full items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${PILL[sel.status]}`}>
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[sel.status]}`} /><span className="truncate">{statusText(sel)}</span>
                </span>
                {sel.stop && sel.status !== "none" && <p className="mt-1 text-xs text-muted-foreground">{SOURCE_LABEL[sel.stop.source]}</p>}
              </div>
              <button onClick={() => toggle(sel.t.id)} aria-label={isFav(sel.t.id) ? "Remove from favorites" : "Save to favorites"} className={`grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-muted ${focus}`}><Heart className={`h-5 w-5 ${isFav(sel.t.id) ? "fill-primary text-primary" : "text-muted-foreground"}`} /></button>
              <button onClick={() => setSelected(null)} aria-label="Close" className={`grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted ${focus}`}><X className="h-5 w-5" /></button>
            </div>
            {sel.stop?.source_url && /^https?:\/\//i.test(sel.stop.source_url) && (
              <Button asChild variant="link" className="mt-2 h-auto max-w-full justify-start px-0 py-1 text-xs">
                <a href={sel.stop.source_url} target="_blank" rel="noopener noreferrer"><ExternalLink />Original post</a>
              </Button>
            )}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button asChild className="h-11">
                <a href={`https://www.google.com/maps/dir/?api=1&destination=${sel.lat},${sel.lng}`} target="_blank" rel="noopener noreferrer"><Navigation />Directions</a>
              </Button>
              <Button asChild variant="outline" className="h-11">
                <Link to="/truck/$id" params={{ id: sel.t.id }} hash="menu"><Utensils />Menu</Link>
              </Button>
            </div>
            <Button asChild variant="link" className="mt-2 h-11 w-full">
              <Link to="/truck/$id" params={{ id: sel.t.id }}>View profile<ArrowRight /></Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between"><h3 className="text-base font-semibold">{title}</h3>{aside}</div>
      {children}
    </section>
  );
}

