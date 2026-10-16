/** "Step X of 2" label + progress bar for the two-step owner registration forms. */
export function StepHeader({ step, titles }: { step: 0 | 1; titles: [string, string] }) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-muted-foreground">Step {step + 1} of 2</p>
        <h2 className="text-right text-base font-bold">{titles[step]}</h2>
      </div>
      <div className="grid grid-cols-2 gap-1" aria-hidden="true">
        <span className="h-1.5 rounded-full bg-primary" />
        <span className={`h-1.5 rounded-full ${step === 1 ? "bg-primary" : "bg-border"}`} />
      </div>
    </div>
  );
}
