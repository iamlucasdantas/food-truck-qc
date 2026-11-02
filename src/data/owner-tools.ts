// Pure rules shared by the owner MCP tools (my_truck, register_my_truck, update_my_truck,
// add_my_stop, check_in, check_out). No I/O here so the rules can be unit-tested; the tools in
// src/lib/mcp/tools/owner-*.ts do the Supabase calls, running as the caller (RLS applies).
import { centralToUtc, chicagoDate, liveEnd, LIVE_DEFAULT_MINUTES, slugify, type LiveChoice } from "./trucks";

export const SIGN_IN_HINT = "Sign in first. In the FoodTruckQC app open Profile & settings → Connected accounts → API keys, create a key and paste it into your AI as the FoodTruckQC connector (Authorization: Bearer ftqc_…).";

export type OwnedTruck = { id: string; name: string; status: string; claimed_by: string | null; created_by: string | null };

/** Trucks an owner may manage: the ones they claimed or created. */
export function ownsTruck(t: OwnedTruck, userId: string): boolean {
  return t.claimed_by === userId || t.created_by === userId;
}

/** Resolve which of the caller's trucks a tool call means. */
export function pickMyTruck<T extends OwnedTruck>(mine: T[], truckId?: string | null): { ok: true; truck: T } | { ok: false; error: string } {
  if (truckId) {
    const t = mine.find((x) => x.id === truckId);
    return t ? { ok: true, truck: t } : { ok: false, error: `Truck ${truckId} isn't linked to your account. Your trucks: ${mine.map((x) => `${x.name} (${x.id})`).join(", ") || "none yet"}.` };
  }
  if (mine.length === 0) return { ok: false, error: "You don't have a truck on FoodTruckQC yet. Use register_my_truck to add it, or claim it on its public page in the app." };
  if (mine.length === 1) return { ok: true, truck: mine[0]! };
  return { ok: false, error: `You have ${mine.length} trucks — say which one (truck_id): ${mine.map((x) => `${x.name} (${x.id})`).join(", ")}.` };
}

export const newTruckId = (name: string) => `${slugify(name) || "truck"}-${Math.random().toString(36).slice(2, 6)}`;
export const publicTruckUrl = (id: string) => `https://app.foodtruckqc.com/truck/${id}`;

/** Checklist shown to owners: what still keeps their page from converting. */
export function missingFor(t: { phone: string | null; description: string; base_address: string | null; truck_type: string | null; menu_sections: unknown }, counts: { photos: number; upcomingStops: number }): string[] {
  const out: string[] = [];
  if (counts.photos === 0) out.push("truck photos");
  if (!t.menu_sections || (Array.isArray(t.menu_sections) && t.menu_sections.length === 0)) out.push("menu");
  if (counts.upcomingStops === 0 && t.truck_type !== "fixed") out.push("upcoming stops (schedule)");
  if (!t.phone) out.push("phone");
  if (t.truck_type === "fixed" && !t.base_address) out.push("address (fixed trucks need one to show on the map)");
  return out;
}

export function statusLine(status: string): string {
  if (status === "active") return "Live on the public map.";
  if (status === "pending") return "Pending review by the FoodTruckQC team — it shows on the map once approved (usually within a day).";
  if (status === "archived") return "Archived — not shown on the map. Ask FoodTruckQC to reactivate it.";
  return status;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/, TIME_RE = /^\d{1,2}:\d{2}$/;

/**
 * Dated stop window in Central time. Like the owner schedule editor, an end at or before the start
 * means the stop runs past midnight (late-night trucks), so it rolls to the next day.
 */
export function stopWindow(date: string, start: string, end: string): { ok: true; starts_at: string; ends_at: string } | { ok: false; error: string } {
  if (!DATE_RE.test(date)) return { ok: false, error: "date must be YYYY-MM-DD." };
  if (!TIME_RE.test(start) || !TIME_RE.test(end)) return { ok: false, error: "start and end must be HH:MM (24h, Central time)." };
  const s = centralToUtc(date, start);
  let e = centralToUtc(date, end);
  if (e <= s) e = new Date(e.getTime() + 86_400_000);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return { ok: false, error: "Couldn't read that date/time." };
  return { ok: true, starts_at: s.toISOString(), ends_at: e.toISOString() };
}

/** Weekday (0 = Sunday) of a Central date, as the schedule editor stores it. */
export function weekdayOf(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

/** "I'm here" end time from minutes or an HH:MM Central wall-clock; same limits as the dashboard button. */
export function checkInEnd(input: { minutes?: number | undefined; until?: string | undefined }, now = new Date()): { ok: true; end: Date; choice: LiveChoice } | { ok: false; error: string } {
  if (input.minutes !== undefined && input.until) return { ok: false, error: "Give minutes or until, not both." };
  const choice: LiveChoice = input.until ? { kind: "until", time: input.until.padStart(5, "0") } : { kind: "minutes", minutes: input.minutes ?? LIVE_DEFAULT_MINUTES };
  const r = liveEnd(choice, now);
  return r.ok ? { ok: true, end: r.end, choice } : r;
}

export const todayCentral = () => chicagoDate();

/** Normalise an Instagram/Facebook value the way owners type it ("@taco_one", full URL, or handle). */
export function cleanHandle(v: string | null | undefined): string | null {
  if (v === undefined || v === null) return v ?? null;
  const t = v.trim();
  return t ? t : null;
}
