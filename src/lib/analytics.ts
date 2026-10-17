// Google Analytics (GA4) via gtag.js. The measurement ID is public by
// nature (it appears on every site that uses GA), so it lives in a VITE_ var.
const MEASUREMENT_ID = import.meta.env[
  "VITE_GOOGLE_ANALYTICS_MEASUREMENT_ID"
] as string | undefined;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

let initialized = false;

export function initAnalytics() {
  if (initialized || typeof window === "undefined" || !MEASUREMENT_ID) return;
  initialized = true;

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag(...args: unknown[]) {
    window.dataLayer!.push(args);
  };
  window.gtag("js", new Date());
  window.gtag("config", MEASUREMENT_ID);
}

// gtag only auto-tracks the initial page load; call this on client-side
// route changes so every screen counts as a page view.
export function trackPageView(path: string) {
  if (!initialized || !window.gtag) return;
  window.gtag("event", "page_view", { page_path: path });
}
