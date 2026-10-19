import { normalizeTruckName } from "@/data/trucks";
import { truckNameScore } from "@/data/agent-food";

export type DupCandidate = { name?: string | null; facebook?: string | null; instagram?: string | null; website?: string | null; phone?: string | null; google_place_id?: string | null };
export type DupTruck = DupCandidate & { id: string; name: string; status?: string; deleted_at?: string | null };
export type DupMatch = { id: string; name: string; status?: string | undefined; reasons: string[]; strong: boolean };

/** Social/website link reduced to host+path so http/www/m./trailing slash/query differences don't matter. */
export function normLink(u: string | null | undefined): string {
  if (!u?.trim()) return "";
  let s = u.trim().toLowerCase();
  if (s.startsWith("@")) s = `instagram.com/${s.slice(1)}`;
  s = s.replace(/^https?:\/\//, "").replace(/^(www\.|m\.|web\.)/, "").replace(/[#].*$/, "");
  // keep ?id= for facebook profile.php links, drop other query strings
  const id = /profile\.php\?(?:.*&)?id=(\d+)/.exec(s)?.[1];
  s = s.replace(/\?.*$/, "").replace(/\/+$/, "");
  return id ? `${s}?id=${id}` : s;
}
const digits = (p: string | null | undefined) => (p ?? "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");

/** Existing trucks that look like the same business: same link/phone/Google place (strong) or a very similar name. */
export function findDuplicates(c: DupCandidate, trucks: DupTruck[]): DupMatch[] {
  const out: DupMatch[] = [];
  for (const t of trucks) {
    if (t.deleted_at) continue;
    const reasons: string[] = [];
    let strong = false;
    if (c.google_place_id && c.google_place_id === t.google_place_id) { reasons.push("Same Google profile"); strong = true; }
    for (const k of ["facebook", "instagram", "website"] as const) {
      const a = normLink(c[k]), b = normLink(t[k]);
      if (a && a === b) { reasons.push(`Same ${k === "website" ? "website" : k[0]!.toUpperCase() + k.slice(1)}`); strong = true; }
    }
    const pa = digits(c.phone), pb = digits(t.phone);
    if (pa.length === 10 && pa === pb) { reasons.push("Same phone"); strong = true; }
    if (c.name?.trim()) {
      const na = normalizeTruckName(c.name), nb = normalizeTruckName(t.name);
      if (na && na === nb) { reasons.push("Same name"); strong = true; }
      else if (Math.max(truckNameScore(c.name, t.name), truckNameScore(t.name, c.name)) >= 0.75) reasons.push("Similar name");
    }
    if (reasons.length) out.push({ id: t.id, name: t.name, status: t.status, reasons, strong });
  }
  return out.sort((a, b) => Number(b.strong) - Number(a.strong) || b.reasons.length - a.reasons.length);
}
