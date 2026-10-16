/** Pure rules for the owner onboarding wizard (shared by the wizard, dashboard card and tests). */

export const ONBOARDING_STEPS = [
  { key: "business", title: "Your business", skippable: false },
  { key: "truck", title: "Your food truck", skippable: false },
  { key: "menu", title: "Menu photos", skippable: true },
  { key: "photos", title: "Truck photos", skippable: true },
  { key: "schedule", title: "Schedule", skippable: true },
] as const;
export type StepKey = (typeof ONBOARDING_STEPS)[number]["key"];
/** Index shown after the last step. */
export const FINISH_STEP = ONBOARDING_STEPS.length;

export interface Progress { step: number; done: StepKey[]; skipped: StepKey[]; truckId?: string | null; dismissed?: boolean }

export function readProgress(raw: unknown): Progress {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Progress>;
  const keys = ONBOARDING_STEPS.map((s) => s.key) as string[];
  const clean = (a: unknown) => (Array.isArray(a) ? a.filter((k): k is StepKey => keys.includes(k as string)) : []);
  return {
    step: Number.isInteger(r.step) ? Math.min(Math.max(r.step!, 0), FINISH_STEP) : 0,
    done: clean(r.done), skipped: clean(r.skipped), truckId: r.truckId ?? null, dismissed: !!r.dismissed,
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
