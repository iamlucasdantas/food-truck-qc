import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy | FoodTruckQC" },
      { name: "description", content: "How FoodTruckQC handles your account, favorites and location data." },
      { property: "og:title", content: "Privacy Policy | FoodTruckQC" },
      { property: "og:description", content: "How FoodTruckQC handles your data." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <main className="mx-auto max-w-2xl space-y-4 p-4 pb-16">
      <Link to="/" className="chip">← Map</Link>
      <h1 className="text-3xl font-extrabold">Privacy Policy</h1>
      <p className="text-sm text-muted-foreground">Last updated October 2026</p>
      <h2 className="text-xl font-bold">What we collect</h2>
      <p>Your email address when you create an account, the trucks you save as favorites, and any claims or truck details you submit. Owners who check in share their truck's location publicly while live.</p>
      <h2 className="text-xl font-bold">Your location</h2>
      <p>If you allow it, your device location is used in your browser to sort nearby trucks. We don't store your personal location.</p>
      <h2 className="text-xl font-bold">How we use it</h2>
      <p>Only to run FoodTruckQC: sign-in, favorites, owner tools and keeping listings accurate. We don't sell your data.</p>
      <h2 className="text-xl font-bold">Third parties</h2>
      <p>Maps are provided by Google Maps and address lookups by OpenStreetMap, which receive the requests needed to show maps and find addresses.</p>
      <h2 className="text-xl font-bold">Your choices</h2>
      <p>You can remove favorites at any time or ask us to delete your account by contacting us.</p>
    </main>
  ),
});
