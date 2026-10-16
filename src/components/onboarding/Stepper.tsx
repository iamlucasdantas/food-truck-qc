import { Building2, Calendar, Camera, Check, ClipboardList, Truck } from "lucide-react";
import { FINISH_STEP, ONBOARDING_STEPS, canGoTo, type Progress } from "@/data/onboarding";

const ICONS = [Building2, Truck, ClipboardList, Camera, Calendar];

/** Icon stepper with progress; completed/reachable steps are tappable. */
export function Stepper({ p, onGo }: { p: Progress; onGo: (i: number) => void }) {
  return (
    <nav aria-label="Setup steps" className="space-y-2">
      <ol className="flex items-center gap-1">
        {ONBOARDING_STEPS.map((s, i) => {
          const Icon = ICONS[i]!;
          const done = p.done.includes(s.key);
          const current = p.step === i;
          const reachable = canGoTo(p, i);
          return (
            <li key={s.key} className="flex flex-1 items-center gap-1 last:flex-none">
              <button
                type="button"
                onClick={() => reachable && onGo(i)}
                disabled={!reachable}
                aria-current={current ? "step" : undefined}
                aria-label={`${s.title}${done ? " (done)" : ""}`}
                className={`grid h-11 w-11 shrink-0 place-items-center rounded-full border transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  done ? "border-primary bg-primary text-primary-foreground"
                  : current ? "border-primary bg-accent text-foreground"
                  : reachable ? "border-input bg-card text-muted-foreground"
                  : "border-border bg-muted text-muted-foreground/50"
                }`}
              >
                {done ? <Check className="h-5 w-5" aria-hidden /> : <Icon className="h-5 w-5" aria-hidden />}
              </button>
              {i < FINISH_STEP - 1 && <span aria-hidden className={`h-0.5 min-w-2 flex-1 rounded-full ${done ? "bg-primary" : "bg-border"}`} />}
            </li>
          );
        })}
      </ol>
      <p className="text-sm font-semibold text-muted-foreground" aria-live="polite">
        {p.step < FINISH_STEP ? `Step ${p.step + 1} of ${FINISH_STEP} · ${ONBOARDING_STEPS[p.step]!.title} · ~${ONBOARDING_STEPS[p.step]!.minutes} min` : "All steps visited"}
      </p>
    </nav>
  );
}
