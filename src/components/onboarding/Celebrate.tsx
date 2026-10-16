import { useEffect, useState } from "react";
import { Check } from "lucide-react";

const COLORS = ["#ef4f18", "#3fc168", "#f9ad26", "#271610"];

/**
 * Celebratory micro-moment after a milestone: an animated check badge plus a
 * small confetti burst. Fully disabled under prefers-reduced-motion.
 */
export function Celebrate({ show, label }: { show: boolean; label: string }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!show) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 1800);
    return () => clearTimeout(t);
  }, [show]);
  if (!visible) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-16 z-50 flex justify-center" role="status" aria-live="polite">
      <div className="relative flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 shadow-pop">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-primary text-primary-foreground motion-safe:animate-[pop_300ms_cubic-bezier(0.34,1.56,0.64,1)]">
          <Check className="h-4 w-4" aria-hidden />
        </span>
        <span className="text-sm font-bold">{label}</span>
        <span aria-hidden className="absolute inset-0 motion-safe:animate-[confetti_1200ms_ease-out_forwards]">
          {COLORS.map((c, i) => (
            <span key={i} className="absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full"
              style={{ background: c, transform: `rotate(${i * 90 + 45}deg) translateY(-22px)` }} />
          ))}
        </span>
      </div>
    </div>
  );
}
