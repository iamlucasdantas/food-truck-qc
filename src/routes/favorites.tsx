import { SiteFooter } from "@/components/SiteFooter";
import { truckByline } from "@/data/onboarding";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Heart, Navigation } from "lucide-react";
import { fmtRange, fmtTime, milesBetween, QC_CENTER, type Stop, type Status } from "@/data/trucks";
import { useFavorites } from "@/hooks/use-favorites";
import { useAuth } from "@/hooks/use-auth";
import { useTrucks, useStops, dayBounds } from "@/lib/queries";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/favorites")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "My favorite food trucks | FoodTruckQC" },
      { name: "description", content: "Your saved Quad Cities food trucks and their next stops." },
      { property: "og:title", content: "My favorites | FoodTruckQC" },
      { property: "og:description", content: "Saved food trucks and where they'll be next." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Favorites,
});

type F = "all" | "open" | "today";
const PILL: Record<Status, string> = { open: "bg-pin-open-soft", today: "bg-pin-today-soft", none: "bg-muted text-muted-foreground" };
const DOT: Record<Status, string> = { open: "bg-pin-open", today: "bg-pin-today", none: "bg-pin-none" };

function Favorites() {
  const { user, ready, openAuth } = useAuth();
  const { ids, toggle, loading: favLoading } = useFavorites();
  const [here, setHere] = useState(QC_CENTER);
  const [now, setNow] = useState<Date | null>(null);
  const [filter, setFilter] = useState<F>("all");
  useEffect(() => {
    setNow(new Date());
    navigator.geolocation?.getCurrentPosition((p) => setHere({ lat: p.coords.latitude, lng: p.coords.longitude }), () => {}, { timeout: 5000 });
  }, []);
  const [from, to] = useMemo(() => {
    if (!now) return [null, null];
    const [, end] = dayBounds(now); const b = new Date(end); b.setDate(b.getDate() + 13); return [now, b];
  }, [now]);
  const { data: trucks = [], isLoading } = useTrucks();
  const { data: stops = [] } = useStops(from, to, ids);

  const rows = useMemo(() => {
    if (!now) return [];
    return trucks.filter((t) => ids.includes(t.id)).map((t) => {
      const mine = stops.filter((s) => s.truck_id === t.id && s.source !== "apify_maps").sort((a, b) => a.starts_at.localeCompare(b.starts_at));
      const open = mine.find((s) => new Date(s.starts_at) <= now && new Date(s.ends_at) > now);
      const next: Stop | undefined = open ?? mine.find((s) => new Date(s.starts_at) > now);
      const isToday = !!next && new Date(next.starts_at).toDateString() === now.toDateString();
      const status: Status = open ? "open" : isToday ? "today" : "none";
      const loc = next ?? (t.base_lat != null && t.base_lng != null ? { lat: t.base_lat, lng: t.base_lng } : null);
      const label = open ? `Open now · until ${fmtTime(open.ends_at)}`
        : next ? `Next: ${isToday ? "Today" : new Date(next.starts_at).toLocaleDateString("en-US", { weekday: "short" })} ${fmtRange(next)} at ${next.venue_name || next.city}`
          : "Location not confirmed";
      return { t, next, status, isToday: isToday || !!open, label, loc, dist: loc ? milesBetween(here, loc) : Infinity };
    })
      .filter((r) => filter === "all" || (filter === "open" ? r.status === "open" : r.isToday))
      .sort((a, b) => (a.status === "open" ? 0 : 1) - (b.status === "open" ? 0 : 1) || a.dist - b.dist);
  }, [trucks, ids, stops, now, here, filter]);

  const loading = !ready || !now || isLoading || favLoading;
  const total = ids.filter((id) => trucks.some((t) => t.id === id)).length;

  return (
    <main className="min-h-dvh bg-secondary">
      <div className="mx-auto w-full min-w-0 max-w-[1100px] space-y-4 p-4">
        <Link to="/" className="chip">← Map</Link>
        <h1 className="text-2xl font-bold sm:text-3xl">Your favorites{user && !loading ? ` (${total})` : ""}</h1>

        {ready && !user ? (
          <div className="space-y-3 rounded-2xl bg-card p-6 text-center shadow-pop">
            <Heart className="mx-auto h-10 w-10 text-primary" />
            <p className="font-semibold">Sign in to see your favorite trucks</p>
            <p className="text-sm text-muted-foreground">Save trucks on any device and get alerts when they open.</p>
            <button onClick={() => openAuth("Sign in to save your favorite trucks")} className="h-11 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground hover:bg-primary/90">Sign in</button>
          </div>
        ) : (
          <>
            <div className="flex gap-2" role="tablist">
              {(["all", "open", "today"] as F[]).map((f) => (
                <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)} className={`chip h-10 ${filter === f ? "chip-active" : ""}`}>
                  {f === "all" ? "All" : f === "open" ? "Open now" : "Today"}
                </button>
              ))}
            </div>
            {loading ? (
              <ul className="grid gap-3 md:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => (
                <li key={i} className="flex gap-3 rounded-2xl bg-card p-3 shadow-pop"><Skeleton className="h-[72px] w-[72px] rounded-xl" /><div className="flex-1 space-y-2 py-1"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-1/3" /><Skeleton className="h-3 w-1/2" /></div></li>
              ))}</ul>
            ) : total === 0 ? (
              <div className="space-y-3 rounded-2xl bg-card p-8 text-center shadow-pop">
                <div className="text-5xl" aria-hidden>🚚💛</div>
                <p className="font-semibold">No favorites yet</p>
                <p className="text-sm text-muted-foreground">Tap the heart on any truck to save it here</p>
                <Link to="/" className="inline-flex h-11 items-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground hover:bg-primary/90">Find trucks</Link>
              </div>
            ) : rows.length === 0 ? (
              <p className="rounded-2xl bg-card p-6 text-center text-sm text-muted-foreground shadow-pop">None of your favorites match this filter right now.</p>
            ) : (
              <ul className="grid gap-3 md:grid-cols-2">
                {rows.map((r) => (
                  <li key={r.t.id} className="relative rounded-2xl bg-card p-3 shadow-pop">
                    <Link to="/truck/$id" params={{ id: r.t.id }} className="flex items-start gap-3 pr-10">
                      <span className="grid h-[72px] w-[72px] shrink-0 place-items-center overflow-hidden rounded-xl bg-muted text-3xl">
                        {r.t.logo_url ? <img src={r.t.logo_url} alt="" className="h-full w-full object-cover" loading="lazy" /> : r.t.emoji}
                      </span>
                      <span className="min-w-0 flex-1 space-y-0.5">
                        <span className="block truncate font-bold">{r.t.name}</span>
                        {truckByline(r.t.name, r.t.business_name) && <span className="block truncate text-xs text-muted-foreground">{truckByline(r.t.name, r.t.business_name)}</span>}
                        <span className="block truncate text-sm">{r.t.category}{Number.isFinite(r.dist) ? ` · ${r.dist.toFixed(1)} mi` : ""}</span>
                        <span className={`mt-1 inline-flex max-w-full items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${PILL[r.status]}`}>
                          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[r.status]}`} /><span className="truncate">{r.label}</span>
                        </span>
                      </span>
                    </Link>
                    <button onClick={() => toggle(r.t.id)} aria-label="Remove from favorites" className="absolute right-1 top-1 grid h-11 w-11 place-items-center rounded-full hover:bg-muted">
                      <Heart className="h-5 w-5 fill-primary text-primary" />
                    </button>
                    {r.loc && (
                      <a data-truck={r.t.id} target="_blank" rel="noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${r.loc.lat},${r.loc.lng}`}
                        className="mt-3 flex h-11 items-center justify-center gap-2 rounded-xl bg-muted text-sm font-semibold hover:bg-accent">
                        <Navigation className="h-4 w-4" />Directions
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
      <SiteFooter />
    </main>
  );
}
