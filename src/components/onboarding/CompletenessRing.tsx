import { completeness, nextNudge, type CompletenessInput } from "@/data/onboarding";

/** 0–100 profile completeness ring with the highest-value next nudge. */
export function CompletenessRing({ input, size = 72 }: { input: CompletenessInput; size?: number }) {
  const { score } = completeness(input);
  const nudge = nextNudge(input);
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-3">
      <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`Profile ${score}% complete`}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={8} />
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--primary)" strokeWidth={8} strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)}
            style={{ transition: "stroke-dashoffset 400ms cubic-bezier(0.4,0,0.2,1)" }}
          />
        </svg>
        <span className="absolute inset-0 grid place-items-center text-sm font-extrabold tabular-nums">{score}%</span>
      </div>
      <div className="min-w-0 text-sm">
        <p className="font-bold">{score === 100 ? "Profile complete — looking great!" : "Profile strength"}</p>
        {nudge && <p className="text-muted-foreground">+{nudge.points}% · {nudge.hint}</p>}
      </div>
    </div>
  );
}
