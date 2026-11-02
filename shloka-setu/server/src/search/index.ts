import type { Content } from "../content/loader.js";
import { longestCommonSubstring, skeleton, trigrams, wordTokens } from "./normalize.js";

export interface SearchHit {
  id: string;
  score: number;
}

interface Entry {
  id: string;
  skel: string;
  /** Skeleton truncated for the O(n*m) longest-common-substring step (long prose passages). */
  skelLcs: string;
  triCount: number;
}

const MAX_QUERY_SKELETON = 600;
const MAX_VERSE_LCS = 1500;
/** Long prose passages (Caraka has some of 30k+ chars) are indexed as overlapping windows. */
const WINDOW = 180;
const WINDOW_STEP = 110;
const LCS_CANDIDATES = 40;
/** Below this many skeleton characters a match is down-weighted (a 4-letter query "matches" everything). */
const FULL_LENGTH = 24;

const STOPWORDS = new Set(
  (
    "the a an of and or to in on is are was were be what which who whom how why when where does do did " +
    "this that these those it its for with as by from about explain tell me please can you i my we our " +
    "meaning mean means verse shloka sloka kya hai hain ka ki ke ko se mein me aur ya kaise kyon batao " +
    "samjhao matlab arth"
  ).split(" "),
);

/**
 * Fuzzy verse search: every verse is reduced to an ASCII skeleton (see normalize.ts),
 * indexed by character trigrams, and scored by trigram overlap plus a
 * longest-common-substring bonus so partial / OCR-noisy lines still match.
 */
export class SearchIndex {
  private readonly entries: Entry[] = [];
  private readonly postings = new Map<string, number[]>();
  /** keyword index over translations (english + key terms + tags), for the tutor */
  private readonly kwPostings = new Map<string, Set<string>>();
  private readonly kwDocCount: number;

  constructor(private readonly content: Content) {
    for (const v of content.verses) {
      const full = skeleton(v.iast || v.devanagari);
      const parts: string[] = [];
      if (full.length <= WINDOW + WINDOW_STEP) parts.push(full);
      else for (let i = 0; i < full.length; i += WINDOW_STEP) {
        parts.push(full.slice(i, i + WINDOW));
        if (i + WINDOW >= full.length) break;
      }
      for (const skel of parts) {
        const idx = this.entries.length;
        const grams = trigrams(skel);
        this.entries.push({ id: v.id, skel, skelLcs: skel.slice(0, MAX_VERSE_LCS), triCount: grams.size });
        for (const g of grams) {
          let list = this.postings.get(g);
          if (!list) this.postings.set(g, (list = []));
          list.push(idx);
        }
      }
    }

    for (const [id, t] of content.translations) {
      const tokens = new Set<string>();
      for (const term of [...t.key_terms, ...t.tags]) {
        for (const w of wordTokens(term)) tokens.add(kwNorm(w));
        tokens.add(kwNorm(term));
      }
      for (const w of wordTokens(t.english)) if (!STOPWORDS.has(w)) tokens.add(kwNorm(w));
      for (const tok of tokens) {
        if (!tok) continue;
        let s = this.kwPostings.get(tok);
        if (!s) this.kwPostings.set(tok, (s = new Set()));
        s.add(id);
      }
    }
    this.kwDocCount = Math.max(1, content.translations.size);
  }

  get size(): number {
    return this.content.verses.length;
  }

  /** Score breakdown is internal; callers get a single 0..1 score. */
  search(query: string, limit = 10, opts: { textCode?: string } = {}): SearchHit[] {
    const q = skeleton(query).slice(0, MAX_QUERY_SKELETON);
    if (q.length < 2) return [];
    const qGrams = trigrams(q);

    // 1. Candidate generation via the trigram inverted index.
    const shared = new Map<number, number>();
    for (const g of qGrams) {
      const list = this.postings.get(g);
      if (!list) continue;
      for (const idx of list) shared.set(idx, (shared.get(idx) ?? 0) + 1);
    }
    if (shared.size === 0) return [];

    const prefix = opts.textCode ? `${opts.textCode}.` : null;
    const scored: { idx: number; tri: number }[] = [];
    for (const [idx, inter] of shared) {
      const e = this.entries[idx]!;
      if (prefix && !e.id.startsWith(prefix)) continue;
      const cq = inter / qGrams.size; // how much of the query is in the verse
      const cv = inter / Math.max(1, e.triCount); // how much of the verse is in the query
      const tri = 0.7 * Math.max(cq, cv) + 0.3 * Math.min(cq, cv);
      scored.push({ idx, tri });
    }
    scored.sort((a, b) => b.tri - a.tri);

    // 2. Re-rank the best candidates with a longest-common-substring bonus.
    const top = scored.slice(0, Math.max(LCS_CANDIDATES, limit * 3));
    const ranked = top.map(({ idx, tri }) => {
      const e = this.entries[idx]!;
      const minLen = Math.max(1, Math.min(q.length, e.skel.length));
      const lcs = Math.min(longestCommonSubstring(q, e.skelLcs), minLen);
      const raw = 0.65 * tri + 0.35 * (lcs / minLen);
      const lengthFactor = Math.sqrt(Math.min(1, minLen / FULL_LENGTH));
      // Tiny tie-breaker favouring verses whose length is closest to the query's.
      const tie = 0.001 * (minLen / Math.max(q.length, e.skel.length));
      return { id: e.id, score: Math.min(1, raw * lengthFactor + tie) };
    });
    ranked.sort((a, b) => b.score - a.score);
    // A windowed passage can appear several times: keep its best window only.
    const seen = new Set<string>();
    const out: SearchHit[] = [];
    for (const r of ranked) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      out.push({ id: r.id, score: Math.round(r.score * 1000) / 1000 });
      if (out.length >= limit) break;
    }
    return out;
  }

  /** Length of the query skeleton: explain() refuses to call very short inputs a "strong" match. */
  static queryLength(query: string): number {
    return skeleton(query).length;
  }

  /**
   * Keyword search over curated translations (English text, key terms, tags), for tutor
   * questions like "what are the three doshas?" that will not match Sanskrit trigrams.
   */
  searchTranslations(query: string, limit = 3): SearchHit[] {
    const toks = [...new Set(wordTokens(query).filter((w) => !STOPWORDS.has(w)).map(kwNorm))].filter(Boolean);
    if (toks.length === 0) return [];
    const scores = new Map<string, number>();
    for (const t of toks) {
      const ids = this.kwPostings.get(t);
      if (!ids) continue;
      const idf = Math.log(1 + this.kwDocCount / ids.size);
      for (const id of ids) scores.set(id, (scores.get(id) ?? 0) + idf);
    }
    const max = toks.reduce((acc, t) => acc + Math.log(1 + this.kwDocCount / Math.max(1, this.kwPostings.get(t)?.size ?? 1)), 0);
    return [...scores.entries()]
      .map(([id, s]) => {
        const importance = this.content.translations.get(id)?.importance;
        const boost = importance === "high" ? 1.15 : importance === "low" ? 0.9 : 1;
        return { id, score: Math.round(Math.min(1, (s / Math.max(max, 1e-9)) * boost) * 1000) / 1000 };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}

/** Keyword normaliser: Sanskrit words written loosely ("dosha", "doṣa", "दोष") meet in the skeleton. */
function kwNorm(w: string): string {
  return skeleton(w);
}
