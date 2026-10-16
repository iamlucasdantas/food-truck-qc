export type Source = "owner" | "facebook" | "estimated";
export type Window = "now" | "lunch" | "dinner" | "all";

export interface Venue { name: string; city: string; lat: number; lng: number }
export interface Stop { venue: Venue; start: number; end: number; source: Source } // hours, 24h
export interface Truck {
  id: string; name: string; category: string; emoji: string; description: string;
  menu: { item: string; price: number }[]; phone: string; instagram: string;
  acceptsCard: boolean; weekly: (Stop | null)[]; // index 0=Sun
}

export const QC_CENTER = { lat: 41.52, lng: -90.55 };

const VENUES: Venue[] = [
  { name: "LeClaire Park", city: "Davenport", lat: 41.5195, lng: -90.5745 },
  { name: "Freight House Market", city: "Davenport", lat: 41.5179, lng: -90.5833 },
  { name: "Vander Veer Park", city: "Davenport", lat: 41.5404, lng: -90.5717 },
  { name: "NorthPark Mall", city: "Davenport", lat: 41.5743, lng: -90.5612 },
  { name: "Village of East Davenport", city: "Davenport", lat: 41.5276, lng: -90.5465 },
  { name: "Duck Creek Park", city: "Davenport", lat: 41.5470, lng: -90.5300 },
  { name: "Bettendorf Library", city: "Bettendorf", lat: 41.5300, lng: -90.5160 },
  { name: "TBK Bank Sports Complex", city: "Bettendorf", lat: 41.5727, lng: -90.4721 },
  { name: "Leach Park", city: "Bettendorf", lat: 41.5220, lng: -90.4980 },
  { name: "Schwiebert Riverfront Park", city: "Rock Island", lat: 41.5110, lng: -90.5790 },
  { name: "The District", city: "Rock Island", lat: 41.5090, lng: -90.5740 },
  { name: "Augustana College", city: "Rock Island", lat: 41.5040, lng: -90.5500 },
  { name: "Ben Butterworth Pkwy", city: "Moline", lat: 41.5090, lng: -90.5130 },
  { name: "Vibrant Arena", city: "Moline", lat: 41.5078, lng: -90.5165 },
  { name: "John Deere Pavilion", city: "Moline", lat: 41.5070, lng: -90.5200 },
  { name: "SouthPark Mall", city: "Moline", lat: 41.4660, lng: -90.4980 },
  { name: "Empress Park", city: "East Moline", lat: 41.5110, lng: -90.4430 },
  { name: "The Bend", city: "East Moline", lat: 41.5160, lng: -90.4380 },
];

const NAMES: [string, string, string][] = [
  ["Taco Libre", "Tacos", "🌮"], ["Smokestack BBQ", "BBQ", "🍖"], ["River Rolls", "Sushi", "🍣"],
  ["Mighty Melt", "Grilled Cheese", "🧀"], ["Pho Real", "Vietnamese", "🍜"], ["Curbside Pizza Co.", "Pizza", "🍕"],
  ["Sweet Dough", "Desserts", "🍩"], ["Gyro Hero", "Greek", "🥙"], ["Burger Barge", "Burgers", "🍔"],
  ["Seoul Wheels", "Korean", "🥢"], ["Lobster Lane", "Seafood", "🦞"], ["Bean & Bus", "Coffee", "☕"],
  ["El Guapo", "Tacos", "🌮"], ["Pig Iron Smokehouse", "BBQ", "🍖"], ["Curry Up", "Indian", "🍛"],
  ["Hot Dog Hut", "Hot Dogs", "🌭"], ["Mac Attack", "Comfort", "🧀"], ["Wok This Way", "Chinese", "🥡"],
  ["Crepe Escape", "Desserts", "🥞"], ["Falafel Farm", "Mediterranean", "🧆"], ["Brisket Bros", "BBQ", "🍖"],
  ["Arepa Express", "Latin", "🫓"], ["The Frying Dutchman", "Fish & Chips", "🐟"], ["Wing Wagon", "Wings", "🍗"],
  ["Poke Bowl QC", "Hawaiian", "🍱"], ["Cluckin' Good", "Chicken", "🍗"], ["Birria Boss", "Tacos", "🌮"],
  ["Lemonade Larry's", "Drinks", "🍋"], ["Pierogi Pals", "Polish", "🥟"], ["Big Muddy Burgers", "Burgers", "🍔"],
  ["Thai Me Up", "Thai", "🍜"], ["Cajun Queen", "Cajun", "🦐"], ["Waffle Wheels", "Breakfast", "🧇"],
  ["Shave Ice Shack", "Desserts", "🍧"], ["Nacho Average", "Mexican", "🧀"], ["Philly Phil", "Sandwiches", "🥪"],
  ["Kebab Station", "Turkish", "🥙"], ["Ramen Rover", "Japanese", "🍜"], ["Loaded Spud", "Comfort", "🥔"],
  ["Mississippi Smoke", "BBQ", "🍖"], ["Empanada Lady", "Latin", "🥟"], ["Donut Dash", "Desserts", "🍩"],
  ["Banh Mi Bike", "Vietnamese", "🥖"], ["Quad City Dogs", "Hot Dogs", "🌭"], ["Tamale Time", "Mexican", "🫔"],
  ["Pasta La Vista", "Italian", "🍝"], ["Jerk Junction", "Caribbean", "🍗"], ["Mini Pie Co.", "Desserts", "🥧"],
  ["Street Corn King", "Mexican", "🌽"], ["Fry Guy", "Fries", "🍟"], ["Bao Down", "Asian Fusion", "🥟"],
  ["Soup Scoop", "Comfort", "🍲"],
];

function rand(seed: number) {
  let s = seed;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

let cache: Truck[] | null = null;
export function getTrucks(): Truck[] {
  if (cache) return cache;
  cache = NAMES.map(([name, category, emoji], i) => {
    const r = rand(i * 131 + 7);
    const weekly: (Stop | null)[] = Array.from({ length: 7 }, () => {
      if (r() < 0.28) return null;
      const lunch = r() < 0.55;
      const start = lunch ? 11 : 16 + Math.floor(r() * 2);
      const end = lunch ? 14 : 20 + Math.floor(r() * 2);
      const v = VENUES[Math.floor(r() * VENUES.length)]!;
      const venue = { ...v, lat: v.lat + (r() - 0.5) * 0.004, lng: v.lng + (r() - 0.5) * 0.004 };
      const sr = r();
      return { venue, start, end, source: sr < 0.35 ? "owner" : sr < 0.7 ? "facebook" : "estimated" } as Stop;
    });
    const base = 6 + Math.floor(r() * 6);
    return {
      id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
      name, category, emoji,
      description: `Quad Cities favorite serving ${category.toLowerCase()} made fresh to order. Find us around the river all week.`,
      menu: [
        { item: `Signature ${category}`, price: base + 3 },
        { item: `${category} Combo`, price: base + 6 },
        { item: "Side of the day", price: 4 },
        { item: "Drink", price: 2.5 },
      ],
      phone: `(563) 555-${String(1000 + i * 37).slice(-4)}`,
      instagram: "@" + name.toLowerCase().replace(/[^a-z]/g, ""),
      acceptsCard: r() < 0.85,
      weekly,
    };
  });
  return cache;
}

export function getTruck(id: string) { return getTrucks().find((t) => t.id === id); }

export const WINDOWS: Record<Exclude<Window, "now">, [number, number]> = {
  lunch: [11, 14], dinner: [17, 21], all: [0, 24],
};

export type Status = "open" | "today" | "none";

/** Stop for a truck on a date within a time window; status relative to now. */
export function stopFor(t: Truck, date: Date, win: Window, now: Date) {
  const stop = t.weekly[date.getDay()];
  if (!stop) return { stop: null, status: "none" as Status };
  const sameDay = date.toDateString() === now.toDateString();
  const h = now.getHours() + now.getMinutes() / 60;
  if (win === "now") {
    if (!sameDay) return { stop: null, status: "none" as Status };
    if (h >= stop.start && h < stop.end) return { stop, status: "open" as Status };
    if (h < stop.end) return { stop, status: "today" as Status };
    return { stop: null, status: "none" as Status };
  }
  const [a, b] = WINDOWS[win];
  if (stop.end <= a || stop.start >= b) return { stop: null, status: "none" as Status };
  const open = sameDay && h >= stop.start && h < stop.end;
  return { stop, status: (open ? "open" : sameDay ? "today" : "today") as Status };
}

export function milesBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 3958.8, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export function fmtHour(h: number) {
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}${h < 12 ? "am" : "pm"}`;
}

export const SOURCE_LABEL: Record<Source, string> = {
  owner: "Confirmed by owner", facebook: "Imported from Facebook Events", estimated: "Estimated (weekly pattern)",
};
