import { supabase } from "@/integrations/supabase/client";

/** First-party usage events for Admin stats (anonymous visitor id; no personal data). */
type Kind = "page_view" | "truck_view" | "direction_click" | "stop_view" | "search";

function visitor(): string {
  try {
    let v = localStorage.getItem("ftqc_v");
    if (!v) { v = crypto.randomUUID(); localStorage.setItem("ftqc_v", v); }
    return v;
  } catch { return ""; }
}

export function track(kind: Kind, extra: { truck_id?: string | null; venue?: string | null; path?: string } = {}) {
  if (typeof window === "undefined" || window.self !== window.top && location.pathname.startsWith("/embed")) return;
  const path = (extra.path ?? location.pathname).slice(0, 300);
  if (path.startsWith("/admin")) return;
  void supabase.from("app_events").insert({ kind, path, truck_id: extra.truck_id?.slice(0, 120) ?? null, venue: extra.venue?.slice(0, 200) ?? null, visitor: visitor() }).then(() => undefined);
}

export function trackNavigation(path: string) {
  track("page_view", { path });
  const m = path.match(/^\/truck\/([^/?#]+)/);
  if (m) track("truck_view", { truck_id: decodeURIComponent(m[1]!), path });
}

let wired = false;
/** Any link to Google Maps directions with data-truck / data-venue counts as a direction click. */
export function wireDirectionClicks() {
  if (wired || typeof document === "undefined") return;
  wired = true;
  document.addEventListener("click", (e) => {
    const a = (e.target as Element | null)?.closest?.("a[href*='google.com/maps/dir']") as HTMLAnchorElement | null;
    if (a) track("direction_click", { truck_id: a.dataset["truck"] ?? null, venue: a.dataset["venue"] ?? null });
  }, { capture: true });
}
