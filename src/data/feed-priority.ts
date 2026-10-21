/** Only published stops enter this resolver; unapproved suggestions never hide public schedules. */
export type FeedStop = {
  truck_id: string; starts_at: string; ends_at: string; created_at: string;
  source?: string; source_url?: string | null; cancelled?: boolean; series_id?: string | null;
  calendar_source_id?: string | null;
};

export function isFacebookFeed(s: Pick<FeedStop, 'source_url'>): boolean {
  try {
    const host = new URL(s.source_url ?? '').hostname.toLowerCase();
    return host === 'facebook.com' || host.endsWith('.facebook.com') || host === 'fb.watch';
  } catch { return false; }
}

export function stopsOverlap(a: FeedStop, b: FeedStop): boolean {
  return a.truck_id === b.truck_id && Date.parse(a.starts_at) < Date.parse(b.ends_at)
    && Date.parse(b.starts_at) < Date.parse(a.ends_at);
}

/** Manual confirmations are not feeds. Calendar-derived owner rows and recurrence are feeds. */
function manual(s: FeedStop): boolean {
  return s.source === 'owner' && !s.series_id && !s.calendar_source_id && !s.source_url;
}

/** Preserve stored feed identities; Facebook replaces conflicting feed occurrences on read. */
export function resolveFeedConflicts<T extends FeedStop>(stops: T[]): T[] {
  const ranked = stops.filter(s => !s.cancelled).sort((a, b) =>
    Number(isFacebookFeed(b)) - Number(isFacebookFeed(a)) || b.created_at.localeCompare(a.created_at));
  const kept: T[] = [];
  for (const s of ranked) {
    if (!manual(s) && kept.some(winner => isFacebookFeed(winner) && stopsOverlap(winner, s))) continue;
    kept.push(s);
  }
  return kept.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}