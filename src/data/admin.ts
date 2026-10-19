/** Pure Admin shell rules (sidebar sections, badge counters, command palette). Unit-tested in admin.test.ts. */

export type AdminSection = "overview" | "claims" | "pending" | "trucks" | "csv" | "apify" | "facebook" | "logs" | "api" | "calendars";

export const ADMIN_SECTIONS: { key: AdminSection; label: string; group: "Workspace" | "Data sources" }[] = [
  { key: "overview", label: "Overview", group: "Workspace" },
  { key: "pending", label: "Pending trucks", group: "Workspace" },
  { key: "claims", label: "Claims", group: "Workspace" },
  { key: "trucks", label: "Trucks", group: "Workspace" },
  { key: "facebook", label: "Facebook", group: "Data sources" },
  { key: "calendars", label: "Calendar sources", group: "Data sources" },
  { key: "apify", label: "Google Maps seed", group: "Data sources" },
  { key: "csv", label: "CSV import", group: "Data sources" },
  { key: "logs", label: "Import logs", group: "Data sources" },
  { key: "api", label: "Agent API log", group: "Data sources" },
];

/** Old pill-tab URLs (?tab=Claims, ?tab=CSV import…) keep working. */
const LEGACY: Record<string, AdminSection> = {
  Claims: "claims", "Pending trucks": "pending", Trucks: "trucks", "CSV import": "csv", Apify: "apify", Facebook: "facebook", Logs: "logs",
};

export function sectionFromSearch(tab: unknown): AdminSection {
  const t = typeof tab === "string" ? tab : "";
  if (ADMIN_SECTIONS.some((s) => s.key === t)) return t as AdminSection;
  return LEGACY[t] ?? "overview";
}
export const sectionLabel = (s: AdminSection) => ADMIN_SECTIONS.find((x) => x.key === s)!.label;

type CountTruck = { status: string; deleted_at: string | null };
type CountClaim = { status: string };

/** Sidebar badges: pending trucks that are not deleted, and claims still waiting for review. */
export function sidebarCounts(trucks: CountTruck[], claims: CountClaim[]): { pending: number; claims: number } {
  return {
    pending: trucks.filter((t) => t.status === "pending" && !t.deleted_at).length,
    claims: claims.filter((c) => c.status === "pending").length,
  };
}

/** Badge text: hidden at 0, capped at 99+. */
export function badgeText(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "";
  return n > 99 ? "99+" : String(Math.floor(n));
}

export type Command = {
  id: string;
  group: "Go to" | "Actions" | "Trucks" | "Claims";
  label: string;
  hint?: string | undefined;
  keywords?: string;
  target: { tab?: AdminSection; truck?: string; extra?: Record<string, string> };
};

type CmdTruck = { id: string; name: string; business_name?: string | null; status: string; deleted_at?: string | null };
type CmdClaim = { id: string; truck_id: string; status: string; user_email?: string | null; truck_name?: string | null };

export function buildCommands(trucks: CmdTruck[], claims: CmdClaim[]): Command[] {
  const nav: Command[] = ADMIN_SECTIONS.map((s) => ({ id: `go:${s.key}`, group: "Go to", label: s.label, target: { tab: s.key } }));
  const actions: Command[] = [
    { id: "act:review-pending", group: "Actions", label: "Review pending trucks", keywords: "approve reject", target: { tab: "pending" } },
    { id: "act:review-claims", group: "Actions", label: "Review open claims", keywords: "approve owner", target: { tab: "claims" } },
    { id: "act:run-facebook", group: "Actions", label: "Run Facebook update", keywords: "scan scrape posts", target: { tab: "facebook" } },
    { id: "act:paste-post", group: "Actions", label: "Paste a post or screenshot", keywords: "facebook text image", target: { tab: "facebook" } },
    { id: "act:import-csv", group: "Actions", label: "Import trucks from CSV", keywords: "upload spreadsheet", target: { tab: "csv" } },
    { id: "act:deleted", group: "Actions", label: "Show deleted trucks (restore)", keywords: "trash undo archive", target: { tab: "trucks", extra: { status: "deleted" } } },
  ];
  const truckCmds: Command[] = trucks.map((t) => ({
    id: `truck:${t.id}`, group: "Trucks", label: t.name,
    hint: t.deleted_at ? "Deleted" : t.status === "pending" ? "Pending" : t.status === "archived" ? "Archived" : (t.business_name || undefined),
    keywords: `${t.business_name ?? ""} ${t.id}`,
    target: { tab: "trucks", truck: t.id },
  }));
  const claimCmds: Command[] = claims.filter((c) => c.status === "pending").map((c) => ({
    id: `claim:${c.id}`, group: "Claims", label: `Claim: ${c.truck_name ?? c.truck_id}`, hint: c.user_email ?? undefined,
    keywords: `${c.user_email ?? ""} ${c.truck_id}`,
    target: { tab: "claims" },
  }));
  return [...nav, ...actions, ...claimCmds, ...truckCmds];
}

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Rank: label starts with query > a word in the label starts with it > substring in label/keywords. Empty query shows navigation and actions only. */
export function filterCommands(items: Command[], query: string, limit = 30): Command[] {
  const q = norm(query.trim());
  if (!q) return items.filter((i) => i.group === "Go to" || i.group === "Actions").slice(0, limit);
  const scored: { c: Command; s: number; i: number }[] = [];
  items.forEach((c, i) => {
    const label = norm(c.label);
    const all = `${label} ${norm(c.keywords ?? "")} ${norm(c.hint ?? "")}`;
    const s = label.startsWith(q) ? 3 : label.split(/[^a-z0-9]+/).some((w) => w.startsWith(q)) ? 2 : all.includes(q) ? 1 : 0;
    if (s) scored.push({ c, s, i });
  });
  return scored.sort((a, b) => b.s - a.s || a.i - b.i).slice(0, limit).map((x) => x.c);
}

export function isPaletteShortcut(e: { key: string; metaKey?: boolean; ctrlKey?: boolean }): boolean {
  return e.key.toLowerCase() === "k" && !!(e.metaKey || e.ctrlKey);
}
