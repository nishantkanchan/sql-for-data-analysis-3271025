#!/usr/bin/env node
/**
 * Build the offline content bundle for the app.
 *
 *   npm run content            (reads ../content/data, writes assets/content + src/content/manifest.generated.ts)
 *
 * Works with whatever subset of content exists: missing translations, quiz
 * files, glossary or syllabus are simply left out. Partially written files
 * (other agents may be writing while this runs) are skipped with a warning.
 *
 * Requires Node >= 22.18 (imports src/lib/normalize.ts via built-in type stripping).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(here, '..');
const DATA = path.resolve(process.env.CONTENT_DATA_DIR ?? path.join(APP, '..', 'content', 'data'));
const OUT = path.join(APP, 'assets', 'content');
const MANIFEST = path.join(APP, 'src', 'content', 'manifest.generated.ts');

let normalize;
try {
  normalize = await import(path.join(APP, 'src', 'lib', 'normalize.ts'));
} catch (e) {
  console.error(
    'Could not import src/lib/normalize.ts. Node >= 22.18 (built-in TypeScript type stripping) is required.\n',
    e?.message ?? e,
  );
  process.exit(1);
}
const { skeleton } = normalize;

const warnings = [];
const warn = (m) => {
  warnings.push(m);
  console.warn('  ! ' + m);
};

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    warn(`skipping ${path.relative(DATA, file)}: ${e.message.split('\n')[0]}`);
    return null;
  }
}

function writeJson(rel, obj) {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const s = JSON.stringify(obj);
  fs.writeFileSync(file, s);
  return s.length;
}

const TEXT_INFO = {
  AH: { slug: 'ashtanga_hridaya', title: 'Aṣṭāṅgahṛdaya', title_devanagari: 'अष्टाङ्गहृदयम्' },
  CS: { slug: 'charaka_samhita', title: 'Carakasaṃhitā', title_devanagari: 'चरकसंहिता' },
  SS: { slug: 'sushruta_samhita', title: 'Suśrutasaṃhitā', title_devanagari: 'सुश्रुतसंहिता' },
};
const TEXT_ORDER = ['AH', 'CS', 'SS'];

const STHANA_NAMES = {
  sutra: ['Sūtrasthāna', 'सूत्रस्थान'],
  nidana: ['Nidānasthāna', 'निदानस्थान'],
  vimana: ['Vimānasthāna', 'विमानस्थान'],
  sharira: ['Śārīrasthāna', 'शारीरस्थान'],
  indriya: ['Indriyasthāna', 'इन्द्रियस्थान'],
  chikitsa: ['Cikitsāsthāna', 'चिकित्सास्थान'],
  kalpa: ['Kalpasthāna', 'कल्पस्थान'],
  siddhi: ['Siddhisthāna', 'सिद्धिस्थान'],
  uttara: ['Uttarasthāna', 'उत्तरस्थान'],
};

/** Traditional chapter names (IAST), used only until a translation supplies a title. */
const KNOWN_TITLES = {
  'AH.sutra': [
    'Āyuṣkāmīya', 'Dinacaryā', 'Ṛtucaryā', 'Rogānutpādanīya', 'Dravadravyavijñānīya', 'Annasvarūpavijñānīya',
    'Annarakṣā', 'Mātrāśitīya', 'Dravyādivijñānīya', 'Rasabhedīya', 'Doṣādivijñānīya', 'Doṣabhedīya',
    'Doṣopakramaṇīya', 'Dvividhopakramaṇīya', 'Śodhanādigaṇasaṃgraha', 'Snehavidhi', 'Svedavidhi',
    'Vamanavirecanavidhi', 'Bastividhi', 'Nasyavidhi', 'Dhūmapānavidhi', 'Gaṇḍūṣādividhi',
    'Āścyotanāñjanavidhi', 'Tarpaṇapuṭapākavidhi', 'Yantravidhi', 'Śastravidhi', 'Sirāvyadhavidhi',
    'Śalyāharaṇavidhi', 'Śastrakarmavidhi', 'Kṣārāgnikarmavidhi',
  ],
  'AH.sharira': ['Garbhāvakrānti', 'Garbhavyāpad', 'Aṅgavibhāga', 'Marmavibhāga', 'Vikṛtivijñānīya', 'Dūtādivijñānīya'],
  'AH.kalpa': ['Vamanakalpa', 'Virecanakalpa', 'Vamanavirecanavyāpatsiddhi', 'Bastikalpa', 'Bastivyāpatsiddhi', 'Dravyakalpa'],
};

/** Fallback subject names and professional year when syllabus.json is absent. */
const SUBJECT_FALLBACK = {
  'AyUG-PV': ['prof1', 'Padartha Vigyan', 'पदार्थ विज्ञान'],
  'AyUG-SA1': ['prof1', 'Samhita Adhyayan 1', 'संहिता अध्ययन 1'],
  'AyUG-KS': ['prof1', 'Kriya Sharir', 'क्रिया शारीर'],
  'AyUG-RS': ['prof1', 'Rachana Sharir', 'रचना शारीर'],
  'AyUG-SN': ['prof1', 'Samskritam evam Ayurved Itihas', 'संस्कृतम् एवं आयुर्वेद इतिहास'],
  'AyUG-AI': ['prof1', 'Ayurved Itihas', 'आयुर्वेद इतिहास'],
  'AyUG-DG': ['prof2', 'Dravyaguna Vigyan', 'द्रव्यगुण विज्ञान'],
  'AyUG-RB': ['prof2', 'Rasashastra evam Bhaishajya Kalpana', 'रसशास्त्र एवं भैषज्य कल्पना'],
  'AyUG-RN': ['prof2', 'Roga Nidan evam Vikriti Vigyan', 'रोग निदान एवं विकृति विज्ञान'],
  'AyUG-SA2': ['prof2', 'Samhita Adhyayan 2', 'संहिता अध्ययन 2'],
  'AyUG-AT': ['prof2', 'Agad Tantra', 'अगद तंत्र'],
  'AyUG-SW': ['prof2', 'Swasthavritta evam Yoga', 'स्वस्थवृत्त एवं योग'],
  'AyUG-KC': ['prof3', 'Kayachikitsa', 'कायचिकित्सा'],
  'AyUG-PK': ['prof3', 'Panchakarma', 'पंचकर्म'],
  'AyUG-ST': ['prof3', 'Shalya Tantra', 'शल्य तंत्र'],
  'AyUG-SL': ['prof3', 'Shalakya Tantra', 'शालाक्य तंत्र'],
  'AyUG-PS': ['prof3', 'Prasuti Tantra evam Stri Roga', 'प्रसूति तंत्र एवं स्त्री रोग'],
  'AyUG-KB': ['prof3', 'Kaumarabhritya', 'कौमारभृत्य'],
  'AyUG-SA3': ['prof3', 'Samhita Adhyayan 3', 'संहिता अध्ययन 3'],
};

/* --------------------------------------------------------------- start */

if (!fs.existsSync(DATA)) {
  console.error(`Content directory not found: ${DATA}`);
  process.exit(1);
}
console.log(`Reading content from ${DATA}`);
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

/* -------------------------------------------------------------- corpus */

const corpusDir = path.join(DATA, 'corpus');
const corpusFiles = fs.existsSync(corpusDir)
  ? fs.readdirSync(corpusDir).filter((f) => f.endsWith('.json')).sort()
  : [];

/** code -> { metas: [], verses: Map<chapterKey, verse[]>, order: [] } */
const texts = new Map();
const loaded = [];
for (const f of corpusFiles) {
  const d = readJson(path.join(corpusDir, f));
  if (!d || !Array.isArray(d.verses) || d.verses.length === 0) continue;
  const code = String(d.verses[0].id).split('.')[0];
  loaded.push({ file: f, code, data: d });
}
// most complete file first so it wins on duplicate ids
loaded.sort((a, b) => b.data.verses.length - a.data.verses.length);
for (const { file, code, data } of loaded) {
  let t = texts.get(code);
  if (!t) {
    t = { code, metas: [], seen: new Set(), chapters: new Map(), sthanaOrder: [] };
    texts.set(code, t);
  }
  t.metas.push({ file, ...data.meta });
  const seenThisFile = new Set();
  for (const v of data.verses) {
    if (!v || typeof v.id !== 'string' || typeof v.devanagari !== 'string') continue;
    // allow duplicate ids within one file (the corpus has a few), skip ids already supplied by a fuller file
    if (t.seen.has(v.id) && !seenThisFile.has(v.id)) continue;
    seenThisFile.add(v.id);
    t.seen.add(v.id);
    const chKey = `${v.sthana}.${v.chapter}`;
    if (!t.chapters.has(chKey)) t.chapters.set(chKey, []);
    if (!t.sthanaOrder.includes(v.sthana)) t.sthanaOrder.push(v.sthana);
    t.chapters.get(chKey).push(v);
  }
  console.log(`  corpus ${file}: ${data.verses.length} verses (${code})`);
}

/* -------------------------------------------------------- translations */

function loadTranslation(code, sthana, chapter) {
  const file = path.join(DATA, 'translations', code, sthana, `${chapter}.json`);
  if (!fs.existsSync(file)) return null;
  const d = readJson(file);
  if (!d || !d.chapter || !Array.isArray(d.verses)) {
    if (d) warn(`skipping ${path.relative(DATA, file)}: missing chapter/verses`);
    return null;
  }
  return d;
}

const VERSE_KEYS = [
  'anvaya', 'word_meanings', 'english', 'hindi', 'explanation_en', 'explanation_hi',
  'modern_correlation', 'key_terms', 'tags', 'importance', 'mnemonic', 'review_status',
];

const chapterManifest = []; // [id, relPath]
const textsIndex = [];
const highlights = [];
const searchIndex = { version: 1, chapters: {} };
let totalVerses = 0;
let translatedChapters = 0;
let translatedVerses = 0;

const rank = (c) => (TEXT_ORDER.includes(c) ? TEXT_ORDER.indexOf(c) : 99);
const orderedCodes = [...texts.keys()].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));

for (const code of orderedCodes) {
  const t = texts.get(code);
  const info = TEXT_INFO[code] ?? { slug: code.toLowerCase(), title: t.metas[0].title, title_devanagari: t.metas[0].title_devanagari ?? '' };
  const primaryMeta = t.metas[0];
  const sthanas = [];
  let textVerses = 0;
  let textTranslated = 0;
  for (const sthana of t.sthanaOrder) {
    const chapterNums = [...t.chapters.keys()]
      .filter((k) => k.startsWith(sthana + '.'))
      .map((k) => Number(k.split('.')[1]))
      .sort((a, b) => a - b);
    const chapters = [];
    let sthanaIast = STHANA_NAMES[sthana]?.[0] ?? sthana;
    let sthanaDev = STHANA_NAMES[sthana]?.[1] ?? '';
    for (const n of chapterNums) {
      const verses = t.chapters.get(`${sthana}.${n}`);
      if (verses[0]?.sthana_iast) sthanaIast = verses[0].sthana_iast;
      if (verses[0]?.sthana_devanagari) sthanaDev = verses[0].sthana_devanagari;
      const id = `${code}.${sthana}.${n}`;
      const tr = loadTranslation(code, sthana, n);
      const trById = new Map();
      if (tr) {
        for (const tv of tr.verses) {
          if (!tv || typeof tv.id !== 'string') continue;
          if (!trById.has(tv.id)) trById.set(tv.id, []);
          trById.get(tv.id).push(tv);
        }
      }
      let trCount = 0;
      const outVerses = verses.map((v) => {
        const o = { id: v.id, verse: v.verse, devanagari: v.devanagari, iast: v.iast };
        const queue = trById.get(v.id);
        const tv = queue && (queue.length > 1 ? queue.shift() : queue[0]);
        if (tv && (tv.english || tv.hindi)) {
          trCount++;
          for (const k of VERSE_KEYS) if (tv[k] !== undefined && tv[k] !== '') o[k] = tv[k];
          if (tv.importance === 'high') highlights.push({ id: v.id, chapter_id: id, importance: 'high' });
        }
        return o;
      });
      const translated = !!tr && trCount > 0;
      const meta = translated ? tr.chapter : null;
      const rel = `chapters/${id}.json`;
      writeJson(rel, { id, text: code, sthana, chapter: n, translated, meta, verses: outVerses });
      chapterManifest.push([id, rel]);
      searchIndex.chapters[id] = verses.map((v) => [v.verse, skeleton(v.iast || v.devanagari)]);
      const known = KNOWN_TITLES[`${code}.${sthana}`]?.[n - 1];
      chapters.push({
        id,
        chapter: n,
        verse_count: verses.length,
        translated,
        translated_count: trCount,
        ...(meta
          ? { title_iast: meta.title_iast, title_devanagari: meta.title_devanagari, title_en: meta.title_en, title_hi: meta.title_hi }
          : known
            ? { title_iast: known }
            : {}),
      });
      textVerses += verses.length;
      if (translated) {
        textTranslated++;
        translatedChapters++;
        translatedVerses += trCount;
      }
    }
    sthanas.push({ key: sthana, iast: sthanaIast, devanagari: sthanaDev, chapters });
  }
  totalVerses += textVerses;
  textsIndex.push({
    code,
    slug: info.slug,
    title: info.title,
    title_devanagari: info.title_devanagari || primaryMeta.title_devanagari || '',
    meta: {
      title: primaryMeta.title,
      title_devanagari: primaryMeta.title_devanagari,
      source: primaryMeta.source,
      source_url: primaryMeta.source_url,
      transcription: primaryMeta.transcription,
      license_note: primaryMeta.license_note,
      verse_count: textVerses,
    },
    verse_count: textVerses,
    translated_chapters: textTranslated,
    sthanas,
  });
  console.log(`  ${code}: ${textVerses} verses, ${textTranslated} translated chapters`);
}

const generatedAt = new Date().toISOString();
writeJson('texts.json', { generated_at: generatedAt, texts: textsIndex });
writeJson('highlights.json', highlights);
writeJson('search-index.json', searchIndex);

/* ------------------------------------------------------------ syllabus */

const syllabusPath = path.join(DATA, 'syllabus.json');
const syllabus = fs.existsSync(syllabusPath) ? readJson(syllabusPath) : null;
const hasSyllabus = !!(syllabus && Array.isArray(syllabus.professionals));
if (hasSyllabus) writeJson('syllabus.json', syllabus);

const subjectInfo = new Map(); // id -> {prof, name_en, name_hi, topics: Map}
if (hasSyllabus) {
  for (const prof of syllabus.professionals) {
    for (const s of prof.subjects ?? []) {
      const topics = new Map();
      for (const p of s.papers ?? []) for (const tp of p.topics ?? []) topics.set(tp.id, tp);
      subjectInfo.set(s.id, { prof: prof.id, name_en: s.name_en, name_hi: s.name_hi ?? s.name_en, topics });
      if (s.code && s.code !== s.id) subjectInfo.set(s.code, subjectInfo.get(s.id));
    }
  }
}
function subjectMeta(id) {
  if (subjectInfo.has(id)) return subjectInfo.get(id);
  const fb = SUBJECT_FALLBACK[id];
  if (fb) return { prof: fb[0], name_en: fb[1], name_hi: fb[2], topics: new Map() };
  // unknown: derive prof from a trailing digit (SA1 -> prof1), else null
  return { prof: null, name_en: id.replace(/^AyUG-/, ''), name_hi: id.replace(/^AyUG-/, ''), topics: new Map() };
}

/* ---------------------------------------------------------------- quiz */

const quizDir = path.join(DATA, 'quiz');
const quizManifest = [];
const quizSubjects = [];
let quizCount = 0;
if (fs.existsSync(quizDir)) {
  for (const f of fs.readdirSync(quizDir).filter((x) => x.endsWith('.json')).sort()) {
    const d = readJson(path.join(quizDir, f));
    if (!d || !Array.isArray(d.questions)) continue;
    const subjectId = d.subject_id || f.replace(/\.json$/, '');
    const questions = d.questions.filter(
      (q) =>
        q &&
        typeof q.id === 'string' &&
        Array.isArray(q.options) &&
        q.options.length >= 2 &&
        Number.isInteger(q.answer_index) &&
        q.answer_index >= 0 &&
        q.answer_index < q.options.length &&
        (q.question_en || q.question_hi),
    );
    if (questions.length === 0) continue;
    const sm = subjectMeta(subjectId);
    const topics = new Map();
    for (const q of questions) {
      const tid = q.topic_id || 'general';
      if (!topics.has(tid)) {
        const st = sm.topics.get(tid);
        topics.set(tid, {
          id: tid,
          name_en: q.topic_en || st?.name_en || tid,
          name_hi: q.topic_hi || st?.name_hi || q.topic_en || st?.name_en || tid,
          count: 0,
        });
      }
      topics.get(tid).count++;
    }
    const rel = `quiz/${subjectId}.json`;
    writeJson(rel, { subject_id: subjectId, questions });
    quizManifest.push([subjectId, rel]);
    quizSubjects.push({
      id: subjectId,
      name_en: sm.name_en,
      name_hi: sm.name_hi,
      prof: sm.prof,
      count: questions.length,
      topics: [...topics.values()].sort((a, b) => b.count - a.count),
    });
    quizCount += questions.length;
  }
}
writeJson('quiz-index.json', { subjects: quizSubjects });
console.log(`  quiz: ${quizSubjects.length} subjects, ${quizCount} questions`);

/* ------------------------------------------------------------ glossary */

const glossaryPath = path.join(DATA, 'glossary.json');
const glossary = fs.existsSync(glossaryPath) ? readJson(glossaryPath) : null;
const terms = (glossary?.terms ?? []).filter((t) => t && t.id && (t.devanagari || t.iast));
writeJson('glossary.json', { terms });
console.log(`  glossary: ${terms.length} terms`);

/* --------------------------------------------------------------- stats */

const sources = textsIndex.map((t) => ({
  code: t.code,
  title: t.meta.title,
  source: t.meta.source,
  source_url: t.meta.source_url,
  transcription: t.meta.transcription,
  license_note: t.meta.license_note,
}));
const stats = {
  generated_at: generatedAt,
  texts: textsIndex.length,
  verses: totalVerses,
  translated_chapters: translatedChapters,
  translated_verses: translatedVerses,
  quiz_questions: quizCount,
  glossary_terms: terms.length,
  has_syllabus: hasSyllabus,
};
writeJson('meta.json', {
  stats,
  sources,
  syllabus_meta: hasSyllabus ? syllabus.meta ?? null : null,
});

/* ------------------------------------------------------------ manifest */

const q = (s) => JSON.stringify(s);
const req = (rel) => `require(${q('../../assets/content/' + rel)})`;
const lines = [];
lines.push('/* eslint-disable */');
lines.push('// AUTO-GENERATED by scripts/build-content.mjs. Do not edit by hand; run `npm run content`.');
lines.push(`// Generated ${generatedAt}`);
lines.push("import type { BundleChapter, BundleTextsIndex, GlossaryFile, Highlight, QuizFile, QuizIndex, SearchIndexFile, Syllabus, ContentStats, CorpusMeta } from '../types/content';");
lines.push('');
lines.push('export interface ContentMetaFile {');
lines.push('  stats: ContentStats;');
lines.push('  sources: (Partial<CorpusMeta> & { code: string })[];');
lines.push('  syllabus_meta: Syllabus["meta"] | null;');
lines.push('}');
lines.push('');
lines.push(`export const loadTexts = (): BundleTextsIndex => ${req('texts.json')};`);
lines.push(`export const loadHighlights = (): Highlight[] => ${req('highlights.json')};`);
lines.push(`export const loadSearchIndexFile = (): SearchIndexFile => ${req('search-index.json')};`);
lines.push(`export const loadQuizIndex = (): QuizIndex => ${req('quiz-index.json')};`);
lines.push(`export const loadGlossaryFile = (): GlossaryFile => ${req('glossary.json')};`);
lines.push(`export const loadContentMeta = (): ContentMetaFile => ${req('meta.json')};`);
lines.push(
  hasSyllabus
    ? `export const loadSyllabus = (): Syllabus | null => ${req('syllabus.json')};`
    : 'export const loadSyllabus = (): Syllabus | null => null;',
);
lines.push('');
lines.push('export const chapterLoaders: Record<string, () => BundleChapter> = {');
for (const [id, rel] of chapterManifest) lines.push(`  ${q(id)}: () => ${req(rel)},`);
lines.push('};');
lines.push('');
lines.push('export const quizLoaders: Record<string, () => QuizFile> = {');
for (const [id, rel] of quizManifest) lines.push(`  ${q(id)}: () => ${req(rel)},`);
lines.push('};');
lines.push('');
fs.mkdirSync(path.dirname(MANIFEST), { recursive: true });
fs.writeFileSync(MANIFEST, lines.join('\n'));

/* -------------------------------------------------------------- report */

function dirSize(dir) {
  let total = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    total += e.isDirectory() ? dirSize(p) : fs.statSync(p).size;
  }
  return total;
}
console.log(
  `Done: ${textsIndex.length} texts, ${totalVerses} verses, ${translatedChapters} translated chapters (${translatedVerses} verses), ` +
    `${quizCount} quiz questions, ${terms.length} glossary terms, syllabus: ${hasSyllabus ? 'yes' : 'no'}`,
);
console.log(`Bundle size: ${(dirSize(OUT) / 1024 / 1024).toFixed(2)} MB in assets/content`);
if (warnings.length) console.log(`${warnings.length} warning(s)`);
