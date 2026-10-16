import { Heart } from "lucide-react";
import { SiteFooter } from "@/components/SiteFooter";
import { createFileRoute, Link, ClientOnly } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useMemo, useState } from "react";
const TruckMap = lazy(() => import("@/components/TruckMap"));
import { supabase } from "@/integrations/supabase/client";
import { effectivePayments, fmtRange, ownerHandles, publicDescription, SOURCE_LABEL, stopBadge } from "@/data/trucks";
import { useStops, dayBounds, useStopsRealtime } from "@/lib/queries";
import { ClaimButton } from "@/components/ClaimButton";
import { useFavorites } from "@/hooks/use-favorites";

export const Route = createFileRoute("/truck/$id")({
  staticData: { sitemap: true },
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
    const [a] = dayBounds(new Date()); const b = new Date(a); b.setDate(a.getDate() + 30); return [a, b];
  }, []);
  const { data: biz } = useQuery({
    queryKey: ["truck", id, "business", t?.claimed_by],
    enabled: !!t?.claimed_by,
    queryFn: async () => (await supabase.from("businesses").select("*").eq("owner_id", t!.claimed_by!).maybeSingle()).data,
  });
  const { data: allStops = [] } = useStops(from, to, [id]);
  const stops = allStops.filter((s) => s.source !== "apify_maps" || allStops.every((x) => x.source === "apify_maps")).slice(0, 20);
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
          {(t.logo_url ?? biz?.logo_url) ? <img src={(t.logo_url ?? biz?.logo_url)!} alt="" className="h-full w-full object-cover" /> : t.emoji}
        </div>
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-extrabold sm:text-3xl">{t.name}</h1>
          <p className="text-muted-foreground">{t.category}{biz?.name ? ` · ${biz.name}` : ""}</p>
        </div>
        <button onClick={() => toggle(t.id)} aria-label={isFav(t.id) ? "Remove from favorites" : "Save to favorites"} aria-pressed={isFav(t.id)} className="chip h-11"><Heart className={`h-4 w-4 ${isFav(t.id) ? "fill-primary text-primary" : ""}`} />{isFav(t.id) ? "Saved" : "Save"}</button>
      </header>
      {(() => { const d = publicDescription(biz?.description || t.description); return d ? <p className="whitespace-pre-line">{d}</p> : null; })()}
      {(() => {
        const pays = biz || t.payments_same_as_business === false ? effectivePayments(t, biz) : t.accepts_card ? ["Cash", "Credit/debit card"] : ["Cash"];
        return pays.length ? (
          <section aria-label="Accepted payment methods" className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">We accept</span>
            {pays.map((p) => <span key={p} className="inline-flex h-6 items-center rounded-full border border-border bg-card px-2.5 text-xs font-medium">{p}</span>)}
          </section>
        ) : null;
      })()}
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
        <h2 className="mb-3 text-xl font-bold">Upcoming stops</h2>
        {stops.length === 0 && <p className="text-sm text-muted-foreground">No stops scheduled.</p>}
        <ul className="divide-y-2 divide-muted">
          {stops.map((s) => (
            <li key={s.id} className="flex justify-between gap-3 py-2 text-sm">
              <span className="w-24 shrink-0 font-semibold sm:w-28">{new Date(s.starts_at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span>
              <span className="min-w-0 flex-1 text-right">
                {s.venue_name}, {s.city} · {fmtRange(s)}
                <span className="mt-1 inline-block rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">{stopBadge(s)} · {SOURCE_LABEL[s.source]}</span>
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
        {(() => {
          const h = ownerHandles(t, biz);
          const site = biz?.website || t.website;
          const url = (v: string, base: string) => (/^https?:\/\//i.test(v) ? v : v.includes(".") ? `https://${v}` : `${base}${v.replace(/^@|^u\//, "")}`);
          return (
            <>
              {site && <a href={url(site, "https://")} target="_blank" rel="noreferrer" className="chip">🌐 Website</a>}
              {h.instagram && <a href={url(h.instagram, "https://www.instagram.com/")} target="_blank" rel="noreferrer" className="chip">📸 Instagram</a>}
              {h.facebook && <a href={url(h.facebook, "https://www.facebook.com/")} target="_blank" rel="noreferrer" className="chip">👍 Facebook</a>}
              {h.reddit && <a href={url(h.reddit, "https://www.reddit.com/user/")} target="_blank" rel="noreferrer" className="chip">💬 Reddit</a>}
            </>
          );
        })()}
      </section>
      {!t.claimed_by && <ClaimButton truckId={t.id} />}
    <SiteFooter />
    </main>
  );
}
