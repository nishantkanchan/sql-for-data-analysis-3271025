import { buildQueue, countDue, DAY, formatInterval, isDue, MIN_EASE, newCard, nextIntervals, RELEARN_DELAY, review } from '../src/lib/srs';

const T0 = Date.UTC(2026, 10, 2, 8, 0, 0);

describe('SM-2 review', () => {
  it('starts new cards due now with default ease', () => {
    const c = newCard(T0);
    expect(c.due).toBe(T0);
    expect(c.ease).toBe(2.5);
    expect(isDue(c, T0)).toBe(true);
  });

  it('grows intervals 1d -> 3d -> ~ease x on Good', () => {
    let c = newCard(T0);
    c = review(c, 'good', T0);
    expect(c.interval).toBe(1);
    expect(c.due).toBe(T0 + DAY);
    c = review(c, 'good', c.due);
    expect(c.interval).toBe(3);
    c = review(c, 'good', c.due);
    expect(c.interval).toBe(8); // round(3 * 2.5)
    expect(c.reps).toBe(3);
  });

  it('orders Hard <= Good < Easy for every state', () => {
    let c = newCard(T0);
    for (let i = 0; i < 6; i++) {
      const iv = nextIntervals(c);
      expect(iv.again).toBe(0);
      expect(iv.hard).toBeLessThanOrEqual(iv.good);
      expect(iv.good).toBeLessThan(iv.easy);
      c = review(c, 'good', c.due);
    }
  });

  it('Again resets reps, counts a lapse, lowers ease and relearns in minutes', () => {
    let c = review(review(newCard(T0), 'good', T0), 'good', T0 + DAY);
    const before = c.ease;
    c = review(c, 'again', T0 + 4 * DAY);
    expect(c.reps).toBe(0);
    expect(c.lapses).toBe(1);
    expect(c.ease).toBeCloseTo(before - 0.2, 5);
    expect(c.due).toBe(T0 + 4 * DAY + RELEARN_DELAY);
  });

  it('never lets ease fall below the minimum', () => {
    let c = newCard(T0);
    for (let i = 0; i < 20; i++) c = review(c, 'again', T0 + i);
    expect(c.ease).toBe(MIN_EASE);
  });

  it('Easy raises ease, Hard lowers it', () => {
    const c = newCard(T0);
    expect(review(c, 'easy', T0).ease).toBeGreaterThan(c.ease);
    expect(review(c, 'hard', T0).ease).toBeLessThan(c.ease);
  });
});

describe('queue', () => {
  it('puts due cards first (oldest first) then new cards up to the allowance', () => {
    const states = {
      a: { ...newCard(T0 - 3 * DAY), due: T0 - DAY, reps: 1, interval: 1 },
      b: { ...newCard(T0 - 3 * DAY), due: T0 - 2 * DAY, reps: 1, interval: 1 },
      c: { ...newCard(T0), due: T0 + DAY, reps: 1, interval: 1 },
    };
    const q = buildQueue(['a', 'b', 'c', 'n1', 'n2', 'n3'], states, { now: T0, newAllowance: 2 });
    expect(q.due).toEqual(['b', 'a']);
    expect(q.fresh).toEqual(['n1', 'n2']);
    expect(countDue(['a', 'b', 'c', 'n1'], states, { now: T0, newAllowance: 0 })).toBe(2);
  });
});

describe('formatInterval', () => {
  it('formats minutes, days, weeks, months, years', () => {
    expect(formatInterval(0)).toBe('10m');
    expect(formatInterval(3)).toBe('3d');
    expect(formatInterval(21)).toBe('3w');
    expect(formatInterval(90)).toBe('3mo');
    expect(formatInterval(730)).toBe('2y');
  });
});
