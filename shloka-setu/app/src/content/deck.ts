/** Flashcard deck: glossary terms + bookmarked / high-importance verses + quiz mistakes. */
import { getGlossary, getGlossaryTerm, getHighlights, getQuestion, getVerse } from './index';
import type { BundleVerse, GlossaryTerm, QuizQuestion } from '../types/content';

export type CardKind = 'term' | 'verse' | 'question';

export type ResolvedCard =
  | { id: string; kind: 'term'; term: GlossaryTerm }
  | { id: string; kind: 'verse'; verse: BundleVerse }
  | { id: string; kind: 'question'; question: QuizQuestion };

export function cardKind(id: string): CardKind {
  return id.startsWith('g:') ? 'term' : id.startsWith('v:') ? 'verse' : 'question';
}

const CATEGORY_ORDER = ['siddhanta', 'padartha', 'kriya', 'sharira', 'dravyaguna', 'nidana', 'swasthavritta', 'chikitsa', 'panchakarma'];

/**
 * Ordered card ids. New cards are introduced in this order, so the most
 * personal material comes first: quiz mistakes, then bookmarks, then core
 * terms interleaved with important verses.
 */
export function deckIds(opts: { bookmarks: string[]; mistakes: string[]; kinds?: CardKind[] }): string[] {
  const kinds = new Set(opts.kinds ?? ['term', 'verse', 'question']);
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (id: string) => {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  };
  if (kinds.has('question')) for (const q of opts.mistakes) add(`q:${q}`);
  if (kinds.has('verse')) for (const b of opts.bookmarks) add(`v:${b}`);
  const terms = kinds.has('term')
    ? getGlossary()
        .slice()
        .sort((a, b) => rank(a.category) - rank(b.category))
        .map((t) => `g:${t.id}`)
    : [];
  const verses = kinds.has('verse') ? getHighlights().map((h) => `v:${h.id}`) : [];
  const n = Math.max(terms.length, verses.length);
  for (let i = 0; i < n; i++) {
    if (i < terms.length) add(terms[i]);
    if (i < verses.length) add(verses[i]);
  }
  return out;
}

function rank(cat: string): number {
  const i = CATEGORY_ORDER.indexOf(cat);
  return i < 0 ? CATEGORY_ORDER.length : i;
}

export function resolveCard(id: string): ResolvedCard | null {
  const body = id.slice(2);
  if (id.startsWith('g:')) {
    const term = getGlossaryTerm(body);
    return term ? { id, kind: 'term', term } : null;
  }
  if (id.startsWith('v:')) {
    const ref = getVerse(body);
    return ref ? { id, kind: 'verse', verse: ref.verse } : null;
  }
  if (id.startsWith('q:')) {
    const question = getQuestion(body);
    return question ? { id, kind: 'question', question } : null;
  }
  return null;
}
