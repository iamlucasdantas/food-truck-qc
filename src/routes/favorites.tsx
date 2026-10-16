import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getTrucks, fmtHour } from "@/data/trucks";
import { useFavorites } from "@/hooks/use-favorites";

export const Route = createFileRoute("/favorites")({
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

function nextStop(weekly: ReturnType<typeof getTrucks>[number]["weekly"], now: Date) {
  for (let i = 0; i < 7; i++) {
    const d = new Date(now); d.setDate(now.getDate() + i);
    const s = weekly[d.getDay()];
    if (s && (i > 0 || now.getHours() < s.end)) return { s, d, i };
  }
  return null;
}

function Favorites() {
  const { ids, toggle } = useFavorites();
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);
  const trucks = getTrucks().filter((t) => ids.includes(t.id));
  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4">
      <Link to="/" className="chip">← Map</Link>
      <h1 className="text-3xl font-extrabold">My favorites</h1>
      {trucks.length === 0 && <p className="text-muted-foreground">Tap ♥ on any truck to save it here.</p>}
      <ul className="space-y-2">
        {now && trucks.map((t) => {
          const n = nextStop(t.weekly, now);
          return (
            <li key={t.id} className="panel flex items-center gap-3 p-3">
              <span className="text-3xl">{t.emoji}</span>
              <Link to="/truck/$id" params={{ id: t.id }} className="flex-1">
                <span className="block font-bold">{t.name}</span>
                <span className="block text-sm text-muted-foreground">
                  {n ? `${n.i === 0 ? "Today" : n.d.toLocaleDateString("en-US", { weekday: "long" })} · ${n.s.venue.name} · ${fmtHour(n.s.start)}–${fmtHour(n.s.end)}` : "No upcoming stops"}
                </span>
              </Link>
              <button onClick={() => toggle(t.id)} className="chip chip-active">♥</button>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
