import { normalizeTruckName, socialHandle } from "@/data/trucks";
import { parseContact } from "@/data/business";

export type MatchReason = "name" | "handle" | "website" | "email";
export type Me = {
  email: string;
  emailConfirmed: boolean;
  businessName: string;
  truckNames: string[];
  website?: string | null;
  facebook?: string | null;
  instagram?: string | null;
  reddit?: string | null;
};
export type Candidate = {
  id: string; name: string; status: string;
  claimed_by: string | null; created_by: string | null; deleted_at: string | null; merged_into: string | null;
  website: string | null; facebook: string | null; instagram: string | null; reddit: string | null;
  description: string | null;
};
export type ClaimMatch = { id: string; reasons: MatchReason[]; automatic: boolean };

/** Website compared by bare domain: no scheme, www, path or trailing slash. */
export function siteDomain(v: string | null | undefined): string {
  const s = (v ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "");
  return s.split(/[/?#]/)[0] ?? "";
}

/**
 * Unclaimed trucks that probably belong to this owner.
 * Pending trucks are only suggested on a confirmed-email match, so nobody learns about someone else's unpublished truck.
 * Only a confirmed-email match is automatic; everything else goes to the admin as a claim.
 */
export function matchClaimCandidates(me: Me, candidates: Candidate[], selfId?: string): ClaimMatch[] {
  const names = new Set([me.businessName, ...me.truckNames].map(normalizeTruckName).filter((n) => n.length >= 3));
  const handles = [me.facebook, me.instagram, me.reddit].map(socialHandle).filter(Boolean);
  const domain = siteDomain(me.website);
  const email = me.emailConfirmed ? me.email.trim().toLowerCase() : "";
  const out: ClaimMatch[] = [];
  for (const t of candidates) {
    if (t.claimed_by || t.deleted_at || t.merged_into || t.status === "archived") continue;
    if (selfId && t.created_by === selfId) continue;
    const reasons: MatchReason[] = [];
    if (email && parseContact(t.description)?.email.trim().toLowerCase() === email) reasons.push("email");
    if (t.status !== "active" && !reasons.includes("email")) continue;
    if (names.has(normalizeTruckName(t.name))) reasons.push("name");
    if (handles.length && [t.facebook, t.instagram, t.reddit].map(socialHandle).some((h) => h && handles.includes(h))) reasons.push("handle");
    if (domain && siteDomain(t.website) === domain) reasons.push("website");
    if (reasons.length) out.push({ id: t.id, reasons, automatic: reasons.includes("email") });
  }
  return out;
}

export const REASON_LABEL: Record<MatchReason, string> = {
  name: "Same name", handle: "Same social profile", website: "Same website", email: "Same email",
};
