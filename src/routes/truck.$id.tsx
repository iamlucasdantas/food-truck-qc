import { Heart } from "lucide-react";
import { SiteFooter } from "@/components/SiteFooter";
import { createFileRoute, Link, ClientOnly } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useMemo, useState } from "react";
const TruckMap = lazy(() => import("@/components/TruckMap"));
import { supabase } from "@/integrations/supabase/client";
import { fmtRange, SOURCE_LABEL } from "@/data/trucks";
import { useStops, dayBounds, useStopsRealtime } from "@/lib/queries";
import { ClaimButton } from "@/components/ClaimButton";
import { useFavorites } from "@/hooks/use-favorites";

export const Route = createFileRoute("/truck/$id")({
  head: ({ params }) => {
    const name = params.id.split("-").map((w) => w[0]?.toUpperCase() + w.slice(1)).join(" ");
    return {
      meta: [
        { title: `${name} — food truck schedule | FoodTruckQC` },
        { name: "description", content: `Where to find ${name} in the Quad Cities this week, plus menu and hours.` },
        { property: "og:title", content: `${name} | FoodTruckQC` },
        { property: "og:description", content: `Weekly schedule and menu for ${name}.` },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  component: TruckPage,
});

function TruckPage() {
  const { id } = Route.useParams();
  const { isFav, toggle } = useFavorites();
  const { data: t, isLoading } = useQuery({
    queryKey: ["truck", id],
    queryFn: async () => (await supabase.from("trucks").select("*").eq("id", id).maybeSingle()).data,
  });
  const [from, to] = useMemo(() => {
    const [a] = dayBounds(new Date()); const b = new Date(a); b.setDate(a.getDate() + 7); return [a, b];
  }, []);
  const { data: stops = [] } = useStops(from, to, [id]);
  useStopsRealtime();
  const [mapFailed, setMapFailed] = useState(false);

  if (isLoading) return <main className="p-10 text-center text-muted-foreground">Loading…</main>;
  if (!t) return <div className="p-10 text-center"><p>Truck not found.</p><Link to="/" className="chip mt-4">Back to map</Link></div>;
  const menu = (t.menu as { item: string; price: number }[]) ?? [];

  return (
    <main className="mx-auto w-full max-w-[1100px] min-w-0 space-y-5 p-4 pb-16">
      <Link to="/" className="chip">← Map</Link>
      <header className="panel grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-4 sm:gap-4 sm:p-5">
        <div className="grid h-16 w-16 sm:h-20 sm:w-20 shrink-0 place-items-center overflow-hidden rounded-2xl border-2 border-border bg-secondary text-5xl">
          {t.logo_url ? <img src={t.logo_url} alt="" className="h-full w-full object-cover" /> : t.emoji}
        </div>
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-extrabold sm:text-3xl">{t.name}</h1>
          <p className="text-muted-foreground">{t.category} · {t.accepts_card ? "Cards accepted" : "Cash only"}</p>
        </div>
        <button onClick={() => toggle(t.id)} aria-label={isFav(t.id) ? "Remove from favorites" : "Save to favorites"} aria-pressed={isFav(t.id)} className="chip h-11"><Heart className={`h-4 w-4 ${isFav(t.id) ? "fill-primary text-primary" : ""}`} />{isFav(t.id) ? "Saved" : "Save"}</button>
      </header>
      <p>{t.description}</p>
      {(() => {
        const s0 = stops[0];
        const pt = s0 ? { lat: s0.lat, lng: s0.lng } : t.base_lat != null && t.base_lng != null ? { lat: t.base_lat, lng: t.base_lng } : null;
        if (!pt || mapFailed) return null;
        return (
          <section className="panel overflow-hidden">
            <div className="h-56 sm:h-72">
              <ClientOnly fallback={<div className="h-full bg-muted" />}>
                <Suspense fallback={<div className="h-full bg-muted" />}>
                  <TruckMap pins={[{ id: t.id, ...pt, status: s0 ? "today" : "none", emoji: t.emoji, name: t.name }]} center={pt} radiusMi={0} zoom={14}
                    showRadius={false} draggable={false} onSelect={() => {}} onCenterChange={() => {}} onFail={() => setMapFailed(true)} />
                </Suspense>
              </ClientOnly>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <span className="min-w-0">{s0 ? `${s0.venue_name}, ${s0.city}` : (t.base_address ?? "Base location (not confirmed)")}</span>
              <a target="_blank" rel="noreferrer" className="chip" href={`https://www.google.com/maps/dir/?api=1&destination=${pt.lat},${pt.lng}`}>Directions</a>
            </div>
          </section>
        );
      })()}

      <section className="panel p-5">
        <h2 className="mb-3 text-xl font-bold">Next 7 days</h2>
        {stops.length === 0 && <p className="text-sm text-muted-foreground">No stops scheduled.</p>}
        <ul className="divide-y-2 divide-muted">
          {stops.map((s) => (
            <li key={s.id} className="flex justify-between gap-3 py-2 text-sm">
              <span className="w-24 shrink-0 font-semibold sm:w-28">{new Date(s.starts_at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span>
              <span className="min-w-0 flex-1 text-right">
                {s.venue_name}, {s.city} · {fmtRange(s)}
                <span className="block text-xs text-muted-foreground">{SOURCE_LABEL[s.source]}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {menu.length > 0 && (
        <section className="panel p-5">
          <h2 className="mb-3 text-xl font-bold">Menu</h2>
          <ul className="space-y-1 text-sm">
            {menu.map((m) => (
              <li key={m.item} className="flex justify-between"><span>{m.item}</span><span className="font-semibold">${m.price.toFixed(2)}</span></li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-wrap gap-2">
        {t.phone && <a href={`tel:${t.phone}`} className="chip">📞 {t.phone}</a>}
        {t.instagram && <span className="chip">📸 {t.instagram}</span>}
      </section>
      {!t.claimed_by && <ClaimButton truckId={t.id} />}
    <SiteFooter />
    </main>
  );
}
