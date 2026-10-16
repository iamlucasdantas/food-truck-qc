/** Chicago local hours keep scheduled scans stable across daylight-saving changes. */
export const SOCIAL_SCAN_HOURS = [10, 12, 14, 16, 18, 20] as const;
export const SOCIAL_SCAN_CRON = "0 15-2 * * *";

export function isSocialScanTime(now: Date): boolean {
  const hour = Number(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago", hour: "numeric", hourCycle: "h23",
  }).format(now));
  return SOCIAL_SCAN_HOURS.some((scheduledHour) => scheduledHour === hour);
}