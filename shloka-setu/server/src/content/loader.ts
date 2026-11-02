import fs from "node:fs";
import path from "node:path";
import {
  ChapterMetaSchema,
  CorpusMetaSchema,
  CorpusVerseSchema,
  GlossaryTermSchema,
  VerseTranslationSchema,
  type ChapterMeta,
  type CorpusVerse,
  type GlossaryTerm,
  type VerseTranslation,
  type VerseView,
} from "../types.js";
import type { Logger } from "../http/logger.js";

/** Display names for text codes (used in `source_title`). */
const TEXT_TITLES: Record<string, string> = {
  AH: "Aṣṭāṅgahṛdaya",
  CS: "Carakasaṃhitā",
  SS: "Suśrutasaṃhitā",
};

export interface ContentPaths {
  corpusDir: string;
  translationsDir: string;
  glossaryPath: string;
  syllabusPath: string;
}

export function contentPaths(contentDir: string, overrides: Partial<ContentPaths> = {}): ContentPaths {
  return {
    corpusDir: path.join(contentDir, "corpus"),
    translationsDir: path.join(contentDir, "translations"),
    glossaryPath: path.join(contentDir, "glossary.json"),
    syllabusPath: path.join(contentDir, "syllabus.json"),
    ...overrides,
  };
}

export interface ContentStats {
  corpus_files: number;
  verses: number;
  texts: Record<string, number>;
  translation_files: number;
  translated_verses: number;
  chapters_with_translation: number;
  glossary_terms: number;
  syllabus: boolean;
  skipped_files: { file: string; reason: string }[];
  loaded_at: string;
}

export class Content {
  readonly verses: CorpusVerse[] = [];
  readonly byId = new Map<string, CorpusVerse>();
  private readonly position = new Map<string, number>();
  readonly translations = new Map<string, VerseTranslation>();
  readonly chapters = new Map<string, ChapterMeta>();
  readonly glossary: GlossaryTerm[] = [];
  syllabus: unknown = null;
  readonly textTitles = new Map<string, string>();
  readonly stats: ContentStats = {
    corpus_files: 0,
    verses: 0,
    texts: {},
    translation_files: 0,
    translated_verses: 0,
    chapters_with_translation: 0,
    glossary_terms: 0,
    syllabus: false,
    skipped_files: [],
    loaded_at: new Date().toISOString(),
  };

  addVerse(v: CorpusVerse): boolean {
    if (this.byId.has(v.id)) return false;
    this.position.set(v.id, this.verses.length);
    this.verses.push(v);
    this.byId.set(v.id, v);
    const code = textCode(v.id);
    this.stats.texts[code] = (this.stats.texts[code] ?? 0) + 1;
    this.stats.verses++;
    return true;
  }

  sourceTitle(v: CorpusVerse): string {
    const code = textCode(v.id);
    const title = TEXT_TITLES[code] ?? this.textTitles.get(code) ?? code;
    const sthana = v.sthana_iast || v.sthana;
    return `${title}, ${sthana} ${v.chapter}.${v.verse}`;
  }

  neighbours(id: string): { prev_id: string | null; next_id: string | null } {
    const i = this.position.get(id);
    if (i === undefined) return { prev_id: null, next_id: null };
    const cur = this.verses[i]!;
    const prev = this.verses[i - 1];
    const next = this.verses[i + 1];
    const same = (o: CorpusVerse | undefined) => (o && textCode(o.id) === textCode(cur.id) ? o.id : null);
    return { prev_id: same(prev), next_id: same(next) };
  }

  view(id: string): VerseView | null {
    const v = this.byId.get(id);
    if (!v) return null;
    const ch = this.chapters.get(chapterId(id));
    return {
      id: v.id,
      text: v.text,
      text_code: textCode(v.id),
      sthana: v.sthana,
      sthana_iast: v.sthana_iast,
      sthana_devanagari: v.sthana_devanagari,
      chapter: v.chapter,
      verse: v.verse,
      iast: v.iast,
      devanagari: v.devanagari,
      variants: v.variants.map((x) => ({ pada: x.pada, reading: x.reading })),
      source_title: this.sourceTitle(v),
      translation: this.translations.get(id) ?? null,
      chapter_info: ch
        ? {
            id: ch.id,
            title_iast: ch.title_iast,
            title_devanagari: ch.title_devanagari,
            title_en: ch.title_en,
            title_hi: ch.title_hi,
          }
        : null,
    };
  }
}

export function textCode(id: string): string {
  return id.split(".")[0] ?? "";
}

export function chapterId(id: string): string {
  return id.split(".").slice(0, 3).join(".");
}

function readJson(file: string): { ok: true; data: unknown } | { ok: false; reason: string } {
  let raw: string;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch (e) {
    return { ok: false, reason: `unreadable: ${(e as Error).message}` };
  }
  if (!raw.trim()) return { ok: false, reason: "empty file (probably still being written)" };
  try {
    return { ok: true, data: JSON.parse(raw) };
  } catch (e) {
    return { ok: false, reason: `invalid JSON (probably still being written): ${(e as Error).message}` };
  }
}

function listJsonFiles(dir: string, recursive: boolean): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && recursive) out.push(...listJsonFiles(full, true));
    else if (entry.isFile() && entry.name.endsWith(".json") && !entry.name.startsWith(".")) out.push(full);
  }
  return out.sort();
}

/**
 * Cheap change detector: file list + size + mtime for every content file.
 * Used by the periodic reloader so a full re-parse only happens when something changed.
 */
export function contentSignature(paths: ContentPaths): string {
  const files = [
    ...listJsonFiles(paths.corpusDir, false),
    ...listJsonFiles(paths.translationsDir, true),
    paths.glossaryPath,
    paths.syllabusPath,
  ];
  return files
    .map((f) => {
      try {
        const st = fs.statSync(f);
        return `${f}:${st.size}:${st.mtimeMs}`;
      } catch {
        return `${f}:missing`;
      }
    })
    .join("|");
}

export function loadContent(paths: ContentPaths, log?: Logger): Content {
  const content = new Content();
  const skip = (file: string, reason: string) => {
    content.stats.skipped_files.push({ file: path.relative(path.dirname(paths.corpusDir), file), reason });
    log?.warn("content_file_skipped", { file, reason });
  };

  // 1. Corpus. When two files cover the same text code (e.g. charaka_selected.json and the later,
  // complete charaka_samhita.json), only the largest one is used: mixing them would mix numbering schemes.
  const parsedCorpus: { file: string; code: string; meta: ReturnType<typeof CorpusMetaSchema.parse>; verses: CorpusVerse[]; invalid: number }[] = [];
  for (const file of listJsonFiles(paths.corpusDir, false)) {
    const r = readJson(file);
    if (!r.ok) {
      skip(file, r.reason);
      continue;
    }
    const data = r.data as { meta?: unknown; verses?: unknown };
    if (!Array.isArray(data.verses)) {
      skip(file, "no `verses` array");
      continue;
    }
    const verses: CorpusVerse[] = [];
    let invalid = 0;
    for (const raw of data.verses) {
      const p = CorpusVerseSchema.safeParse(raw);
      if (p.success) verses.push(p.data);
      else invalid++;
    }
    if (verses.length === 0) {
      skip(file, "no valid verses");
      continue;
    }
    parsedCorpus.push({ file, code: textCode(verses[0]!.id), meta: CorpusMetaSchema.parse(data.meta ?? {}), verses, invalid });
  }
  const bestByCode = new Map<string, (typeof parsedCorpus)[number]>();
  for (const pc of parsedCorpus) {
    const cur = bestByCode.get(pc.code);
    if (!cur || pc.verses.length > cur.verses.length) bestByCode.set(pc.code, pc);
  }
  for (const pc of parsedCorpus) {
    const best = bestByCode.get(pc.code)!;
    if (best !== pc) {
      skip(pc.file, `superseded by ${path.basename(best.file)} (same text ${pc.code}, more verses)`);
      continue;
    }
    content.stats.corpus_files++;
    if (pc.meta.title) content.textTitles.set(pc.code, pc.meta.title);
    let dup = 0;
    for (const v of pc.verses) if (!content.addVerse(v)) dup++;
    if (pc.invalid || dup) log?.warn("corpus_records_skipped", { file: pc.file, invalid: pc.invalid, duplicate_ids: dup });
  }

  // 2. Translations: translations/<TEXT>/<sthana>/<chapter>.json
  const chaptersWithTranslation = new Set<string>();
  for (const file of listJsonFiles(paths.translationsDir, true)) {
    const r = readJson(file);
    if (!r.ok) {
      skip(file, r.reason);
      continue;
    }
    const data = r.data as { chapter?: unknown; verses?: unknown };
    content.stats.translation_files++;
    const ch = ChapterMetaSchema.safeParse(data.chapter);
    if (ch.success) content.chapters.set(ch.data.id, ch.data);
    if (!Array.isArray(data.verses)) {
      if (!ch.success) skip(file, "neither `chapter` nor `verses` usable");
      continue;
    }
    let bad = 0;
    for (const raw of data.verses) {
      const p = VerseTranslationSchema.safeParse(raw);
      if (!p.success || !content.byId.has(p.data.id)) {
        bad++;
        continue;
      }
      // A record counts as usable only if it has some actual translated content.
      if (!p.data.english && !p.data.hindi && p.data.word_meanings.length === 0) {
        bad++;
        continue;
      }
      content.translations.set(p.data.id, p.data);
      chaptersWithTranslation.add(chapterId(p.data.id));
    }
    if (bad) log?.debug("translation_records_skipped", { file, skipped: bad });
  }
  content.stats.translated_verses = content.translations.size;
  content.stats.chapters_with_translation = chaptersWithTranslation.size;

  // 5. Glossary (optional)
  if (fs.existsSync(paths.glossaryPath)) {
    const r = readJson(paths.glossaryPath);
    if (!r.ok) skip(paths.glossaryPath, r.reason);
    else {
      const terms = (r.data as { terms?: unknown }).terms;
      if (Array.isArray(terms)) {
        for (const t of terms) {
          const p = GlossaryTermSchema.safeParse(t);
          if (p.success) content.glossary.push(p.data);
        }
      }
    }
  }
  content.stats.glossary_terms = content.glossary.length;

  // 3. Syllabus (optional, passed through as-is)
  if (fs.existsSync(paths.syllabusPath)) {
    const r = readJson(paths.syllabusPath);
    if (!r.ok) skip(paths.syllabusPath, r.reason);
    else {
      content.syllabus = r.data;
      content.stats.syllabus = true;
    }
  }

  content.stats.loaded_at = new Date().toISOString();
  return content;
}
