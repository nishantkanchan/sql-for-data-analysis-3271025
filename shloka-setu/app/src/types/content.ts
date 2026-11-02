/**
 * Types mirroring docs/CONTENT_SCHEMA.md (source files) plus the shapes the
 * app bundle emits (assets/content/*, produced by scripts/build-content.mjs).
 * Keep in sync with the schema doc and server/src/types.ts.
 */

export type ReviewStatus = 'ai_draft' | 'expert_reviewed';
export type TextCode = 'AH' | 'CS' | 'SS' | (string & {});
export type SthanaKey =
  | 'sutra'
  | 'nidana'
  | 'vimana'
  | 'sharira'
  | 'indriya'
  | 'chikitsa'
  | 'kalpa'
  | 'siddhi'
  | 'uttara';
export type Importance = 'high' | 'medium' | 'low';

/* ---------------------------------------------------------------- 1. Corpus */

export interface CorpusMeta {
  title: string;
  title_devanagari?: string;
  source?: string;
  source_url?: string;
  transcription?: string;
  license_note?: string;
  verse_count?: number;
}

export interface CorpusVerse {
  id: string;
  text: string;
  sthana: SthanaKey | string;
  sthana_iast: string;
  sthana_devanagari: string;
  chapter: number;
  verse: number;
  iast: string;
  devanagari: string;
  variants?: { pada: string; reading: string }[];
}

export interface CorpusFile {
  meta: CorpusMeta;
  verses: CorpusVerse[];
}

/* ---------------------------------------------------------- 2. Translations */

export interface WordMeaning {
  sa: string;
  iast: string;
  en: string;
  hi: string;
}

export interface Bilingual {
  en: string;
  hi: string;
}

export interface TranslationChapterMeta {
  id: string;
  text: string;
  sthana: string;
  chapter: number;
  title_iast: string;
  title_devanagari: string;
  title_en: string;
  title_hi: string;
  summary_en: string;
  summary_hi: string;
  key_concepts: string[];
  exam_focus_en: string[];
  exam_focus_hi: string[];
  syllabus_refs?: string[];
  review_status: ReviewStatus;
}

export interface TranslationVerse {
  id: string;
  anvaya?: string;
  word_meanings: WordMeaning[];
  english: string;
  hindi: string;
  explanation_en: string;
  explanation_hi: string;
  modern_correlation: Bilingual | null;
  key_terms: string[];
  tags: string[];
  importance: Importance;
  mnemonic?: string;
  review_status: ReviewStatus;
}

export interface TranslationFile {
  chapter: TranslationChapterMeta;
  verses: TranslationVerse[];
}

/* -------------------------------------------------------------- 3. Syllabus */

export interface SyllabusTopic {
  id: string;
  name_en: string;
  name_hi?: string;
  text_refs?: string[];
}

export interface SyllabusPaper {
  id: string;
  name_en: string;
  topics: SyllabusTopic[];
}

export interface SyllabusSubject {
  id: string;
  code?: string;
  name_en: string;
  name_hi?: string;
  name_sa?: string;
  description_en?: string;
  papers?: SyllabusPaper[];
}

export interface SyllabusProfessional {
  id: string;
  name_en: string;
  name_hi?: string;
  duration?: string;
  subjects: SyllabusSubject[];
}

export interface Syllabus {
  meta: { regulator?: string; curriculum?: string; source_urls?: string[]; as_of?: string };
  professionals: SyllabusProfessional[];
}

/* ------------------------------------------------------------------ 4. Quiz */

export type QuestionType = 'mcq' | 'true_false' | 'shloka_completion';

export interface QuizQuestion {
  id: string;
  subject_id: string;
  topic_id?: string;
  topic_en?: string;
  topic_hi?: string;
  type: QuestionType;
  question_en: string;
  question_hi: string;
  question_sa?: string;
  options: Bilingual[];
  answer_index: number;
  explanation_en: string;
  explanation_hi: string;
  reference?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  exam_tags?: string[];
  review_status: ReviewStatus;
}

export interface QuizFile {
  subject_id: string;
  questions: QuizQuestion[];
}

/* -------------------------------------------------------------- 5. Glossary */

export type GlossaryCategory =
  | 'siddhanta'
  | 'padartha'
  | 'sharira'
  | 'kriya'
  | 'dravyaguna'
  | 'rasashastra'
  | 'nidana'
  | 'chikitsa'
  | 'panchakarma'
  | 'swasthavritta'
  | 'shalya'
  | 'shalakya'
  | 'prasuti'
  | 'kaumarabhritya'
  | 'agada'
  | 'sanskrit'
  | 'general';

export interface GlossaryTerm {
  id: string;
  devanagari: string;
  iast: string;
  simple: string;
  en: string;
  hi: string;
  modern?: string | null;
  category: GlossaryCategory | string;
  source_refs?: string[];
  related?: string[];
  review_status: ReviewStatus;
}

export interface GlossaryFile {
  terms: GlossaryTerm[];
}

/* ------------------------------------------------------------------- 6. API */

export interface ScanMatch {
  id: string;
  score: number;
  source_title?: string;
}

export interface ScanResult {
  ocr_text: string;
  iast?: string;
  match?: ScanMatch | null;
  word_meanings?: WordMeaning[];
  english?: string;
  hindi?: string;
  explanation_en?: string;
  explanation_hi?: string;
  modern_correlation?: Bilingual | null;
  key_terms?: string[];
  related_verse_ids?: string[];
  confidence?: 'high' | 'medium' | 'low';
  disclaimer?: string;
}

export interface TutorMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface TutorResponse {
  reply: string;
  /** Optional; the app also extracts verse ids from the reply text. */
  citations?: string[];
}

/* ------------------------------------------------- App bundle (generated) */

/** One verse inside a bundled chapter file: Sanskrit always, translation when available. */
export interface BundleVerse extends Partial<Omit<TranslationVerse, 'id'>> {
  id: string;
  verse: number;
  devanagari: string;
  iast: string;
}

export interface BundleChapter {
  id: string;
  text: TextCode;
  sthana: string;
  chapter: number;
  translated: boolean;
  meta: TranslationChapterMeta | null;
  verses: BundleVerse[];
}

export interface BundleChapterSummary {
  id: string;
  chapter: number;
  verse_count: number;
  translated: boolean;
  translated_count: number;
  title_iast?: string;
  title_devanagari?: string;
  title_en?: string;
  title_hi?: string;
}

export interface BundleSthana {
  key: string;
  iast: string;
  devanagari: string;
  chapters: BundleChapterSummary[];
}

export interface BundleText {
  code: TextCode;
  slug: string;
  title: string;
  title_devanagari: string;
  meta: CorpusMeta;
  verse_count: number;
  translated_chapters: number;
  sthanas: BundleSthana[];
}

export interface BundleTextsIndex {
  generated_at: string;
  texts: BundleText[];
}

export interface Highlight {
  id: string;
  chapter_id: string;
  importance: Importance;
}

export interface QuizTopicSummary {
  id: string;
  name_en: string;
  name_hi: string;
  count: number;
}

export interface QuizSubjectSummary {
  id: string;
  name_en: string;
  name_hi: string;
  prof: string | null;
  count: number;
  topics: QuizTopicSummary[];
}

export interface QuizIndex {
  subjects: QuizSubjectSummary[];
}

/** chapterId -> [[verseNumber, skeleton], ...] */
export interface SearchIndexFile {
  version: number;
  chapters: Record<string, [number, string][]>;
}

export interface ContentStats {
  generated_at: string;
  texts: number;
  verses: number;
  translated_chapters: number;
  translated_verses: number;
  quiz_questions: number;
  glossary_terms: number;
  has_syllabus: boolean;
}
