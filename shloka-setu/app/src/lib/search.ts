/**
 * On-device fuzzy shloka search: normalise the query to an ASCII skeleton
 * (see normalize.ts), then rank corpus verses by trigram similarity using an
 * inverted index built lazily from the bundled search index.
 *
 * Pure TypeScript, no React Native imports, so it is unit-tested in Node.
 */
import { skeleton, trigrams } from './normalize';
import type { SearchIndexFile } from '../types/content';

export { skeleton, trigrams, devanagariToIast, hasDevanagari, foldLatin } from './normalize';

export interface SearchEntry {
  id: string;
  skeleton: string;
}

export interface SearchHit {
  id: string;
  score: number;
}

export interface SearchIndex {
  ids: string[];
  skeletons: string[];
  /** number of unique trigrams per entry */
  sizes: Uint16Array;
  postings: Map<string, number[]>;
}

/** Flatten the bundled index file into entries. */
export function entriesFromIndexFile(file: SearchIndexFile): SearchEntry[] {
  const out: SearchEntry[] = [];
  for (const chapterId of Object.keys(file.chapters)) {
    for (const [verse, skel] of file.chapters[chapterId]) {
      out.push({ id: `${chapterId}.${verse}`, skeleton: skel });
    }
  }
  return out;
}

export function buildIndex(entries: SearchEntry[]): SearchIndex {
  const ids: string[] = new Array(entries.length);
  const skeletons: string[] = new Array(entries.length);
  const sizes = new Uint16Array(entries.length);
  const postings = new Map<string, number[]>();
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    ids[i] = e.id;
    skeletons[i] = e.skeleton;
    const grams = trigrams(e.skeleton);
    sizes[i] = Math.min(grams.length, 65535);
    for (const g of grams) {
      let list = postings.get(g);
      if (!list) {
        list = [];
        postings.set(g, list);
      }
      list.push(i);
    }
  }
  return { ids, skeletons, sizes, postings };
}

/**
 * Similarity between a query skeleton and an entry, in [0, 1].
 * Mostly containment (what fraction of the query's trigrams occur in the
 * verse, so a single remembered pāda still scores high), blended with Dice
 * so that a full-verse paste prefers the exact verse.
 */
export function similarity(query: string, target: string): number {
  const q = trigrams(query);
  if (q.length === 0) return 0;
  const t = new Set(trigrams(target));
  let shared = 0;
  for (const g of q) if (t.has(g)) shared++;
  return blend(shared, q.length, t.size);
}

function blend(shared: number, qSize: number, tSize: number): number {
  if (qSize === 0) return 0;
  const containment = shared / qSize;
  const dice = (2 * shared) / (qSize + tSize);
  return 0.8 * containment + 0.2 * dice;
}

export interface SearchOptions {
  limit?: number;
  /** minimum score to report (default 0.35) */
  minScore?: number;
}

export function search(index: SearchIndex, rawQuery: string, opts: SearchOptions = {}): SearchHit[] {
  const limit = opts.limit ?? 10;
  const minScore = opts.minScore ?? 0.35;
  const q = skeleton(rawQuery);
  if (q.length === 0) return [];

  // Very short queries: substring match only.
  if (q.length < 3) {
    const hits: SearchHit[] = [];
    for (let i = 0; i < index.ids.length && hits.length < limit; i++) {
      if (index.skeletons[i].includes(q)) hits.push({ id: index.ids[i], score: 0.5 });
    }
    return hits;
  }

  const grams = trigrams(q);
  const counts = new Uint16Array(index.ids.length);
  const touched: number[] = [];
  for (const g of grams) {
    const list = index.postings.get(g);
    if (!list) continue;
    for (const i of list) {
      if (counts[i] === 0) touched.push(i);
      counts[i]++;
    }
  }

  const hits: SearchHit[] = [];
  for (const i of touched) {
    let score = blend(counts[i], grams.length, index.sizes[i]);
    if (index.skeletons[i].includes(q)) score = Math.max(score, 0.9 + 0.1 * (q.length / index.skeletons[i].length));
    if (score >= minScore) hits.push({ id: index.ids[i], score: Math.min(1, score) });
  }
  hits.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id, 'en', { numeric: true }));
  return hits.slice(0, limit);
}

/** Pull verse ids like "AH.sutra.1.6" out of free text (tutor replies, references). */
export function extractVerseIds(text: string): string[] {
  const re = /\b(AH|CS|SS)\.(sutra|nidana|vimana|sharira|indriya|chikitsa|kalpa|siddhi|uttara)\.(\d+)\.(\d+)\b/g;
  const seen = new Set<string>();
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const id = m[0];
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

export const VERSE_ID_RE = /^(AH|CS|SS)\.[a-z]+\.\d+\.\d+$/;
export function isVerseId(s: string | undefined | null): boolean {
  return !!s && VERSE_ID_RE.test(s.trim());
}
