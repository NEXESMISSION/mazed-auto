// Pure helpers around the `auction.blackout.*` platform settings. Lives
// in its own module (no Supabase import) so both server code and client
// components can use it without pulling in `next/headers`.

/** Each entry is `[startHour, endHour)` in 24-hour local time. If
 *  `endHour < startHour` the window wraps past midnight. */
export type BlackoutWindow = [number, number];

export function isInBlackout(
  date: Date,
  windows: BlackoutWindow[],
  timezone: string,
): boolean {
  if (windows.length === 0) return false;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    hour12: false,
  }).formatToParts(date);
  const hourPart = parts.find((p) => p.type === "hour");
  const hour = Number(hourPart?.value ?? "0");
  for (const [start, end] of windows) {
    if (start === end) continue;
    if (start < end) {
      if (hour >= start && hour < end) return true;
    } else {
      if (hour >= start || hour < end) return true;
    }
  }
  return false;
}

export function formatBlackoutWindows(windows: BlackoutWindow[]): string {
  return windows
    .map(([s, e]) => `${String(s).padStart(2, "0")}h – ${String(e).padStart(2, "0")}h`)
    .join(", ");
}
