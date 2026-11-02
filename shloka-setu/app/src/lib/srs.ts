/**
 * Spaced repetition: a compact SM-2 variant with four buttons
 * (Again / Hard / Good / Easy). Pure functions, timestamps in epoch ms.
 */

export type Grade = 'again' | 'hard' | 'good' | 'easy';
export const GRADES: Grade[] = ['again', 'hard', 'good', 'easy'];

export interface CardState {
  /** ease factor, >= MIN_EASE */
  ease: number;
  /** current interval in days (0 while relearning) */
  interval: number;
  /** consecutive successful reviews */
  reps: number;
  lapses: number;
  /** next due time (epoch ms) */
  due: number;
  /** last review time (epoch ms) */
  last?: number;
}

export const MINUTE = 60_000;
export const DAY = 86_400_000;
export const MIN_EASE = 1.3;
export const START_EASE = 2.5;
export const RELEARN_DELAY = 10 * MINUTE;
export const MAX_INTERVAL = 365 * 2;

export function newCard(now: number): CardState {
  return { ease: START_EASE, interval: 0, reps: 0, lapses: 0, due: now };
}

const clampEase = (e: number) => Math.max(MIN_EASE, Math.round(e * 100) / 100);
const clampInterval = (d: number) => Math.min(MAX_INTERVAL, Math.max(1, Math.round(d)));

/** Next interval in days for each grade (0 means "again, in a few minutes"). */
export function nextIntervals(state: CardState): Record<Grade, number> {
  const { reps, interval, ease } = state;
  let good: number;
  if (reps === 0) good = 1;
  else if (reps === 1) good = 3;
  else good = clampInterval(Math.max(interval + 1, interval * ease));
  let hard = reps === 0 ? 1 : clampInterval(Math.max(1, interval * 1.2));
  if (hard > good) hard = good;
  let easy = reps === 0 ? 4 : clampInterval(interval * ease * 1.3);
  if (easy <= good) easy = clampInterval(good + 1);
  return { again: 0, hard, good, easy };
}

export function review(state: CardState, grade: Grade, now: number): CardState {
  const iv = nextIntervals(state);
  switch (grade) {
    case 'again':
      return {
        ease: clampEase(state.ease - 0.2),
        interval: 0,
        reps: 0,
        lapses: state.reps > 0 ? state.lapses + 1 : state.lapses,
        due: now + RELEARN_DELAY,
        last: now,
      };
    case 'hard':
      return { ...state, ease: clampEase(state.ease - 0.15), interval: iv.hard, reps: state.reps + 1, due: now + iv.hard * DAY, last: now };
    case 'good':
      return { ...state, interval: iv.good, reps: state.reps + 1, due: now + iv.good * DAY, last: now };
    case 'easy':
      return { ...state, ease: clampEase(state.ease + 0.15), interval: iv.easy, reps: state.reps + 1, due: now + iv.easy * DAY, last: now };
  }
}

export function isDue(state: CardState | undefined, now: number): boolean {
  return !state || state.due <= now;
}

/** Short human label for an interval in days: 10m, 1d, 3w, 2mo, 1y. */
export function formatInterval(days: number): string {
  if (days <= 0) return `${Math.round(RELEARN_DELAY / MINUTE)}m`;
  if (days < 14) return `${days}d`;
  if (days < 60) return `${Math.round(days / 7)}w`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${Math.round((days / 365) * 10) / 10}y`;
}

export interface QueueOptions {
  now: number;
  /** how many brand-new cards may still be introduced today */
  newAllowance: number;
}

export interface Queue {
  due: string[];
  fresh: string[];
}

/**
 * Build today's queue: cards already seen and due (oldest first), then up to
 * `newAllowance` cards never reviewed, in the order given.
 */
export function buildQueue(cardIds: string[], states: Record<string, CardState | undefined>, opts: QueueOptions): Queue {
  const due: { id: string; at: number }[] = [];
  const fresh: string[] = [];
  for (const id of cardIds) {
    const s = states[id];
    if (!s) {
      if (fresh.length < opts.newAllowance) fresh.push(id);
    } else if (s.due <= opts.now) {
      due.push({ id, at: s.due });
    }
  }
  due.sort((a, b) => a.at - b.at);
  return { due: due.map((d) => d.id), fresh };
}

export function countDue(cardIds: string[], states: Record<string, CardState | undefined>, opts: QueueOptions): number {
  const q = buildQueue(cardIds, states, opts);
  return q.due.length + q.fresh.length;
}
