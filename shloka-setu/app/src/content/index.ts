/**
 * Content access layer over the generated bundle (manifest.generated.ts).
 * Everything is synchronous and cached; JSON modules are only evaluated
 * when first requested.
 */
import {
  chapterLoaders,
  loadContentMeta,
  loadGlossaryFile,
  loadHighlights,
  loadQuizIndex,
  loadSearchIndexFile,
  loadSyllabus,
  loadTexts,
  quizLoaders,
} from './manifest.generated';
import type {
  BundleChapter,
  BundleChapterSummary,
  BundleSthana,
  BundleText,
  BundleVerse,
  GlossaryTerm,
  Highlight,
  QuizQuestion,
  QuizSubjectSummary,
  Syllabus,
} from '../types/content';
import { buildIndex, entriesFromIndexFile, search, type SearchHit, type SearchIndex } from '../lib/search';
import { foldLatin, skeleton } from '../lib/normalize';
import { daySeed } from '../lib/dates';

/* ---------------------------------------------------------------- texts */

let textsCache: BundleText[] | null = null;
export function getTexts(): BundleText[] {
  if (!textsCache) textsCache = loadTexts().texts;
  return textsCache;
}

export function getText(code: string): BundleText | undefined {
  return getTexts().find((t) => t.code === code);
}

export function getSthana(code: string, key: string): BundleSthana | undefined {
  return getText(code)?.sthanas.find((s) => s.key === key);
}

export interface ParsedId {
  text: string;
  sthana: string;
  chapter: number;
  verse?: number;
  chapterId: string;
}

export function parseId(id: string): ParsedId | null {
  const m = /^([A-Z]+)\.([a-z]+)\.(\d+)(?:\.(\d+))?$/.exec(id.trim());
  if (!m) return null;
  return {
    text: m[1],
    sthana: m[2],
    chapter: Number(m[3]),
    verse: m[4] !== undefined ? Number(m[4]) : undefined,
    chapterId: `${m[1]}.${m[2]}.${m[3]}`,
  };
}

export function getChapterSummary(chapterId: string): BundleChapterSummary | undefined {
  const p = parseId(chapterId);
  if (!p) return undefined;
  return getSthana(p.text, p.sthana)?.chapters.find((c) => c.chapter === p.chapter);
}

const chapterCache = new Map<string, BundleChapter>();
export function getChapter(chapterId: string): BundleChapter | null {
  const hit = chapterCache.get(chapterId);
  if (hit) return hit;
  const loader = chapterLoaders[chapterId];
  if (!loader) return null;
  const ch = loader();
  chapterCache.set(chapterId, ch);
  return ch;
}

export interface VerseRef {
  verse: BundleVerse;
  chapter: BundleChapter;
  index: number;
}

export function getVerse(id: string, index?: number): VerseRef | null {
  const p = parseId(id);
  if (!p || p.verse === undefined) return null;
  const chapter = getChapter(p.chapterId);
  if (!chapter) return null;
  if (index !== undefined && chapter.verses[index]?.id === id) return { verse: chapter.verses[index], chapter, index };
  const i = chapter.verses.findIndex((v) => v.id === id);
  if (i < 0) return null;
  return { verse: chapter.verses[i], chapter, index: i };
}

/** Ordered list of all chapter ids across all texts (for next/previous across chapters). */
let chapterOrder: string[] | null = null;
function allChapterIds(): string[] {
  if (!chapterOrder) {
    chapterOrder = [];
    for (const t of getTexts()) for (const s of t.sthanas) for (const c of s.chapters) chapterOrder.push(c.id);
  }
  return chapterOrder;
}

export interface Neighbour {
  id: string;
  index: number;
}

export function neighbours(ref: VerseRef): { prev: Neighbour | null; next: Neighbour | null } {
  const { chapter, index } = ref;
  let prev: Neighbour | null = index > 0 ? { id: chapter.verses[index - 1].id, index: index - 1 } : null;
  let next: Neighbour | null =
    index < chapter.verses.length - 1 ? { id: chapter.verses[index + 1].id, index: index + 1 } : null;
  const order = allChapterIds();
  const pos = order.indexOf(chapter.id);
  if (!prev && pos > 0) {
    const pc = getChapter(order[pos - 1]);
    if (pc && pc.text === chapter.text && pc.verses.length) prev = { id: pc.verses[pc.verses.length - 1].id, index: pc.verses.length - 1 };
  }
  if (!next && pos >= 0 && pos < order.length - 1) {
    const nc = getChapter(order[pos + 1]);
    if (nc && nc.text === chapter.text && nc.verses.length) next = { id: nc.verses[0].id, index: 0 };
  }
  return { prev, next };
}

export function isTranslated(v: BundleVerse): boolean {
  return !!(v.english || v.hindi);
}

/** "Aṣṭāṅgahṛdaya · Sūtrasthāna 1.6" */
export function verseLabel(id: string): string {
  const p = parseId(id);
  if (!p) return id;
  const t = getText(p.text);
  const s = t?.sthanas.find((x) => x.key === p.sthana);
  const tail = p.verse !== undefined ? `${p.chapter}.${p.verse}` : `${p.chapter}`;
  return `${t?.title ?? p.text} · ${s?.iast ?? p.sthana} ${tail}`;
}

export function shortVerseLabel(id: string): string {
  const p = parseId(id);
  if (!p) return id;
  const abbr: Record<string, string> = { AH: 'AH', CS: 'Ca', SS: 'Su' };
  const sth: Record<string, string> = {
    sutra: 'Sū', nidana: 'Ni', vimana: 'Vi', sharira: 'Śā', indriya: 'In', chikitsa: 'Ci', kalpa: 'Ka', siddhi: 'Si', uttara: 'U',
  };
  return `${abbr[p.text] ?? p.text} ${sth[p.sthana] ?? p.sthana} ${p.chapter}${p.verse !== undefined ? '.' + p.verse : ''}`;
}

/* ----------------------------------------------------------- highlights */

let highlightsCache: Highlight[] | null = null;
export function getHighlights(): Highlight[] {
  if (!highlightsCache) highlightsCache = loadHighlights();
  return highlightsCache;
}

/** A high-importance translated verse, stable for the calendar day. */
export function shlokaOfTheDay(date: Date = new Date()): VerseRef | null {
  const hl = getHighlights();
  if (hl.length) {
    const pick = hl[daySeed(date) % hl.length];
    const ref = getVerse(pick.id);
    if (ref) return ref;
  }
  // fall back to any translated verse, then to the opening definition of the tridoṣa
  for (const t of getTexts())
    for (const s of t.sthanas)
      for (const c of s.chapters)
        if (c.translated) {
          const ch = getChapter(c.id);
          const i = ch?.verses.findIndex(isTranslated) ?? -1;
          if (ch && i >= 0) return { verse: ch.verses[i], chapter: ch, index: i };
        }
  return getVerse('AH.sutra.1.6');
}

/* --------------------------------------------------------------- search */

let searchIndex: SearchIndex | null = null;
export function getSearchIndex(): SearchIndex {
  if (!searchIndex) searchIndex = buildIndex(entriesFromIndexFile(loadSearchIndexFile()));
  return searchIndex;
}

export function searchVerses(query: string, limit = 12): SearchHit[] {
  return search(getSearchIndex(), query, { limit });
}

/* ------------------------------------------------------------- glossary */

interface GlossaryEntry {
  term: GlossaryTerm;
  skels: string[];
  latin: string;
  hindi: string;
}
let glossaryCache: GlossaryEntry[] | null = null;
let glossaryById: Map<string, GlossaryTerm> | null = null;
let glossaryBySkel: Map<string, GlossaryTerm> | null = null;

function glossaryEntries(): GlossaryEntry[] {
  if (!glossaryCache) {
    const terms = loadGlossaryFile().terms ?? [];
    glossaryById = new Map();
    glossaryBySkel = new Map();
    glossaryCache = terms.map((term) => {
      glossaryById!.set(term.id, term);
      const skels = [term.iast, term.simple, term.devanagari, term.id].filter(Boolean).map(skeleton);
      for (const s of skels) if (s && !glossaryBySkel!.has(s)) glossaryBySkel!.set(s, term);
      return {
        term,
        skels,
        latin: foldLatin(`${term.simple} ${term.iast} ${term.en} ${term.modern ?? ''}`),
        hindi: term.hi ?? '',
      };
    });
  }
  return glossaryCache;
}

export function getGlossary(): GlossaryTerm[] {
  return glossaryEntries().map((e) => e.term);
}

export function getGlossaryTerm(id: string): GlossaryTerm | undefined {
  glossaryEntries();
  return glossaryById!.get(id);
}

/** Link a verse key term (IAST like "vasti" or "doṣa") to a glossary entry. */
export function findGlossaryTerm(keyTerm: string): GlossaryTerm | undefined {
  glossaryEntries();
  const direct = glossaryById!.get(keyTerm);
  if (direct) return direct;
  const s = skeleton(keyTerm);
  if (!s) return undefined;
  return glossaryBySkel!.get(s);
}

export function glossaryCategories(): string[] {
  const set = new Set<string>();
  for (const e of glossaryEntries()) set.add(e.term.category);
  return Array.from(set).sort();
}

export function searchGlossary(query: string, category?: string | null): GlossaryTerm[] {
  const entries = glossaryEntries().filter((e) => !category || e.term.category === category);
  const q = query.trim();
  if (!q) return entries.map((e) => e.term).sort((a, b) => a.simple.localeCompare(b.simple));
  const qs = skeleton(q);
  const ql = foldLatin(q);
  const scored: { t: GlossaryTerm; s: number }[] = [];
  for (const e of entries) {
    let s = 0;
    if (qs) {
      if (e.skels.some((k) => k === qs)) s = 100;
      else if (e.skels.some((k) => k.startsWith(qs))) s = 80;
      else if (qs.length >= 3 && e.skels.some((k) => k.includes(qs))) s = 60;
    }
    if (s < 50 && ql.length >= 2 && e.latin.includes(ql)) s = Math.max(s, 40);
    if (s < 50 && e.hindi.includes(q)) s = Math.max(s, 45);
    if (s > 0) scored.push({ t: e.term, s });
  }
  scored.sort((a, b) => b.s - a.s || a.t.simple.localeCompare(b.t.simple));
  return scored.map((x) => x.t);
}

/* ----------------------------------------------------------------- quiz */

export const PROF_IDS = ['prof1', 'prof2', 'prof3'] as const;

export function getQuizSubjects(): QuizSubjectSummary[] {
  return loadQuizIndex().subjects;
}

export interface SubjectGroup {
  prof: string | null;
  subjects: QuizSubjectSummary[];
}

/** Quiz subjects grouped by professional year; `firstProf` floats the student's own year to the top. */
export function subjectsByProf(firstProf?: string): SubjectGroup[] {
  const groups = new Map<string | null, QuizSubjectSummary[]>();
  for (const s of getQuizSubjects()) {
    const k = s.prof ?? null;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(s);
  }
  const order = (p: string | null) => (p === firstProf ? -1 : p === null ? 99 : PROF_IDS.indexOf(p as (typeof PROF_IDS)[number]));
  return Array.from(groups.entries())
    .map(([prof, subjects]) => ({ prof, subjects }))
    .sort((a, b) => order(a.prof) - order(b.prof));
}

const quizCache = new Map<string, QuizQuestion[]>();
export function getQuestions(subjectId: string): QuizQuestion[] {
  const hit = quizCache.get(subjectId);
  if (hit) return hit;
  const loader = quizLoaders[subjectId];
  const qs = loader ? loader().questions : [];
  quizCache.set(subjectId, qs);
  return qs;
}

export function getQuestion(id: string): QuizQuestion | undefined {
  const subject = id.replace(/-\d+$/, '');
  const direct = getQuestions(subject).find((q) => q.id === id);
  if (direct) return direct;
  for (const s of Object.keys(quizLoaders)) {
    const q = getQuestions(s).find((x) => x.id === id);
    if (q) return q;
  }
  return undefined;
}

/* ----------------------------------------------------------------- meta */

export function getSyllabus(): Syllabus | null {
  return loadSyllabus();
}

export function getContentMeta() {
  return loadContentMeta();
}
