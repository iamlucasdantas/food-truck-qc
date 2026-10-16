export type ProfileView = "owner" | "foodie";
export function profileView(roles: readonly string[], hasTruck: boolean, requested?: string): ProfileView {
  const owner = roles.includes("owner") || hasTruck;
  return owner && requested !== "foodie" ? "owner" : "foodie";
}
export const NOTIFICATION_DEFAULTS = {
  nearby: false, favorite_open: true, menu: false, digest: false,
  claim_decision: true, stop_suggestions: true, owner_summary: false,
  quiet_enabled: false, quiet_start: "22:00", quiet_end: "08:00", radius: 10,
};
export type Notifications = typeof NOTIFICATION_DEFAULTS;
export function readNotifications(raw: unknown): Notifications {
  const v = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const n = { ...NOTIFICATION_DEFAULTS };
  for (const key of ["nearby", "favorite_open", "menu", "digest", "claim_decision", "stop_suggestions", "owner_summary", "quiet_enabled"] as const) {
    if (typeof v[key] === "boolean") n[key] = v[key];
  }
  for (const key of ["quiet_start", "quiet_end"] as const) {
    if (typeof v[key] === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v[key])) n[key] = v[key];
  }
  if (typeof v.radius === "number" && Number.isFinite(v.radius)) n.radius = Math.max(1, Math.min(50, v.radius));
  return n;
}
export function foodieLevel(favorites: number, visits: readonly { truck_id: string; visited_at: string | null }[]) {
  const tried = new Set(visits.filter(v => v.visited_at).map(v => v.truck_id)).size;
  const early = visits.some(v => v.visited_at && Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "numeric", hourCycle: "h23" }).format(new Date(v.visited_at))) < 11);
  const badges = [
    { key: "first", label: "First favorite", earned: favorites > 0 },
    { key: "five", label: "Tried 5 trucks", earned: tried >= 5 },
    { key: "early", label: "Early bird", earned: early },
  ];
  const earned = badges.filter(b => b.earned).length;
  return { badges, tried, score: Math.round(earned / 3 * 100), label: ["Curious Foodie", "Local explorer", "Flavor finder", "QC regular"][earned] ?? "Curious Foodie" };
}