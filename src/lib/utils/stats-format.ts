/**
 * Formats cards due count using the localized tooltip key
 */
export function formatCardsDue(
  count: number,
  t: (key: string, args?: Record<string, string | number | Date>) => string
): string {
  return t("future_due_tooltip", { count });
}

/**
 * Formats streak day counts localized
 */
export function formatStreak(
  count: number,
  t: (key: string, args?: Record<string, string | number | Date>) => string
): string {
  return t("streak_days", { count });
}

/**
 * Formats duration in ms to localized hours/minutes/seconds
 */
export function formatStatTime(timeMs: number): string {
  const totalSecs = Math.round(timeMs / 1000);
  const minutes = Math.floor(totalSecs / 60);
  const hours = Math.floor(minutes / 60);
  const displayMins = minutes % 60;

  if (hours > 0) return `${hours}h ${displayMins}m`;
  if (minutes > 0) return `${minutes}m`;
  if (totalSecs > 0) return `${totalSecs}s`;
  return "0m";
}
