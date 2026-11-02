/**
 * Content and API types. Mirrors docs/CONTENT_SCHEMA.md (sections 1, 2, 5, 6).
 * Content schemas are deliberately lenient: translation files are written by
 * other agents while the server runs, so missing fields get safe defaults and a
 * malformed record is skipped instead of crashing the loader.
 */
import { z } from "zod";

const str = z.string().catch("");
const strArr = z.array(z.string()).catch([]);
const reviewStatus = z.enum(["ai_draft", "expert_reviewed"]).catch("ai_draft");

// ---------- 1. Corpus ----------
export const CorpusVerseSchema = z
  .object({
    id: z.string().regex(/^[A-Z]{2,4}\.[a-z_]+\.\d+\.\d+[a-z]?$/),
    text: z.string(),
    sthana: z.string(),
    sthana_iast: str,
    sthana_devanagari: str,
    chapter: z.number().int(),
    verse: z.number().int(),
    iast: z.string(),
    devanagari: str,
    variants: z.array(z.object({ pada: str, reading: str }).loose()).catch([]),
  })
  .loose();
export type CorpusVerse = z.infer<typeof CorpusVerseSchema>;

export const CorpusMetaSchema = z
  .object({ title: str, title_devanagari: str, source: str, source_url: str, license_note: str })
  .loose()
  .catch({ title: "", title_devanagari: "", source: "", source_url: "", license_note: "" });

// ---------- 2. Translations ----------
export const WordMeaningSchema = z.object({ sa: str, iast: str, en: str, hi: str });
export type WordMeaning = z.infer<typeof WordMeaningSchema>;

const BilingualSchema = z.object({ en: str, hi: str });

export const VerseTranslationSchema = z
  .object({
    id: z.string(),
    anvaya: str,
    word_meanings: z.array(WordMeaningSchema.catch({ sa: "", iast: "", en: "", hi: "" })).catch([]),
    english: str,
    hindi: str,
    explanation_en: str,
    explanation_hi: str,
    modern_correlation: BilingualSchema.nullable().catch(null),
    key_terms: strArr,
    tags: strArr,
    importance: z.enum(["high", "medium", "low"]).catch("medium"),
    mnemonic: str,
    review_status: reviewStatus,
  })
  .loose();
export type VerseTranslation = z.infer<typeof VerseTranslationSchema>;

export const ChapterMetaSchema = z
  .object({
    id: z.string(),
    text: str,
    sthana: str,
    chapter: z.number().int().catch(0),
    title_iast: str,
    title_devanagari: str,
    title_en: str,
    title_hi: str,
    summary_en: str,
    summary_hi: str,
    key_concepts: strArr,
    exam_focus_en: strArr,
    exam_focus_hi: strArr,
    syllabus_refs: strArr,
    review_status: reviewStatus,
  })
  .loose();
export type ChapterMeta = z.infer<typeof ChapterMetaSchema>;

// ---------- 5. Glossary ----------
export const GlossaryTermSchema = z
  .object({
    id: z.string(),
    devanagari: str,
    iast: str,
    simple: str,
    en: str,
    hi: str,
    modern: str,
    category: str,
    source_refs: strArr,
    related: strArr,
    review_status: reviewStatus,
  })
  .loose();
export type GlossaryTerm = z.infer<typeof GlossaryTermSchema>;

// ---------- API shapes ----------
export type Lang = "en" | "hi" | "hinglish";

/** A corpus verse joined with its translation (if any). Returned by /v1/verse and /v1/search. */
export interface VerseView {
  id: string;
  text: string;
  text_code: string;
  sthana: string;
  sthana_iast: string;
  sthana_devanagari: string;
  chapter: number;
  verse: number;
  iast: string;
  devanagari: string;
  variants: { pada: string; reading: string }[];
  source_title: string;
  translation: VerseTranslation | null;
  chapter_info: Pick<ChapterMeta, "id" | "title_iast" | "title_devanagari" | "title_en" | "title_hi"> | null;
}

export interface MatchInfo {
  id: string;
  score: number;
  source_title: string;
}

export type ScanSource = "curated" | "ai" | "corpus_only" | "mock";

/** docs/CONTENT_SCHEMA.md section 6, plus additive fields (source, mock, notice, candidates, ...). */
export interface ScanResult {
  ocr_text: string;
  iast: string;
  /** Canonical Devanagari of the matched corpus verse (or the input text when unmatched). */
  devanagari: string;
  match: MatchInfo | null;
  word_meanings: WordMeaning[];
  english: string;
  hindi: string;
  explanation_en: string;
  explanation_hi: string;
  modern_correlation: { en: string; hi: string } | null;
  key_terms: string[];
  related_verse_ids: string[];
  confidence: "high" | "medium" | "low";
  disclaimer: string;
  // additive fields
  source: ScanSource;
  in_corpus: boolean;
  review_status: "ai_draft" | "expert_reviewed";
  candidates: MatchInfo[];
  mock: boolean;
  notice?: string;
  ocr_legibility?: "clear" | "partial" | "poor";
  model?: string;
}

export interface TutorReply {
  reply: string;
  citations: string[];
  context_verse_ids: string[];
  disclaimer: string;
  mock: boolean;
  model?: string;
}

export const DISCLAIMER_AI = "AI-generated study aid. Verify with your teacher and the classical text.";
export const DISCLAIMER_REVIEWED = "Expert-reviewed study aid. Verify with your teacher and the classical text.";
export const TUTOR_DISCLAIMER =
  "Study aid only, not medical advice. For any health problem, consult a qualified vaidya or doctor.";
