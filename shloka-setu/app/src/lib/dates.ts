/** Local-calendar day helpers for streaks. */

export function dayKey(d: Date | number = new Date()): string {
  const x = typeof d === 'number' ? new Date(d) : d;
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${x.getFullYear()}-${m}-${day}`;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Consecutive active days ending today (or yesterday, so the streak survives until tonight). */
export function computeStreak(activeDays: Record<string, number> | Set<string>, today: Date = new Date()): number {
  const has = (k: string) => (activeDays instanceof Set ? activeDays.has(k) : (activeDays[k] ?? 0) > 0);
  let cursor = today;
  if (!has(dayKey(cursor))) {
    cursor = addDays(cursor, -1);
    if (!has(dayKey(cursor))) return 0;
  }
  let streak = 0;
  while (has(dayKey(cursor))) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/** Day-of-year based integer, stable for a calendar day. */
export function daySeed(d: Date = new Date()): number {
  const start = new Date(d.getFullYear(), 0, 0);
  const doy = Math.floor((d.getTime() - start.getTime()) / 86_400_000);
  return d.getFullYear() * 1000 + doy;
}

/** Last `n` days as keys, oldest first. */
export function lastDays(n: number, today: Date = new Date()): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(dayKey(addDays(today, -i)));
  return out;
}
