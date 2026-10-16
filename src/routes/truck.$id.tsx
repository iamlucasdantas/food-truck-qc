import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { getTruck, fmtHour, SOURCE_LABEL } from "@/data/trucks";
import { useFavorites } from "@/hooks/use-favorites";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const Route = createFileRoute("/truck/$id")({
  loader: ({ params }) => {
    const t = getTruck(params.id);
    if (!t) throw notFound();
    return { id: t.id, name: t.name, category: t.category };
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.name} — ${loaderData.category} food truck | FoodTruckQC` },
          { name: "description", content: `Where to find ${loaderData.name} in the Quad Cities this week, plus menu and hours.` },
          { property: "og:title", content: `${loaderData.name} | FoodTruckQC` },
          { property: "og:description", content: `Weekly schedule and menu for ${loaderData.name}.` },
          { property: "og:type", content: "website" },
          { name: "twitter:card", content: "summary" },
        ]
      : [{ title: "Truck unavailable | FoodTruckQC" }, { name: "robots", content: "noindex" }],
  }),
  component: TruckPage,
  notFoundComponent: () => (
    <div className="p-10 text-center"><p>Truck not found.</p><Link to="/" className="chip mt-4">Back to map</Link></div>
  ),
});

function TruckPage() {
  const { id } = Route.useLoaderData();
  const t = getTruck(id)!;
  const { isFav, toggle } = useFavorites();
  return (
    <main className="mx-auto max-w-2xl space-y-5 p-4 pb-16">
      <Link to="/" className="chip">← Map</Link>
      <header className="panel flex items-center gap-4 p-5">
        <div className="grid h-20 w-20 shrink-0 place-items-center rounded-2xl border-2 border-border bg-secondary text-5xl">{t.emoji}</div>
        <div className="flex-1">
          <h1 className="text-3xl font-extrabold">{t.name}</h1>
          <p className="text-muted-foreground">{t.category} · {t.acceptsCard ? "Cards accepted" : "Cash only"}</p>
        </div>
        <button onClick={() => toggle(t.id)} className={`chip ${isFav(t.id) ? "chip-active" : ""}`}>♥</button>
      </header>
      <p>{t.description}</p>

      <section className="panel p-5">
        <h2 className="mb-3 text-xl font-bold">This week</h2>
        <ul className="divide-y-2 divide-muted">
          {t.weekly.map((s, i) => (
            <li key={i} className="flex justify-between gap-3 py-2 text-sm">
              <span className="w-24 font-semibold">{DAYS[i]}</span>
              {s ? (
                <span className="flex-1 text-right">
                  {s.venue.name}, {s.venue.city} · {fmtHour(s.start)}–{fmtHour(s.end)}
                  <span className="block text-xs text-muted-foreground">{SOURCE_LABEL[s.source]}</span>
                </span>
              ) : <span className="flex-1 text-right text-muted-foreground">Off</span>}
            </li>
          ))}
        </ul>
      </section>

      <section className="panel p-5">
        <h2 className="mb-3 text-xl font-bold">Menu</h2>
        <ul className="space-y-1 text-sm">
          {t.menu.map((m) => (
            <li key={m.item} className="flex justify-between"><span>{m.item}</span><span className="font-semibold">${m.price.toFixed(2)}</span></li>
          ))}
        </ul>
      </section>

      <section className="flex flex-wrap gap-2">
        <a href={`tel:${t.phone}`} className="chip">📞 {t.phone}</a>
        <span className="chip">📸 {t.instagram}</span>
      </section>
    </main>
  );
}
