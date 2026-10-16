import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { fmtRange, milesBetween, QC_CENTER } from "@/data/trucks";
import { useFavorites } from "@/hooks/use-favorites";
import { useAuth } from "@/hooks/use-auth";
import { useTrucks, useStops, dayBounds } from "@/lib/queries";

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

function Favorites() {
  const { user, ready, openAuth } = useAuth();
  const { ids, toggle } = useFavorites();
  const [here, setHere] = useState(QC_CENTER);
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    navigator.geolocation?.getCurrentPosition((p) => setHere({ lat: p.coords.latitude, lng: p.coords.longitude }), () => {}, { timeout: 5000 });
  }, []);
  const [from, to] = useMemo(() => {
    if (!now) return [null, null];
    const [, end] = dayBounds(now); const b = new Date(end); b.setDate(b.getDate() + 13); return [now, b];
  }, [now]);
  const { data: trucks = [] } = useTrucks();
  const { data: stops = [] } = useStops(from, to, ids);
  const mine = trucks.filter((t) => ids.includes(t.id));

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4">
      <Link to="/" className="chip">← Map</Link>
      <h1 className="text-3xl font-extrabold">My favorites</h1>
      {ready && !user && (
        <div className="panel space-y-3 p-5">
          <p>Sign in to save trucks and see where they'll be next.</p>
          <button onClick={() => openAuth()} className="chip bg-primary text-primary-foreground">Sign in</button>
        </div>
      )}
      {user && mine.length === 0 && <p className="text-muted-foreground">Tap ♥ on any truck to save it here.</p>}
      <ul className="space-y-2">
        {mine.map((t) => {
          const n = stops.find((s) => s.truck_id === t.id);
          const isToday = n && now && new Date(n.starts_at).toDateString() === now.toDateString();
          return (
            <li key={t.id} className="panel flex items-center gap-3 p-3">
              <span className="text-3xl">{t.emoji}</span>
              <Link to="/truck/$id" params={{ id: t.id }} className="min-w-0 flex-1">
                <span className="block font-bold">{t.name}</span>
                <span className="block text-sm text-muted-foreground">
                  {n
                    ? `${isToday ? "Today" : new Date(n.starts_at).toLocaleDateString("en-US", { weekday: "long" })} · ${n.venue_name} · ${fmtRange(n)} · ${milesBetween(here, n).toFixed(1)} mi`
                    : "No upcoming stops"}
                </span>
              </Link>
              <button onClick={() => toggle(t.id)} aria-label="Remove favorite" className="chip chip-active">♥</button>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
