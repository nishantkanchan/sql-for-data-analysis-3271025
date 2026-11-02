import { answer, buildSession, isCorrect, mergeStats, scoreSession, shuffle, verdict } from '../src/lib/quiz';
import type { QuizQuestion } from '../src/types/content';

function q(id: string, topic: string, answerIndex = 1): QuizQuestion {
  return {
    id,
    subject_id: 'AyUG-PV',
    topic_id: topic,
    type: 'mcq',
    question_en: `Q ${id}`,
    question_hi: `प्रश्न ${id}`,
    options: [
      { en: 'A', hi: 'क' },
      { en: 'B', hi: 'ख' },
      { en: 'C', hi: 'ग' },
      { en: 'D', hi: 'घ' },
    ],
    answer_index: answerIndex,
    explanation_en: '',
    explanation_hi: '',
    review_status: 'ai_draft',
  };
}

const bank = Array.from({ length: 25 }, (_, i) => q(`AyUG-PV-${String(i + 1).padStart(4, '0')}`, i % 2 ? 'odd' : 'even', i % 4));

describe('buildSession', () => {
  it('returns 10 distinct questions by default, reproducibly for a seed', () => {
    const a = buildSession(bank, { seed: 42 });
    const b = buildSession(bank, { seed: 42 });
    expect(a).toHaveLength(10);
    expect(new Set(a.map((x) => x.id)).size).toBe(10);
    expect(a.map((x) => x.id)).toEqual(b.map((x) => x.id));
  });
  it('filters by topic and caps at the pool size', () => {
    const s = buildSession(bank, { topicId: 'odd', count: 50, seed: 1 });
    expect(s.length).toBe(12);
    expect(s.every((x) => x.topic_id === 'odd')).toBe(true);
  });
  it('puts deprioritised questions last', () => {
    const seen = new Set(bank.slice(0, 20).map((x) => x.id));
    const s = buildSession(bank, { count: 5, seed: 3, deprioritise: seen });
    expect(s.every((x) => !seen.has(x.id))).toBe(true);
  });
  it('shuffle keeps every element', () => {
    expect(shuffle([1, 2, 3, 4, 5], 9).sort()).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('scoring', () => {
  it('checks answers', () => {
    expect(isCorrect(bank[1], 1)).toBe(true);
    expect(isCorrect(bank[1], 0)).toBe(false);
    expect(isCorrect(bank[1], null)).toBe(false);
  });

  it('scores a session, by topic, with mistakes and timeouts', () => {
    const qs = bank.slice(0, 4); // answers 0,1,2,3 ; topics even, odd, even, odd
    const answers = [answer(qs[0], 0, 1000), answer(qs[1], 3, 3000), answer(qs[2], 2), answer(qs[3], null)];
    const s = scoreSession(qs, answers);
    expect(s.total).toBe(4);
    expect(s.answered).toBe(3);
    expect(s.correct).toBe(2);
    expect(s.percent).toBe(50);
    expect(s.byTopic.even).toEqual({ correct: 2, total: 2 });
    expect(s.byTopic.odd).toEqual({ correct: 0, total: 2 });
    expect(s.mistakes).toEqual([qs[1].id, qs[3].id]);
    expect(s.averageMs).toBe(2000);
  });

  it('does not trust a tampered "correct" flag', () => {
    const s = scoreSession([bank[0]], [{ questionId: bank[0].id, choice: 3, correct: true }]);
    expect(s.correct).toBe(0);
  });

  it('handles an empty session', () => {
    const s = scoreSession([], []);
    expect(s.accuracy).toBe(0);
    expect(s.percent).toBe(0);
  });

  it('merges running stats and gives verdicts', () => {
    const s = scoreSession(bank.slice(0, 2), [answer(bank[0], 0), answer(bank[1], 1)]);
    expect(mergeStats({ answered: 10, correct: 5 }, s)).toEqual({ answered: 12, correct: 7 });
    expect(verdict(95)).toBe('excellent');
    expect(verdict(75)).toBe('good');
    expect(verdict(55)).toBe('fair');
    expect(verdict(10)).toBe('keep_going');
  });
});
