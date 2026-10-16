/** Pure rules for the owner onboarding wizard (shared by the wizard, dashboard card and tests). */

export const ONBOARDING_STEPS = [
  { key: "business", title: "Your business", skippable: false, minutes: 2 },
  { key: "truck", title: "Your food truck", skippable: false, minutes: 1 },
  { key: "menu", title: "Menu photos", skippable: true, minutes: 1 },
  { key: "photos", title: "Truck photos", skippable: true, minutes: 1 },
  { key: "schedule", title: "Schedule", skippable: true, minutes: 1 },
] as const;
export type StepKey = (typeof ONBOARDING_STEPS)[number]["key"];
/** Index shown after the last step. */
export const FINISH_STEP = ONBOARDING_STEPS.length;
/** Total time promise shown on the welcome screen. */
export const TOTAL_MINUTES = ONBOARDING_STEPS.reduce((n, s) => n + s.minutes, 0);

export interface Progress { step: number; done: StepKey[]; skipped: StepKey[]; truckId?: string | null; dismissed?: boolean; welcomed?: boolean }

export function readProgress(raw: unknown): Progress {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Progress>;
  const keys = ONBOARDING_STEPS.map((s) => s.key) as string[];
  const clean = (a: unknown) => (Array.isArray(a) ? a.filter((k): k is StepKey => keys.includes(k as string)) : []);
  return {
    step: Number.isInteger(r.step) ? Math.min(Math.max(r.step!, 0), FINISH_STEP) : 0,
    done: clean(r.done), skipped: clean(r.skipped), truckId: r.truckId ?? null, dismissed: !!r.dismissed, welcomed: !!r.welcomed,
  };
}

/** Where to reopen the wizard: the saved step, never past a required step that isn't done. */
export function resumeStep(p: Progress): number {
  const firstRequired = ONBOARDING_STEPS.findIndex((s) => !s.skippable && !p.done.includes(s.key));
  return firstRequired >= 0 ? Math.min(p.step, firstRequired) : p.step;
}

const uniq = <T,>(a: T[]) => Array.from(new Set(a));

export function completeStep(p: Progress, key: StepKey): Progress {
  const i = ONBOARDING_STEPS.findIndex((s) => s.key === key);
  return { ...p, done: uniq([...p.done, key]), skipped: p.skipped.filter((k) => k !== key), step: Math.max(p.step, i + 1) };
}

/** Optional steps can be skipped; required ones (business, truck) cannot. */
export function skipStep(p: Progress, key: StepKey): Progress {
  const i = ONBOARDING_STEPS.findIndex((s) => s.key === key);
  if (!ONBOARDING_STEPS[i]?.skippable) return p;
  return { ...p, skipped: p.done.includes(key) ? p.skipped : uniq([...p.skipped, key]), step: Math.max(p.step, i + 1) };
}

/** Step navigation: can the owner jump to step i right now? Never past an unfinished required step. */
export function canGoTo(p: Progress, i: number): boolean {
  if (i < 0 || i > FINISH_STEP) return false;
  return i <= resumeStep({ ...p, step: FINISH_STEP });
}

export function checklist(p: Progress) {
  return ONBOARDING_STEPS.map((s, i) => ({ key: s.key, title: s.title, index: i, done: p.done.includes(s.key) }));
}

/** Dashboard "Finish setting up" card shows until every step is done or the owner dismisses it. */
export function showSetupCard(p: Progress) {
  return !p.dismissed && checklist(p).some((c) => !c.done);
}

/** Byline under a truck name: "by {business}" only when it adds information. */
export function truckByline(truckName: string, businessName: string | null | undefined) {
  const b = (businessName ?? "").trim();
  return b && b.toLowerCase() !== truckName.trim().toLowerCase() ? `by ${b}` : "";
}

/** The first truck's name starts as the business name; later trucks start empty (names stay unique). */
export function defaultTruckName(businessName: string, existingTruckNames: string[]) {
  return existingTruckNames.length ? "" : businessName.trim();
}

/* ---------- Profile completeness ring (0–100) ---------- */

export interface CompletenessInput {
  businessName: string;
  description: string;
  logoUrl: string | null;
  paymentMethods: string[];
  truckName: string;
  cuisine: string;
  hasMenu: boolean;
  photoCount: number;
  hasSchedule: boolean;
}

export interface CompletenessPart {
  key: string;
  points: number;
  earned: boolean;
  hint: string;
}

/**
 * Weighted 0–100 profile score. Each part names what it adds so the UI can nudge
 * ("+20% Add photos — trucks with photos get more visits").
 */
export function completeness(c: CompletenessInput): { score: number; parts: CompletenessPart[] } {
  const parts: CompletenessPart[] = [
    { key: "business", points: 15, earned: !!c.businessName.trim(), hint: "Add your business name" },
    { key: "truck", points: 15, earned: !!c.truckName.trim(), hint: "Name your truck" },
    { key: "cuisine", points: 10, earned: !!c.cuisine.trim(), hint: "Pick a cuisine so searchers find you" },
    { key: "description", points: 10, earned: c.description.trim().length >= 20, hint: "Write a short description — tell people what makes you special" },
    { key: "logo", points: 10, earned: !!c.logoUrl, hint: "Add a logo — it shows next to your name everywhere" },
    { key: "payments", points: 5, earned: c.paymentMethods.length > 0, hint: "Add payment methods so customers come prepared" },
    { key: "menu", points: 15, earned: c.hasMenu, hint: "Add your menu — dishes show up in search" },
    { key: "photos", points: 15, earned: c.photoCount > 0, hint: "Add photos — trucks with photos get more visits" },
    { key: "schedule", points: 5, earned: c.hasSchedule, hint: "Add a stop or connect your calendar so people know where to find you" },
  ];
  return { score: parts.reduce((n, p) => n + (p.earned ? p.points : 0), 0), parts };
}

/** Next best thing to do: the highest-value missing part. */
export function nextNudge(c: CompletenessInput): CompletenessPart | null {
  const missing = completeness(c).parts.filter((p) => !p.earned);
  return missing.sort((a, b) => b.points - a.points)[0] ?? null;
}

/* ---------- Social link prefill ---------- */

export interface SocialPrefill {
  platform: "facebook" | "instagram" | "website" | null;
  handle: string;
  url: string;
}

/** Parse a pasted Facebook/Instagram/website link into a platform + handle. Never throws. */
export function parseSocialLink(raw: string): SocialPrefill | null {
  const s = raw.trim();
  if (!s) return null;
  // Bare @handle or handle
  const bare = s.match(/^@?([A-Za-z0-9._]{2,30})$/);
  if (bare) return { platform: "instagram", handle: bare[1]!, url: `https://instagram.com/${bare[1]}` };
  let u: URL;
  try { u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`); } catch { return null; }
  const host = u.hostname.toLowerCase().replace(/^www\.|^m\./, "");
  const path = u.pathname.replace(/\/+$/, "");
  if (host === "facebook.com" || host === "fb.com") {
    const handle = path.split("/").filter(Boolean)[0] ?? "";
    if (!handle || ["pages", "groups", "events", "profile.php"].includes(handle)) return null;
    return { platform: "facebook", handle, url: `https://facebook.com/${handle}` };
  }
  if (host === "instagram.com") {
    const handle = path.split("/").filter(Boolean)[0] ?? "";
    if (!handle || ["p", "reel", "stories", "explore"].includes(handle)) return null;
    return { platform: "instagram", handle, url: `https://instagram.com/${handle}` };
  }
  if (host.includes(".")) return { platform: "website", handle: host, url: u.origin };
  return null;
}

/** Guess a display name from a social handle: "taco.one_qc" → "Taco One Qc". */
export function nameFromHandle(handle: string): string {
  return handle
    .replace(/[._-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

/* ---------- Approval status tracker ---------- */

export type TruckStage = "submitted" | "in_review" | "approved" | "live";
export const STAGES: { key: TruckStage; label: string }[] = [
  { key: "submitted", label: "Submitted" },
  { key: "in_review", label: "In review" },
  { key: "approved", label: "Approved" },
  { key: "live", label: "Live" },
];

/** Map a truck status to the package-tracker stage. */
export function truckStage(status: string | null | undefined): TruckStage {
  if (status === "active") return "live";
  if (status === "approved") return "approved";
  return status === "pending" ? "in_review" : "submitted";
}
