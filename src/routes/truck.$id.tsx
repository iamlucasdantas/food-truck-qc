import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fmtRange, SOURCE_LABEL } from "@/data/trucks";
import { useStops, dayBounds } from "@/lib/queries";
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

  if (isLoading) return <main className="p-10 text-center text-muted-foreground">Loading…</main>;
  if (!t) return <div className="p-10 text-center"><p>Truck not found.</p><Link to="/" className="chip mt-4">Back to map</Link></div>;
  const menu = (t.menu as { item: string; price: number }[]) ?? [];

  return (
    <main className="mx-auto max-w-2xl space-y-5 p-4 pb-16">
      <Link to="/" className="chip">← Map</Link>
      <header className="panel flex items-center gap-4 p-5">
        <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-2xl border-2 border-border bg-secondary text-5xl">
          {t.logo_url ? <img src={t.logo_url} alt="" className="h-full w-full object-cover" /> : t.emoji}
        </div>
        <div className="flex-1">
          <h1 className="text-3xl font-extrabold">{t.name}</h1>
          <p className="text-muted-foreground">{t.category} · {t.accepts_card ? "Cards accepted" : "Cash only"}</p>
        </div>
        <button onClick={() => toggle(t.id)} aria-label="Favorite" className={`chip ${isFav(t.id) ? "chip-active" : ""}`}>♥</button>
      </header>
      <p>{t.description}</p>

      <section className="panel p-5">
        <h2 className="mb-3 text-xl font-bold">Next 7 days</h2>
        {stops.length === 0 && <p className="text-sm text-muted-foreground">No stops scheduled.</p>}
        <ul className="divide-y-2 divide-muted">
          {stops.map((s) => (
            <li key={s.id} className="flex justify-between gap-3 py-2 text-sm">
              <span className="w-28 font-semibold">{new Date(s.starts_at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span>
              <span className="flex-1 text-right">
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
    </main>
  );
}
