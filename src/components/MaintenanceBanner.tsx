import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";

const DISMISS_KEY = "ftqc-maintenance-banner-dismissed";

/**
 * Site-wide maintenance notice shown at the top of every page.
 * Dismissal is remembered in localStorage so it does not nag on every
 * navigation, but it reappears on a fresh browser/session.
 */
export function MaintenanceBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(DISMISS_KEY) !== "1") {
        setVisible(true);
      }
    } catch {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    setVisible(false);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Ignore storage errors; the banner simply reappears next visit.
    }
  };

  return (
    <div
      role="alert"
      className="sticky top-0 z-[60] flex items-center justify-center gap-2 bg-amber-400 px-4 py-2 text-center text-sm font-medium text-amber-950"
    >
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
      <p>
        We're performing maintenance right now. Some features may be slow or
        temporarily unavailable — thanks for your patience!
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss maintenance notice"
        className="ml-2 shrink-0 rounded p-1 transition-colors hover:bg-amber-500/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-900"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
