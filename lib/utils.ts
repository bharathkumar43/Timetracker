/** Format minutes → "Xh Ym" or "Ym" */
export function formatDuration(minutes: number): string {
  if (minutes === 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Parse user input → minutes.
 *  Accepts: "90", "1.5", "1:30", "1h 30m", "1h30m" */
export function parseDuration(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // "1:30" format
  const colonMatch = trimmed.match(/^(\d+):(\d{1,2})$/);
  if (colonMatch) {
    return parseInt(colonMatch[1]) * 60 + parseInt(colonMatch[2]);
  }

  // "1h 30m" or "1h30m" format
  const hhmm = trimmed.match(/^(?:(\d+)h\s*)?(?:(\d+)m)?$/i);
  if (hhmm && (hhmm[1] || hhmm[2])) {
    return (parseInt(hhmm[1] ?? "0") * 60) + parseInt(hhmm[2] ?? "0");
  }

  // "1.5" decimal hours
  const decimal = parseFloat(trimmed);
  if (!isNaN(decimal) && decimal >= 0) {
    return Math.round(decimal * 60);
  }

  return null;
}

/** Today as YYYY-MM-DD in local time */
export function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Format a YYYY-MM-DD string for display */
export function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}
