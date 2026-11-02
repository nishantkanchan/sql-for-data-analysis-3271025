import { ExplainJsonSchema, ExplainOutput } from "../llm/schemas.js";
import { EXPLAIN_SYSTEM } from "../llm/prompts.js";
import { SearchIndex, type SearchHit } from "../search/index.js";
import { DISCLAIMER_AI, DISCLAIMER_REVIEWED, type Lang, type MatchInfo, type ScanResult, type VerseView } from "../types.js";
import type { Deps } from "./deps.js";

/** Short inputs ("vata") match everything a little; never treat them as an identified verse. */
const MIN_STRONG_QUERY_LENGTH = 12;
/** The best hit must beat the next different verse by this much to count as identified. */
const MIN_MARGIN = 0.12;
const CANDIDATES_FOR_LLM = 5;
const CANDIDATE_TEXT_CHARS = 600;

export interface RetrievalResult {
  hits: SearchHit[];
  candidates: MatchInfo[];
  strong: SearchHit | null;
}

export function retrieve(deps: Deps, text: string): RetrievalResult {
  const { content, index } = deps.store;
  const hits = index.search(text, 8);
  const candidates = hits.slice(0, CANDIDATES_FOR_LLM).map((h) => toMatch(deps, h));
  const best = hits[0];
  let strong: SearchHit | null = null;
  if (best && best.score >= deps.cfg.matchStrongThreshold && SearchIndex.queryLength(text) >= MIN_STRONG_QUERY_LENGTH) {
    // Exact duplicates (the same verse repeated in two chapters) score identically; skip them for the margin.
    const runnerUp = hits.find((h) => h.id !== best.id && h.score < best.score - 0.01);
    const margin = runnerUp ? best.score - runnerUp.score : 1;
    if (margin >= MIN_MARGIN && content.byId.has(best.id)) strong = best;
  }
  return { hits, candidates, strong };
}

function toMatch(deps: Deps, h: SearchHit): MatchInfo {
  const v = deps.store.content.byId.get(h.id);
  return { id: h.id, score: h.score, source_title: v ? deps.store.content.sourceTitle(v) : h.id };
}

/** Build a ScanResult from curated (translation-file) content. No LLM involved. */
export function curatedResult(deps: Deps, view: VerseView, hit: SearchHit, candidates: MatchInfo[], inputText: string): ScanResult {
  const t = view.translation!;
  const { prev_id, next_id } = deps.store.content.neighbours(view.id);
  const similar = candidates.filter((c) => c.id !== view.id && c.score >= 0.5).map((c) => c.id);
  return {
    ocr_text: inputText,
    iast: view.iast,
    devanagari: view.devanagari,
    match: { id: view.id, score: hit.score, source_title: view.source_title },
    word_meanings: t.word_meanings,
    english: t.english,
    hindi: t.hindi,
    explanation_en: t.explanation_en,
    explanation_hi: t.explanation_hi,
    modern_correlation: t.modern_correlation,
    key_terms: t.key_terms,
    related_verse_ids: dedupe([...similar, ...[prev_id, next_id].filter((x): x is string => !!x)]),
    confidence: hit.score >= 0.85 ? "high" : "medium",
    disclaimer: t.review_status === "expert_reviewed" ? DISCLAIMER_REVIEWED : DISCLAIMER_AI,
    source: "curated",
    in_corpus: true,
    review_status: t.review_status,
    candidates,
    mock: false,
  };
}

function corpusOnlyResult(deps: Deps, view: VerseView, hit: SearchHit, candidates: MatchInfo[], inputText: string, notice: string): ScanResult {
  const { prev_id, next_id } = deps.store.content.neighbours(view.id);
  return {
    ocr_text: inputText,
    iast: view.iast,
    devanagari: view.devanagari,
    match: { id: view.id, score: hit.score, source_title: view.source_title },
    word_meanings: [],
    english: "",
    hindi: "",
    explanation_en: "",
    explanation_hi: "",
    modern_correlation: null,
    key_terms: [],
    related_verse_ids: [prev_id, next_id].filter((x): x is string => !!x),
    confidence: "low",
    disclaimer: DISCLAIMER_AI,
    source: "corpus_only",
    in_corpus: true,
    review_status: "ai_draft",
    candidates,
    mock: true,
    notice,
  };
}

export function emptyResult(inputText: string, candidates: MatchInfo[], notice: string): ScanResult {
  return {
    ocr_text: inputText,
    iast: "",
    devanagari: inputText,
    match: null,
    word_meanings: [],
    english: "",
    hindi: "",
    explanation_en: "",
    explanation_hi: "",
    modern_correlation: null,
    key_terms: [],
    related_verse_ids: [],
    confidence: "low",
    disclaimer: DISCLAIMER_AI,
    source: "mock",
    in_corpus: false,
    review_status: "ai_draft",
    candidates,
    mock: true,
    notice,
  };
}

const MOCK_NOTICE =
  "Demo mode: AI explanations need an Anthropic API key on the server. Showing the closest verse from the corpus.";

/**
 * The /v1/explain flow (also step 2 of /v1/scan):
 * 1. fuzzy retrieval over the corpus;
 * 2. strong match + curated translation  -> return curated content, no LLM call;
 * 3. otherwise                            -> Claude writes the ScanResult, grounded on the top candidates.
 */
export async function explainText(deps: Deps, text: string, _lang: Lang = "en"): Promise<ScanResult> {
  const { content } = deps.store;
  const r = retrieve(deps, text);

  if (r.strong) {
    const view = content.view(r.strong.id)!;
    if (view.translation) return curatedResult(deps, view, r.strong, r.candidates, text);
  }

  if (!deps.claude) {
    const best = r.strong ?? r.hits[0];
    if (best && best.score >= 0.45) {
      const view = content.view(best.id)!;
      if (view.translation) {
        const res = curatedResult(deps, view, best, r.candidates, text);
        if (!r.strong) {
          res.confidence = "low";
          res.mock = true;
          res.notice = "Demo mode: weak match, please check this is the right verse. AI explanations need an API key on the server.";
        }
        return res;
      }
      return corpusOnlyResult(deps, view, best, r.candidates, text, MOCK_NOTICE);
    }
    return emptyResult(text, r.candidates, "Demo mode: no matching verse found in the corpus, and AI explanations need an API key on the server.");
  }

  return aiExplain(deps, text, r);
}

async function aiExplain(deps: Deps, text: string, r: RetrievalResult): Promise<ScanResult> {
  const { content } = deps.store;
  const claude = deps.claude!;
  const forLlm = r.hits.filter((h, i) => i < 3 || h.score >= 0.3).slice(0, CANDIDATES_FOR_LLM);

  const candidateBlock = forLlm.length
    ? forLlm
        .map((h, i) => {
          const v = content.byId.get(h.id)!;
          const t = content.translations.get(h.id);
          const lines = [
            `[${i + 1}] id: ${h.id} | ${content.sourceTitle(v)} | search score ${h.score}`,
            `devanagari: ${clip(v.devanagari, CANDIDATE_TEXT_CHARS)}`,
            `iast: ${clip(v.iast, CANDIDATE_TEXT_CHARS)}`,
          ];
          if (t?.english) lines.push(`english: ${clip(t.english, 400)}`);
          return lines.join("\n");
        })
        .join("\n\n")
    : "(no candidates found)";

  const userText = `INPUT_TEXT:\n<<<\n${text}\n>>>\n\nCANDIDATES:\n${candidateBlock}`;
  const { data, model } = await claude.json(
    {
      route: "explain",
      system: EXPLAIN_SYSTEM,
      messages: [{ role: "user", content: userText }],
      maxTokens: 16000,
      effort: deps.cfg.anthropic.effort.explain,
      jsonSchema: ExplainJsonSchema,
    },
    ExplainOutput,
  );

  const allowed = new Set(forLlm.map((h) => h.id));
  const matchedId = data.matched_verse_id && allowed.has(data.matched_verse_id) ? data.matched_verse_id : null;
  const matchedHit = matchedId ? forLlm.find((h) => h.id === matchedId)! : null;
  const matchedVerse = matchedId ? content.byId.get(matchedId)! : null;

  return {
    ocr_text: text,
    iast: matchedVerse?.iast ?? data.iast,
    devanagari: matchedVerse?.devanagari ?? data.devanagari,
    match: matchedHit ? toMatch(deps, matchedHit) : null,
    word_meanings: data.word_meanings,
    english: data.english,
    hindi: data.hindi,
    explanation_en: data.explanation_en,
    explanation_hi: data.explanation_hi,
    modern_correlation: data.modern_correlation,
    key_terms: data.key_terms,
    related_verse_ids: dedupe(data.related_verse_ids.filter((id) => id !== matchedId && content.byId.has(id))),
    confidence: data.confidence,
    disclaimer: DISCLAIMER_AI,
    source: "ai",
    in_corpus: matchedId !== null,
    review_status: "ai_draft",
    candidates: r.candidates,
    mock: false,
    model,
  };
}

function clip(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)} …` : s;
}

function dedupe(xs: string[]): string[] {
  return [...new Set(xs)];
}
