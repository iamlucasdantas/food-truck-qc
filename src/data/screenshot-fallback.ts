import type { StopLocation } from "./screenshot-location";

export type ScreenshotLookup = { location?: StopLocation; runId?: string; pending?: boolean; issue?: string; address?: string; city?: string };

/** A provider failure or empty result must never prevent the next plan. */
export async function screenshotFallback(plans: { name: string; lookup: () => Promise<ScreenshotLookup> }[]): Promise<ScreenshotLookup> {
  const issues: string[] = [];
  for (const plan of plans) {
    try {
      const result = await plan.lookup();
      if (result.location || result.runId || result.pending) return result;
      if (result.issue) issues.push(`${plan.name}: ${result.issue}`);
      if (result.address) return { ...result, issue: [...issues, "Address found; confirm its map pin before saving."].join(" · ") };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.error(`[screenshot location] ${plan.name}: ${detail}`);
      issues.push(`${plan.name}: ${detail.slice(0, 180)}`);
    }
  }
  return { issue: issues.join(" · ") || "No unambiguous address found. Confirm the venue manually." };
}