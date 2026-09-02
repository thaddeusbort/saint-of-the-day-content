/**
 * Date arithmetic on `yyyy-MM-dd` strings, in UTC.
 *
 * Everything the pipeline computes is a calendar date, not an instant. Using
 * UTC throughout keeps a run's output independent of the runner's timezone,
 * which is part of determinism.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * True for a real calendar date in `yyyy-MM-dd` form.
 *
 * The round-trip matters: V8 silently rolls `2026-02-30` over to 2 March
 * rather than returning NaN, and `prune` uses this to decide whether a
 * published filename names a day inside the window.
 */
export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function parseIsoDate(value: string): Date {
  if (!isIsoDate(value)) {
    throw new Error(`Expected a yyyy-MM-dd date, got ${JSON.stringify(value)}`);
  }
  return new Date(`${value}T00:00:00Z`);
}

export function addDays(value: string, days: number): string {
  const date = parseIsoDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return toIsoDate(date);
}

/** Whole days from `from` to `to`; negative when `to` precedes `from`. */
export function daysBetween(from: string, to: string): number {
  const ms = parseIsoDate(to).getTime() - parseIsoDate(from).getTime();
  return Math.round(ms / 86_400_000);
}

/** Every date in `[start, end]`, inclusive and contiguous. */
export function dateRange(start: string, end: string): string[] {
  const total = daysBetween(start, end);
  if (total < 0) return [];
  const dates: string[] = [];
  for (let offset = 0; offset <= total; offset += 1) {
    dates.push(addDays(start, offset));
  }
  return dates;
}

/** Today's date in UTC. */
export function todayUtc(): string {
  return toIsoDate(new Date());
}
