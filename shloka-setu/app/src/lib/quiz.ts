/** Quiz session building and scoring. Pure functions, unit-tested. */
import type { QuizQuestion } from '../types/content';

export interface AnswerRecord {
  questionId: string;
  /** chosen option index, or null when the timer ran out / skipped */
  choice: number | null;
  correct: boolean;
  ms?: number;
}

export interface SessionOptions {
  count?: number;
  topicId?: string | null;
  seed?: number;
  /** prefer questions not in this set (e.g. already answered correctly) */
  deprioritise?: Set<string>;
}

/** Deterministic PRNG (mulberry32) so sessions are reproducible in tests. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: T[], seed: number): T[] {
  const out = items.slice();
  const r = rng(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function buildSession(questions: QuizQuestion[], opts: SessionOptions = {}): QuizQuestion[] {
  const count = opts.count ?? 10;
  const seed = opts.seed ?? Date.now();
  const pool = opts.topicId ? questions.filter((q) => (q.topic_id ?? 'general') === opts.topicId) : questions;
  const shuffled = shuffle(pool, seed);
  if (opts.deprioritise && opts.deprioritise.size > 0) {
    const fresh = shuffled.filter((q) => !opts.deprioritise!.has(q.id));
    const seen = shuffled.filter((q) => opts.deprioritise!.has(q.id));
    return [...fresh, ...seen].slice(0, count);
  }
  return shuffled.slice(0, count);
}

export function isCorrect(q: QuizQuestion, choice: number | null): boolean {
  return choice !== null && choice === q.answer_index;
}

export function answer(q: QuizQuestion, choice: number | null, ms?: number): AnswerRecord {
  return { questionId: q.id, choice, correct: isCorrect(q, choice), ms };
}

export interface TopicScore {
  correct: number;
  total: number;
}

export interface SessionScore {
  total: number;
  answered: number;
  correct: number;
  /** 0..1 over all questions in the session (unanswered count as wrong) */
  accuracy: number;
  percent: number;
  byTopic: Record<string, TopicScore>;
  mistakes: string[];
  averageMs: number | null;
}

export function scoreSession(questions: QuizQuestion[], answers: AnswerRecord[]): SessionScore {
  const byId = new Map(answers.map((a) => [a.questionId, a]));
  const byTopic: Record<string, TopicScore> = {};
  let correct = 0;
  let answered = 0;
  let msSum = 0;
  let msCount = 0;
  const mistakes: string[] = [];
  for (const q of questions) {
    const a = byId.get(q.id);
    const topic = q.topic_id ?? 'general';
    byTopic[topic] ??= { correct: 0, total: 0 };
    byTopic[topic].total++;
    if (a && a.choice !== null) answered++;
    // re-check against the question rather than trusting the record
    const ok = !!a && isCorrect(q, a.choice);
    if (ok) {
      correct++;
      byTopic[topic].correct++;
    } else {
      mistakes.push(q.id);
    }
    if (a?.ms !== undefined) {
      msSum += a.ms;
      msCount++;
    }
  }
  const total = questions.length;
  const accuracy = total === 0 ? 0 : correct / total;
  return {
    total,
    answered,
    correct,
    accuracy,
    percent: Math.round(accuracy * 100),
    byTopic,
    mistakes,
    averageMs: msCount ? Math.round(msSum / msCount) : null,
  };
}

export type Verdict = 'excellent' | 'good' | 'fair' | 'keep_going';
export function verdict(percent: number): Verdict {
  if (percent >= 90) return 'excellent';
  if (percent >= 70) return 'good';
  if (percent >= 50) return 'fair';
  return 'keep_going';
}

/** Running accuracy for a subject across sessions. */
export function mergeStats(prev: { answered: number; correct: number } | undefined, score: SessionScore) {
  return {
    answered: (prev?.answered ?? 0) + score.total,
    correct: (prev?.correct ?? 0) + score.correct,
  };
}
