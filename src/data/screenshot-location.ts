import { needsAddressCheck } from "./posts";
import type { StopDraft } from "./stop-drafts";

export type StopLocation = { name: string; address: string; city: string; lat: number; lng: number; source: string };
export type EnrichedStopDraft = StopDraft & { location?: StopLocation; locationIssue?: string };

export function trustedStopLocation(venue: string, hit: StopLocation): boolean {
  return !!hit.address.trim() && Number.isFinite(hit.lat) && Number.isFinite(hit.lng)
    && !needsAddressCheck(venue, hit);
}

export function applyStopLocation(row: StopDraft, hit: StopLocation): EnrichedStopDraft {
  return { ...row, address: hit.address, city: hit.city || row.city, location: hit,
    locationIssue: trustedStopLocation(row.venue, hit) ? undefined : "Check this address before saving." };
}

export function editableStopLocation(row: EnrichedStopDraft, key: keyof StopDraft, value: string): EnrichedStopDraft {
  const changed = row[key] !== value && ["venue", "address", "city"].includes(key);
  return { ...row, [key]: value, ...(changed ? { location: undefined, locationIssue: "Address changed — look up the location again." } : {}) };
}