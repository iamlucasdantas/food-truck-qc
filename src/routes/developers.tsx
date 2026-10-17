import { Logo } from "@/components/Logo";
import { createFileRoute, Link } from "@tanstack/react-router";

import examples from "@/data/agent-api-examples.json";

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
  ["location", "Smart city, typo, QC alias, address or landmark. Empty defaults to Quad Cities: 15 miles around Davenport (41.5236, -90.5776). Cities use 5 miles plus saved-city matches; addresses use 5 miles. Berendorf IA resolves to Bettendorf. State suffixes and downtown are ignored."],
  ["city / near / address / lat + lng", "Backwards-compatible aliases for location. Precedence: location, city, near, address, then coordinate pair. QC, QCA, quad cities, around here and anywhere mean the whole region."],
  ["radius_miles", "Override radius: 1–100 miles. Defaults: region 15; city/address 5."],
  ["cuisine", "Cuisine plus synonyms: tacos/taqueria/Mexican, BBQ/barbecue/smoked, burgers, Asian, dessert and more."],
  ["dish / menu_item", "Fuzzy, plural-insensitive published item names/descriptions; quesabirria matches Birria Tacos. Description fallback only without a menu."],
  ["query", "Fuzzy truck name, cuisine, description and published menu; exact truck names first."],
  ["open_now", "true = a real stop happening now; base locations never count as open."],
  ["when", "now, today, tomorrow, this_week (through Sunday), or YYYY-MM-DD. Chicago time; search defaults today."],
  ["days", "Upcoming window: 1–14 days, default 3; when overrides days."],
  ["truck_id", "Only one truck (IDs may contain letters/numbers/hyphens)."],
  ["limit", "1–50, default 10; count is the number returned, not total matches."],
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
      <p className="text-sm text-muted-foreground">Smart behavior is shared by the two chat endpoints and MCP search_trucks / upcoming_stops; combine filters freely. Personal endpoints retain their existing response fields.</p>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left"><tr><th className="p-2">Parameter</th><th className="p-2">Description</th></tr></thead>
          <tbody>{PARAMS.map(([k, v]) => <tr key={k} className="border-t"><td className="p-2 font-mono text-xs">{k}</td><td className="p-2">{v}</td></tr>)}</tbody>
        </table>
      </div>

      <h2 className="text-xl font-bold">Response</h2>
      <p className="text-sm">Both chat endpoints and MCP tools return resolved_location, filters, count, results, message and next_available. Each result has truck_id, name, cuisine, open_now, is_base_location, distance_miles, stop, base_address, matched_on, matched_items, menu_highlights and app_url. Stops use Central time. Legacy trucks, stops, current_or_next_stop and origin remain available.</p>
      <Code>{JSON.stringify(examples[0]?.response, null, 2)}</Code>
      <h2 className="text-xl font-bold">Verified example requests</h2>
      <p className="text-sm text-muted-foreground">Real responses captured October 17, 2026. Opening hours and results change over time; no menu or schedule is invented.</p>
      {examples.map((example, i) => <section key={example.request} className="space-y-2 border-t pt-4">
        <h3 className="font-semibold">{i + 1}. {example.request}</h3>
        <Code>{`curl -H "x-api-key: YOUR_KEY" "${BASE}/api/public/${example.request}"`}</Code>
        <p className="text-sm">HTTP {example.status} · {example.response.count} results</p>
        <details><summary className="cursor-pointer text-sm font-medium">Real JSON response</summary><Code>{JSON.stringify(example.response, null, 2)}</Code></details>
      </section>)}
      <h2 className="text-xl font-bold">Notes</h2>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        <li>Fixed-location trucks without a scheduled stop appear with <code>is_base_location: true</code> and no hours.</li>
        <li>Weekly/biweekly/monthly schedules expand into real Chicago-time stops. Duplicate announcements of the same outing are merged.</li>
        <li>An unresolved location returns HTTP 400 with error "location not found" and hint "try a city like Davenport or a nearby street".</li>
        <li>Restaurants and chains are excluded; Admin can change the food truck classification. Zero results include the next matching stop within 7 days when known.</li>
        <li>Results sort open now, soonest stop, then distance; an exact truck-name search takes priority.</li>
        <li>CORS is enabled on the chat agent endpoints. An MCP server is also available at <code>{BASE}/mcp</code> (sign-in required).</li>
      </ul>
    </main>
  );
}
