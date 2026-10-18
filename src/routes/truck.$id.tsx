import { Heart } from "lucide-react";
import { truckByline } from "@/data/onboarding";
import { SiteFooter } from "@/components/SiteFooter";
import { createFileRoute, Link, ClientOnly } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
const TruckMap = lazy(() => import("@/components/TruckMap"));
import { supabase } from "@/integrations/supabase/client";
import type { MenuSection } from "@/data/menu";
import { TruckGallery } from "@/components/TruckGallery";
import { effectivePayments, fmtCentral, ownerHandles, publicDescription, groupStops } from "@/data/trucks";
import { upcomingStops } from '@/data/public-schedule';
import { PublicTruckSchedule } from '@/components/PublicTruckSchedule';
import { useStops, dayBounds, useStopsRealtime } from "@/lib/queries";
import { ClaimButton } from "@/components/ClaimButton";
import { useProfileLibrary } from "@/hooks/use-profile-library";
import { useFavorites } from "@/hooks/use-favorites";

export const Route = createFileRoute("/truck/$id")({
  staticData: { sitemap: true },
  head: ({ params }) => {
    const name = params.id.split("-").map((w) => w[0]?.toUpperCase() + w.slice(1)).join(" ");
    return {
      meta: [
        { title: `${name} — food truck schedule | FoodTruckQC` },
        { name: "description", content: `Where is ${name} today? See its live location, upcoming stops, menu and hours in Davenport, Bettendorf, Rock Island and Moline.` },
        { property: "og:title", content: `${name} | FoodTruckQC` },
        { property: "og:description", content: `Live location, upcoming stops and menu for ${name} in the Quad Cities.` },
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
  const {recordView}=useProfileLibrary();
  useEffect(()=>{recordView(id);},[id,recordView]);
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
  useStopsRealtime();
  const [mapFailed, setMapFailed] = useState(false);
  const [tick, setTick] = useState<number | null>(null);
  useEffect(() => { setTick(Date.now()); const i = setInterval(() => setTick(Date.now()), 60_000); return () => clearInterval(i); }, []);
  const live = tick ? allStops.find((s) => s.is_live && !s.cancelled && Date.parse(s.starts_at) <= tick && Date.parse(s.ends_at) > tick) : undefined;
  const stops = tick ? upcomingStops(groupStops(allStops.filter(s => s.source !== 'apify_maps' || s.note === 'Google opening hours')), tick) : [];

  if (isLoading) return <main className="p-10 text-center text-muted-foreground">Loading…</main>;
  if (!t) return <div className="p-10 text-center"><p>Truck not found.</p><Link to="/" className="chip mt-4">Back to map</Link></div>;
  const menu = (t.menu as { item: string; price: number }[]) ?? [];
  const sections = t.menu_sections as MenuSection[] | null;

  return (
    <main className="mx-auto w-full max-w-[1100px] min-w-0 space-y-5 p-4 pb-16">
      <Link to="/" className="chip">← Map</Link>
      <header className="panel grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-4 sm:gap-4 sm:p-5">
        <div className="grid h-16 w-16 sm:h-20 sm:w-20 shrink-0 place-items-center overflow-hidden rounded-2xl border-2 border-border bg-secondary text-5xl">
          {(t.logo_url ?? biz?.logo_url) ? <img src={(t.logo_url ?? biz?.logo_url)!} alt="" className="h-full w-full object-cover" /> : t.emoji}
        </div>
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-extrabold sm:text-3xl">{t.name}</h1>
          {truckByline(t.name, biz?.name || t.business_name) && <p className="font-semibold">{truckByline(t.name, biz?.name || t.business_name)}</p>}
          <p className="text-muted-foreground">{t.category}</p>
        </div>
        <button onClick={() => toggle(t.id)} aria-label={isFav(t.id) ? "Remove from favorites" : "Save to favorites"} aria-pressed={isFav(t.id)} className="chip h-11"><Heart className={`h-4 w-4 ${isFav(t.id) ? "fill-primary text-primary" : ""}`} />{isFav(t.id) ? "Saved" : "Save"}</button>
      </header>
      {live && (
        <p className="panel flex items-center gap-2 p-4 font-semibold" role="status">
          <span className="h-2.5 w-2.5 rounded-full bg-pin-open" aria-hidden />Here until {fmtCentral(live.ends_at)} · {live.venue_name}
        </p>
      )}
      <TruckGallery truckId={t.id} name={t.name} />
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
              <div className="min-w-0">
                <p>{s0 ? `${s0.venue_name}, ${s0.city}` : (t.base_address ?? "Base location")}</p>
                {(() => { const o = s0 && tick && Date.parse(s0.starts_at) <= tick && Date.parse(s0.ends_at) > tick; return <p className={`text-xs font-semibold ${o ? "text-foreground" : "text-muted-foreground"}`}>{o ? `Open now · until ${fmtCentral(s0.ends_at)}` : s0 ? `Next open ${fmtCentral(s0.starts_at)}` : "Closed now"}</p>; })()}
              </div>
              <a target="_blank" rel="noreferrer" className="chip" href={`https://www.google.com/maps/dir/?api=1&destination=${pt.lat},${pt.lng}`}>Directions</a>
            </div>
          </section>
        );
      })()}

      <PublicTruckSchedule stops={stops} name={t.name} />

      {sections?.length ? (
        <section id="menu" className="panel scroll-mt-4 p-5" aria-labelledby="menu-h">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="menu-h" className="text-xl font-bold">{t.name} menu</h2>
            {t.menu_updated_at && <p className="text-sm text-muted-foreground">Updated by owner · {new Date(t.menu_updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>}
          </div>
          <div className="space-y-4">
            {sections.map((sec) => (
              <div key={sec.name}>
                <h3 className="mb-1 font-bold">{sec.name}</h3>
                <ul className="divide-y divide-border text-sm">
                  {sec.items.map((m, i) => (
                    <li key={m.name + i} className="flex justify-between gap-3 py-2">
                      <span className="min-w-0">
                        <span className="font-medium">{m.name}</span>
                        {m.tags.length > 0 && <span className="ml-1 text-xs text-muted-foreground">· {m.tags.join(", ")}</span>}
                        {m.description && <span className="block text-muted-foreground">{m.description}</span>}
                      </span>
                      {m.price != null && <span className="shrink-0 font-semibold">${m.price.toFixed(2)}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ) : menu.length > 0 ? (
        <section id="menu" className="panel scroll-mt-4 p-5">
          <h2 className="mb-3 text-xl font-bold">Menu</h2>
          <ul className="space-y-1 text-sm">
            {menu.map((m) => (
              <li key={m.item} className="flex justify-between"><span>{m.item}</span><span className="font-semibold">${m.price.toFixed(2)}</span></li>
            ))}
          </ul>
        </section>
      ) : (
        <section id="menu" className="panel scroll-mt-4 p-5">
          <h2 className="mb-3 text-xl font-bold">Menu</h2>
          <p className="text-sm text-muted-foreground">No menu published yet.</p>
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
