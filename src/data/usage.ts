/** Pure usage-stat rules for Admin (unit-tested in usage.test.ts). */
type Ev = { kind: string; truck_id: string | null; venue: string | null; visitor: string | null };

const top = (m: Map<string, number>, n = 8) => [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n);

export function summarizeUsage(events: Ev[]) {
  const visitors = new Set<string>(), trucks = new Map<string, number>(), venues = new Map<string, number>();
  let pageViews = 0, truckViews = 0, directions = 0;
  for (const e of events) {
    if (e.visitor) visitors.add(e.visitor);
    if (e.kind === "page_view") pageViews++;
    if (e.kind === "truck_view" && e.truck_id) { truckViews++; trucks.set(e.truck_id, (trucks.get(e.truck_id) ?? 0) + 1); }
    if (e.kind === "direction_click") {
      directions++;
      const v = e.venue?.trim();
      if (v) venues.set(v, (venues.get(v) ?? 0) + 1);
    }
  }
  return { visitors: visitors.size, pageViews, truckViews, directions, topTrucks: top(trucks), topVenues: top(venues) };
}
