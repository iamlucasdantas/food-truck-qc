import { socialSourceUrl } from "./social-source-url";

/** Per-truck source kinds shown in Admin → truck → Sources. Groups stay global-only. */
export type TruckSourceKind = "page" | "instagram" | "website" | "calendar" | "gmaps";

export const TRUCK_SOURCE_KINDS: { kind: TruckSourceKind; label: string; placeholder: string }[] = [
  { kind: "page", label: "Facebook page", placeholder: "https://www.facebook.com/…" },
  { kind: "instagram", label: "Instagram", placeholder: "https://www.instagram.com/…" },
  { kind: "website", label: "Website or page", placeholder: "https://…" },
  { kind: "calendar", label: "Calendar link", placeholder: "Google, Outlook or iCloud calendar link" },
  { kind: "gmaps", label: "Google Maps profile", placeholder: "https://maps.app.goo.gl/… or google.com/maps/…" },
];

const CALENDAR_HOSTS = ["calendar.google.com", "outlook.live.com", "outlook.office.com", "outlook.office365.com", "caldav.icloud.com"];

function httpUrl(raw: string): URL | null {
  const value = raw.trim().replace(/^\/\//, "");
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) return null;
    url.protocol = "https:";
    url.hash = "";
    return url;
  } catch { return null; }
}

/** Validate and normalize a per-truck source link. Returns null when the link does not fit the kind. */
export function truckSourceUrl(raw: string, kind: TruckSourceKind): string | null {
  if (kind === "page" || kind === "instagram") return socialSourceUrl(raw, kind);
  const url = httpUrl(raw);
  if (!url) return null;
  const host = url.hostname.toLowerCase();
  if (kind === "calendar") {
    if (!CALENDAR_HOSTS.includes(host) && !/^p\d{2,3}-caldav\.icloud\.com$/.test(host)) return null;
    return url.toString();
  }
  if (kind === "gmaps") {
    const ok = host === "maps.app.goo.gl" || host === "goo.gl" || ((/(^|\.)google\.[a-z.]+$/.test(host)) && url.pathname.startsWith("/maps"));
    return ok ? url.toString() : null;
  }
  return url.toString();
}

export function truckTypeLabel(type: string | null | undefined): string {
  return type === "fixed" ? "Fixed location" : type === "hybrid" ? "Hybrid (fixed spot, also moves)" : "Mobile";
}
