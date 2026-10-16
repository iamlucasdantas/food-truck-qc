import { SiteFooter } from "@/components/SiteFooter";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import {
  pickStop, milesBetween, fmtRange, QC_CENTER, SOURCE_LABEL,
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
  const [radius, setRadius] = useState(5);
  const [center, setCenter] = useState(QC_CENTER);
  const [q, setQ] = useState("");
  const [onlyFav, setOnlyFav] = useState(false);
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [card, setCard] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const { isFav, toggle } = useFavorites();

  useEffect(() => {
    setNow(new Date());
    navigator.geolocation?.getCurrentPosition(
      (p) => setCenter({ lat: p.coords.latitude, lng: p.coords.longitude }),
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
        const { stop, status } = pickStop(byTruck.get(t.id) ?? [], date, effWin, now);
        return { t, stop: stop as Stop | null, status, dist: stop ? milesBetween(center, stop) : Infinity };
      })
      .filter((r) => r.stop && r.dist <= radius)
      .filter((r) => !term || [r.t.name, r.t.category, r.stop!.city].some((s) => s.toLowerCase().includes(term)))
      .filter((r) => !onlyFav || isFav(r.t.id))
      .filter((r) => !onlyOpen || r.status === "open")
      .filter((r) => !card || r.t.accepts_card)
      .sort((a, b) => a.dist - b.dist);
  }, [now, date, dayIdx, win, q, center, radius, onlyFav, onlyOpen, card, isFav, trucks, byTruck]);

  const pins = useMemo(() => results.map((r) => ({
    id: r.t.id, lat: r.stop!.lat, lng: r.stop!.lng, status: r.status, emoji: r.t.emoji, name: r.t.name,
  })), [results]);

  const sel = results.find((r) => r.t.id === selected);

  return (
    <div className="relative h-dvh w-full overflow-hidden">
      <div className="absolute inset-0">
        <ClientOnly fallback={<div className="h-full w-full bg-muted" />}>
          <Suspense fallback={<div className="h-full w-full bg-muted" />}>
            <TruckMap pins={pins} center={center} radiusMi={radius} onSelect={setSelected} onCenterChange={setCenter} />
          </Suspense>
        </ClientOnly>
      </div>

      {/* Top controls */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 p-3">
        <div className="pointer-events-auto panel mx-auto max-w-3xl space-y-2 p-3">
          <div className="flex items-center gap-2">
            <h1 className="shrink-0 text-xl font-extrabold"><span className="text-primary">FoodTruck</span>QC</h1>
            <input
              value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Tacos, BBQ, Moline…"
              className="min-w-0 flex-1 rounded-full border-2 border-border bg-background px-4 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <Link to="/favorites" className="chip shrink-0" aria-label="My favorites">♥</Link>
            <AccountButton />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            <select
              value={dayIdx} onChange={(e) => setDayIdx(Number(e.target.value))}
              className="chip cursor-pointer" aria-label="Date"
            >
              {days.map((d, i) => (
                <option key={i} value={i}>
                  {i === 0 ? "Today" : i === 1 ? "Tomorrow" : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                </option>
              ))}
            </select>
            {(["now", "lunch", "dinner", "all"] as Window[]).filter((w) => dayIdx === 0 || w !== "now").map((w) => (
              <button key={w} onClick={() => setWin(w)} className={`chip ${(win === w || (dayIdx > 0 && win === "now" && w === "all")) ? "chip-active" : ""}`}>
                {w === "now" ? "Now" : w === "lunch" ? "Lunch 11–2" : w === "dinner" ? "Dinner 5–9" : "All day"}
              </button>
            ))}
            <span className="mx-1 w-px shrink-0 bg-border" />
            {[1, 3, 5, 10].map((r) => (
              <button key={r} onClick={() => setRadius(r)} className={`chip ${radius === r ? "chip-active" : ""}`}>{r} mi</button>
            ))}
            <span className="mx-1 w-px shrink-0 bg-border" />
            <button onClick={() => setOnlyOpen(!onlyOpen)} className={`chip whitespace-nowrap ${onlyOpen ? "chip-active" : ""}`}>Open now</button>
            <button onClick={() => setOnlyFav(!onlyFav)} className={`chip whitespace-nowrap ${onlyFav ? "chip-active" : ""}`}>Favorites only</button>
            <button onClick={() => setCard(!card)} className={`chip whitespace-nowrap ${card ? "chip-active" : ""}`}>Takes card</button>
          </div>
        </div>
      </div>

      {/* Selected truck card */}
      {sel && (
        <div className="absolute inset-x-0 bottom-[calc(40px+30vh)] z-20 px-3 sm:bottom-auto sm:right-3 sm:top-36 sm:left-auto sm:w-96">
          <div className="panel p-4">
            <div className="flex items-start gap-3">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border-2 border-border bg-secondary text-2xl">{sel.t.emoji}</div>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-lg font-bold">{sel.t.name}</h2>
                <p className="text-sm text-muted-foreground">{sel.t.category} · {sel.dist.toFixed(1)} mi · {sel.stop!.venue_name}</p>
                <p className="mt-1 flex items-center gap-1.5 text-sm font-medium">
                  <span className={`h-2.5 w-2.5 rounded-full border border-border ${STATUS_DOT[sel.status]}`} />
                  {STATUS_TEXT[sel.status]} · {fmtRange(sel.stop!)}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">{SOURCE_LABEL[sel.stop!.source]}</p>
              </div>
              <button onClick={() => setSelected(null)} aria-label="Close" className="text-muted-foreground">✕</button>
            </div>
            <div className="mt-3 flex gap-2">
              <button onClick={() => toggle(sel.t.id)} className={`chip ${isFav(sel.t.id) ? "chip-active" : ""}`}>♥ {isFav(sel.t.id) ? "Saved" : "Save"}</button>
              <a target="_blank" rel="noreferrer" className="chip"
                href={`https://www.google.com/maps/dir/?api=1&destination=${sel.stop!.lat},${sel.stop!.lng}`}>Directions</a>
              <Link to="/truck/$id" params={{ id: sel.t.id }} className="chip ml-auto bg-primary text-primary-foreground">Details →</Link>
            </div>
          </div>
        </div>
      )}

      {/* Bottom sheet list */}
      <div className={`absolute inset-x-0 bottom-0 z-10 transition-all duration-300 ${expanded ? "h-[70vh]" : "h-[calc(40px+30vh)]"}`}>
        <div className="mx-auto flex h-full max-w-3xl flex-col rounded-t-3xl border-2 border-b-0 border-border bg-card">
          <button onClick={() => setExpanded(!expanded)} className="flex flex-col items-center gap-1 py-2">
            <span className="h-1.5 w-12 rounded-full bg-muted-foreground/40" />
            <span className="text-sm font-semibold">{results.length} trucks within {radius} mi <span className="text-muted-foreground">· drag the pin to search elsewhere</span></span>
          </button>
          <ul className="flex-1 space-y-2 overflow-y-auto px-3 pb-6">
            {results.length === 0 && now && (
              <li className="py-8 text-center text-sm text-muted-foreground">No trucks match. Try a bigger radius or another time.</li>
            )}
            {results.map((r) => (
              <li key={r.t.id}>
                <button onClick={() => setSelected(r.t.id)}
                  className={`flex w-full items-center gap-3 rounded-xl border-2 border-border p-2.5 text-left transition-all hover:shadow-pop-sm ${selected === r.t.id ? "bg-accent" : "bg-background"}`}>
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-secondary text-xl">{r.t.emoji}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{r.t.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{r.t.category} · {r.stop!.venue_name}, {r.stop!.city}</span>
                  </span>
                  <span className="shrink-0 text-right text-xs">
                    <span className="flex items-center justify-end gap-1 font-semibold">
                      <span className={`h-2 w-2 rounded-full ${STATUS_DOT[r.status]}`} />{fmtRange(r.stop!)}
                    </span>
                    <span className="text-muted-foreground">{r.dist.toFixed(1)} mi</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <SiteFooter />
        </div>
      </div>
    </div>
  );
}
