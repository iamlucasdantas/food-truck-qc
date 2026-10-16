import { Check } from "lucide-react";
import { STAGES, truckStage } from "@/data/onboarding";

/** Package-tracker style approval status: Submitted → In review → Approved → Live. */
export function StatusTracker({ status }: { status: string | null | undefined }) {
  const current = STAGES.findIndex((s) => s.key === truckStage(status));
  return (
    <ol className="flex items-center gap-1" aria-label="Approval status">
      {STAGES.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s.key} className="flex flex-1 items-center gap-1 last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <span
                aria-current={active ? "step" : undefined}
                className={`grid h-8 w-8 place-items-center rounded-full border text-xs font-bold ${
                  done ? "border-primary bg-primary text-primary-foreground"
                  : active ? "border-primary bg-accent text-foreground"
                  : "border-border bg-muted text-muted-foreground"
                }`}
              >
                {done ? <Check className="h-4 w-4" aria-hidden /> : i + 1}
              </span>
              <span className={`text-[11px] font-semibold ${active ? "text-foreground" : "text-muted-foreground"}`}>{s.label}</span>
            </div>
            {i < STAGES.length - 1 && <span aria-hidden className={`mb-5 h-0.5 min-w-3 flex-1 rounded-full ${i < current ? "bg-primary" : "bg-border"}`} />}
          </li>
        );
      })}
    </ol>
  );
}
