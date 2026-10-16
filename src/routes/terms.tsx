import { Logo } from "@/components/Logo";
import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Use | FoodTruckQC" },
      { name: "description", content: "The rules for using FoodTruckQC as a visitor or food truck owner." },
      { property: "og:title", content: "Terms of Use | FoodTruckQC" },
      { property: "og:description", content: "Rules for using FoodTruckQC." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <main className="mx-auto max-w-2xl space-y-4 p-4 pb-16">
      <div className="flex items-center justify-between gap-3"><Logo /><Link to="/" className="chip">← Map</Link></div>
      <h1 className="text-3xl font-extrabold">Terms of Use</h1>
      <p className="text-sm text-muted-foreground">Last updated October 2026</p>
      <h2 className="text-xl font-bold">Listings are best effort</h2>
      <p>Truck locations and hours come from owners and public sources and can change without notice. Check with the truck before making a special trip.</p>
      <h2 className="text-xl font-bold">Owner accounts</h2>
      <p>Only claim a truck you own or are authorized to manage. Keep your schedule and live check-ins accurate. FoodTruckQC may remove claims, stops or listings that are false or misleading.</p>
      <h2 className="text-xl font-bold">Acceptable use</h2>
      <p>Don't misuse the service, scrape it at scale or submit unlawful or offensive content.</p>
      <h2 className="text-xl font-bold">No warranty</h2>
      <p>FoodTruckQC is provided as is. FoodTruckQC isn't responsible for food, service or transactions with any truck.</p>
    </main>
  ),
});
