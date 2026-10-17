import { Logo } from "@/components/Logo";
import { createFileRoute, Link } from "@tanstack/react-router";

const BASE = "https://app.foodtruckqc.com";

export const Route = createFileRoute("/developers")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: "FoodTruckQC API Docs — Quad Cities Food Truck Data" },
      { name: "description", content: "Read-only API for Quad Cities food trucks: search by location, cuisine, menu item, open now and distance from an address." },
      { property: "og:title", content: "FoodTruckQC API Docs" },
      { property: "og:description", content: "Search Quad Cities food trucks and upcoming stops by location, cuisine, dish, open now and radius." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Developers,
});

const PARAMS: [string, string][] = [
  ["query", "Free text over name, cuisine and menu (e.g. tacos)"],
  ["location / city", "City or place name, e.g. Moline"],
  ["cuisine", "Type of food, e.g. bbq, mexican, pizza"],
  ["dish / menu_item", "Item on the published menu, e.g. birria"],
  ["open_now", "true = only trucks open right now"],
  ["near / address", "Your address; results include distance_miles and are sorted nearest first"],
  ["lat + lng", "Coordinates instead of an address"],
  ["radius_miles", "Max distance from near / lat+lng (default 10, max 100)"],
  ["truck_id", "Limit to one truck"],
  ["days", "How many days ahead to look (1–14, default 3)"],
  ["limit", "Max results (1–50)"],
];

function Code({ children }: { children: string }) {
  return <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs"><code>{children}</code></pre>;
}

function Developers() {
  return (
    <main className="mx-auto max-w-3xl space-y-5 p-4 pb-16">
      <div className="flex items-center justify-between gap-3"><Logo /><Link to="/" className="chip">← Map</Link></div>
      <h1 className="text-3xl font-extrabold">FoodTruckQC API</h1>
      <p className="text-muted-foreground">Read-only HTTPS GET endpoints with live Quad Cities food truck data. Only approved trucks are returned and no personal user data is exposed. All responses are JSON.</p>

      <h2 className="text-xl font-bold">Authentication</h2>
      <p><strong>Chat agent endpoints</strong> use the header <code>x-api-key: YOUR_KEY</code> (key issued by FoodTruckQC). <strong>Personal endpoints</strong> use <code>Authorization: Bearer ftqc_…</code> — create a key in your profile under Connected accounts → API keys. Missing or wrong keys return <code>401 {"{"}"error":"unauthorized"{"}"}</code>.</p>

      <h2 className="text-xl font-bold">Endpoints</h2>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        <li><code>GET /api/public/chat-search-trucks</code> — trucks (x-api-key)</li>
        <li><code>GET /api/public/chat-upcoming-stops</code> — upcoming stops, times in Central (x-api-key)</li>
        <li><code>GET /api/public/v1/trucks</code> — trucks (Bearer ftqc_)</li>
        <li><code>GET /api/public/v1/stops</code> — upcoming stops, times in UTC (Bearer ftqc_)</li>
        <li><code>GET /api/public/v1/favorites</code> — the key owner's favorites (Bearer ftqc_)</li>
      </ul>

      <h2 className="text-xl font-bold">Search parameters</h2>
      <p className="text-sm text-muted-foreground">Supported by all truck and stop endpoints; combine freely.</p>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left"><tr><th className="p-2">Parameter</th><th className="p-2">Description</th></tr></thead>
          <tbody>{PARAMS.map(([k, v]) => <tr key={k} className="border-t"><td className="p-2 font-mono text-xs">{k}</td><td className="p-2">{v}</td></tr>)}</tbody>
        </table>
      </div>

      <h2 className="text-xl font-bold">Examples</h2>
      <p className="text-sm">BBQ trucks within 5 miles of an address, open now:</p>
      <Code>{`curl -H "x-api-key: YOUR_KEY" \\
  "${BASE}/api/public/chat-search-trucks?near=2nd%20St%2C%20Davenport&radius_miles=5&cuisine=bbq&open_now=true"`}</Code>
      <p className="text-sm">Response:</p>
      <Code>{`{
  "origin": "West 2nd Street, Davenport, Iowa, 52802, United States",
  "radius_miles": 5,
  "trucks": [{
    "truck_id": "…", "name": "…", "cuisine": "BBQ", "city": "Davenport",
    "open_now": true, "distance_miles": 0.4, "is_base_location": false,
    "current_or_next_stop": { "venue": "…", "address": "…", "starts_at": "Sat, Oct 17, 11:00 AM", "ends_at": "Sat, Oct 17, 2:00 PM" },
    "base_address": null,
    "menu_highlights": ["Brisket plate $14"],
    "app_url": "${BASE}/truck/…"
  }]
}`}</Code>
      <p className="text-sm">Stops in Moline serving tacos over the next 7 days:</p>
      <Code>{`curl -H "x-api-key: YOUR_KEY" "${BASE}/api/public/chat-upcoming-stops?city=Moline&dish=tacos&days=7"`}</Code>
      <p className="text-sm">With a personal key:</p>
      <Code>{`curl -H "Authorization: Bearer ftqc_YOUR_KEY" "${BASE}/api/public/v1/trucks?cuisine=pizza&limit=5"`}</Code>

      <h2 className="text-xl font-bold">Notes</h2>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        <li>Fixed-location trucks without a scheduled stop appear with <code>is_base_location: true</code> and no hours.</li>
        <li>Duplicate announcements of the same outing are merged into one stop.</li>
        <li>An address that can't be found returns <code>400 {"{"}"error":"address not found"{"}"}</code>.</li>
        <li>CORS is enabled on the chat agent endpoints. An MCP server is also available at <code>{BASE}/mcp</code> (sign-in required).</li>
      </ul>
    </main>
  );
}
