import { useEffect, useState } from "react";
import { X } from "lucide-react";

const STORAGE_KEY = "ftqc:owner-tour-v1";

const TIPS = [
  { title: "Say “I'm here”", body: "One tap puts your truck on the live map for the next 2 hours — extend or end it anytime." },
  { title: "Keep your schedule fresh", body: "Add stops or connect your calendar so customers always know where to find you." },
  { title: "Menu and photos", body: "Snap your menu board and add photos — dishes show up in search and trucks with photos get more visits." },
] as const;

/** First-time owner dashboard tour: 3 short tips, once per browser, dismissible. */
export function DashboardTour() {
  const [step, setStep] = useState(-1);
  useEffect(() => {
    try { if (!localStorage.getItem(STORAGE_KEY)) setStep(0); } catch { /* private mode */ }
  }, []);
  if (step < 0 || step >= TIPS.length) return null;
  const tip = TIPS[step]!;
  const last = step === TIPS.length - 1;
  const close = () => {
    try { localStorage.setItem(STORAGE_KEY, "1"); } catch { /* ignore */ }
    setStep(-1);
  };
  return (
    <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4" role="dialog" aria-label="Quick tour">
      <div className="panel w-full max-w-sm space-y-2 p-4 shadow-pop">
        <div className="flex items-start justify-between gap-2">
          <p className="font-bold">{tip.title}</p>
          <button type="button" onClick={close} aria-label="Close tour" className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <p className="text-sm text-muted-foreground">{tip.body}</p>
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs font-semibold text-muted-foreground">{step + 1} of {TIPS.length}</span>
          <button
            type="button"
            onClick={() => (last ? close() : setStep(step + 1))}
            className="min-h-10 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground"
          >
            {last ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
