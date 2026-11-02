/**
 * Content loading against the generated bundle (run `npm run content` first).
 * Assertions only depend on what the corpus guarantees (AH is complete), so
 * they stay green as translations, quiz files and the glossary appear.
 */
import {
  findGlossaryTerm,
  getChapter,
  getChapterSummary,
  getGlossary,
  getHighlights,
  getQuestion,
  getQuestions,
  getQuizSubjects,
  getText,
  getTexts,
  getVerse,
  isTranslated,
  neighbours,
  parseId,
  searchGlossary,
  searchVerses,
  shlokaOfTheDay,
  subjectsByProf,
  verseLabel,
} from '../src/content';
import { chapterLoaders } from '../src/content/manifest.generated';

describe('texts index', () => {
  it('lists Aṣṭāṅgahṛdaya first with all 120 chapters', () => {
    const texts = getTexts();
    expect(texts[0].code).toBe('AH');
    const ah = getText('AH')!;
    const chapters = ah.sthanas.reduce((n, s) => n + s.chapters.length, 0);
    expect(chapters).toBe(120);
    expect(ah.verse_count).toBeGreaterThan(7000);
    expect(ah.sthanas.map((s) => s.key)).toEqual(['sutra', 'sharira', 'nidana', 'chikitsa', 'kalpa', 'uttara']);
  });

  it('has a loader for every chapter in the index', () => {
    for (const t of getTexts()) for (const s of t.sthanas) for (const c of s.chapters) expect(chapterLoaders[c.id]).toBeDefined();
  });
});

describe('chapters and verses', () => {
  it('loads a chapter with Sanskrit for every verse', () => {
    const ch = getChapter('AH.sutra.1')!;
    expect(ch.verses.length).toBeGreaterThan(40);
    for (const v of ch.verses) {
      expect(v.devanagari).toMatch(/[ऀ-ॿ]/);
      expect(v.iast.length).toBeGreaterThan(0);
      expect(v.id.startsWith('AH.sutra.1.')).toBe(true);
    }
    expect(getChapter('AH.nosuch.1')).toBeNull();
  });

  it('resolves a verse id and its neighbours, across chapter boundaries', () => {
    const ref = getVerse('AH.sutra.1.6')!;
    expect(ref.verse.devanagari).toContain('दोषाः');
    const n = neighbours(ref);
    expect(n.prev?.id).toBe('AH.sutra.1.5');
    expect(n.next?.id).toBe('AH.sutra.1.7');
    const ch1 = getChapter('AH.sutra.1')!;
    const last = getVerse(ch1.verses[ch1.verses.length - 1].id, ch1.verses.length - 1)!;
    expect(neighbours(last).next?.id).toBe('AH.sutra.2.1');
    expect(getVerse('AH.sutra.1.9999')).toBeNull();
  });

  it('merges translations into translated chapters only', () => {
    for (const t of getTexts())
      for (const s of t.sthanas)
        for (const c of s.chapters) {
          if (!c.translated) continue;
          const ch = getChapter(c.id)!;
          expect(ch.translated).toBe(true);
          expect(ch.meta?.title_en).toBeTruthy();
          expect(ch.verses.filter(isTranslated).length).toBe(c.translated_count);
          return; // one is enough
        }
  });

  it('parses ids and labels them', () => {
    expect(parseId('AH.sutra.1.6')).toEqual({ text: 'AH', sthana: 'sutra', chapter: 1, verse: 6, chapterId: 'AH.sutra.1' });
    expect(parseId('AH.sutra.1')?.verse).toBeUndefined();
    expect(parseId('nonsense')).toBeNull();
    expect(verseLabel('AH.sutra.1.6')).toContain('1.6');
    expect(getChapterSummary('AH.sutra.1')?.verse_count).toBeGreaterThan(40);
  });

  it('every highlight resolves to a translated verse', () => {
    for (const h of getHighlights().slice(0, 50)) {
      const ref = getVerse(h.id);
      expect(ref).not.toBeNull();
      expect(isTranslated(ref!.verse)).toBe(true);
    }
    expect(shlokaOfTheDay(new Date(2026, 10, 2))).not.toBeNull();
  });
});

describe('offline search over the bundled index', () => {
  it('finds AH Sū 1.6 from a loose romanised pāda', () => {
    const hits = searchVerses('vayu pittam kaphash cheti trayo doshah samasatah');
    expect(hits[0]?.id).toBe('AH.sutra.1.6');
  });
  it('finds a verse from its Devanagari', () => {
    const v = getVerse('AH.sutra.2.1')!.verse;
    expect(searchVerses(v.devanagari)[0]?.id).toBe('AH.sutra.2.1');
  });
});

describe('quiz bank and glossary (whatever subset exists)', () => {
  it('quiz questions are well formed', () => {
    for (const s of getQuizSubjects()) {
      const qs = getQuestions(s.id);
      expect(qs.length).toBe(s.count);
      for (const q of qs) {
        expect(q.answer_index).toBeGreaterThanOrEqual(0);
        expect(q.answer_index).toBeLessThan(q.options.length);
      }
      expect(getQuestion(qs[0].id)?.id).toBe(qs[0].id);
    }
    const grouped = subjectsByProf('prof1').flatMap((g) => g.subjects);
    expect(grouped.length).toBe(getQuizSubjects().length);
  });

  it('glossary search is diacritic-insensitive', () => {
    const terms = getGlossary();
    if (terms.length === 0) return;
    const t = terms[0];
    expect(searchGlossary(t.simple)[0]?.id).toBeDefined();
    expect(searchGlossary(t.devanagari).some((x) => x.id === t.id)).toBe(true);
    expect(findGlossaryTerm(t.iast)?.id).toBe(t.id);
  });
});
