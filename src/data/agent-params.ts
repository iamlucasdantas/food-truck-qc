/** Pure cleanup of chat/voice agent parameters (unit-tested in agent-params.test.ts). */

const KNOWN = new Set([
  "query", "location", "city", "cuisine", "dish", "menu_item", "near", "address", "truck_id", "when",
  "open_now", "lat", "lng", "radius_miles", "days", "limit",
]);

/** True for values that mean "not sent": "", null, "null", "undefined", "none", "{{placeholder}}". */
export function isBlankParam(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v !== "string") return false;
  const s = v.trim();
  return s === "" || /^(null|undefined|none|nil|n\/a)$/i.test(s) || /^\{\{.*\}\}$/.test(s);
}

const TRUE = /^(true|yes|y|1|on)$/i;
const FALSE = /^(false|no|n|0|off)$/i;

/** Drops blank/unknown params, normalizes booleans and numeric strings. Returns strings only (schema coerces). */
export function cleanAgentParams(raw: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k0, v0] of Object.entries(raw ?? {})) {
    const k = k0.trim().toLowerCase();
    if (!KNOWN.has(k) || isBlankParam(v0)) continue;
    const v = typeof v0 === "string" ? v0.trim() : typeof v0 === "number" || typeof v0 === "boolean" ? String(v0) : null;
    if (v == null) continue;
    if (k === "open_now") {
      if (TRUE.test(v)) out[k] = "true";
      else if (FALSE.test(v)) out[k] = "false";
      continue;
    }
    if (["radius_miles", "days", "limit", "lat", "lng"].includes(k)) {
      const n = Number(v.replace(/\s+/g, "").replace(/,/g, "."));
      if (!Number.isFinite(n)) continue;
      if (k === "radius_miles") out[k] = String(Math.min(100, Math.max(1, n)));
      else if (k === "days") out[k] = String(Math.min(14, Math.max(1, Math.round(n))));
      else if (k === "limit") out[k] = String(Math.min(50, Math.max(1, Math.round(n))));
      else out[k] = String(n);
      continue;
    }
    if (k === "when") {
      const w = v.toLowerCase().replace(/[\s-]+/g, "_");
      if (["now", "today", "tomorrow", "this_week"].includes(w)) out[k] = w;
      else if (/^\d{4}-\d{2}-\d{2}$/.test(v)) out[k] = v;
      continue; // unrecognized "when" is ignored rather than rejected
    }
    out[k] = v;
  }
  if ((out.lat == null) !== (out.lng == null)) { delete out.lat; delete out.lng; }
  return out;
}

/** How the key arrived, for logs only (never the key itself). */
export type KeyStatus = "matched" | "missing" | "placeholder" | "mismatch";
