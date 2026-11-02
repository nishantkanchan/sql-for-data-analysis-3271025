import {
  buildIndex,
  devanagariToIast,
  extractVerseIds,
  isVerseId,
  search,
  similarity,
  skeleton,
  trigrams,
  type SearchEntry,
} from '../src/lib/search';

const AH_1_6_DEV = 'अष्टावङ्गानि तस्याहुश्चिकित्सा येषु संश्रिता ।\nवायुः पित्तं कफश्चेति त्रयो दोषाः समासतः ॥ ६ ॥';
const AH_1_6_IAST = 'aṣṭāv aṅgāni tasyāhuś cikitsā yeṣu saṃśritā |\nvāyuḥ pittaṃ kaphaś ceti trayo doṣāḥ samāsataḥ || 6 ||';

describe('devanagariToIast', () => {
  it('handles inherent a, matras, virama, anusvara and visarga', () => {
    expect(devanagariToIast('दोषः')).toBe('doṣaḥ');
    expect(devanagariToIast('पित्तं')).toBe('pittaṃ');
    expect(devanagariToIast('वायुः')).toBe('vāyuḥ');
    expect(devanagariToIast('हृदय')).toBe('hṛdaya');
    expect(devanagariToIast('ज्ञान')).toBe('jñāna');
    expect(devanagariToIast('क्षार')).toBe('kṣāra');
  });
  it('maps dandas and digits', () => {
    expect(devanagariToIast('॥ ६ ॥')).toBe('|| 6 ||');
  });
});

describe('skeleton', () => {
  it('gives the same skeleton for Devanagari and IAST of a verse', () => {
    expect(skeleton(AH_1_6_DEV)).toBe(skeleton(AH_1_6_IAST));
  });
  it('folds loose romanisation onto IAST', () => {
    expect(skeleton('doshah')).toBe(skeleton('doṣāḥ'));
    expect(skeleton('hridaya')).toBe(skeleton('hṛdaya'));
    expect(skeleton('Ashtanga Hridayam')).toBe(skeleton('aṣṭāṅgahṛdayam'));
    expect(skeleton('chikitsa')).toBe(skeleton('cikitsā'));
    expect(skeleton('sattva')).toBe(skeleton('satva'));
    expect(skeleton('sanskrit')).toBe(skeleton('saṃskṛt'));
    expect(skeleton('gyana')).toBe(skeleton('jñāna'));
    expect(skeleton('kshara')).toBe(skeleton('kṣāra'));
  });
  it('drops punctuation, digits and spaces', () => {
    expect(skeleton('vāyuḥ pittaṃ || 6 ||')).toMatch(/^[a-z]+$/);
    expect(skeleton('')).toBe('');
    expect(skeleton('॥ १ ॥')).toBe('');
  });
});

describe('trigrams / similarity', () => {
  it('produces unique trigrams', () => {
    expect(trigrams('aaaa')).toEqual(['aaa']);
    expect(trigrams('ab')).toEqual(['ab']);
    expect(trigrams('abcd').sort()).toEqual(['abc', 'bcd']);
  });
  it('scores identical strings 1 and unrelated strings low', () => {
    const s = skeleton(AH_1_6_IAST);
    expect(similarity(s, s)).toBeCloseTo(1, 5);
    expect(similarity(skeleton('brahma smṛtvāyuṣo vedaṃ'), s)).toBeLessThan(0.3);
  });
});

describe('search', () => {
  const entries: SearchEntry[] = [
    { id: 'AH.sutra.1.6', skeleton: skeleton(AH_1_6_IAST) },
    { id: 'AH.sutra.1.3', skeleton: skeleton("brahmā smṛtvāyuṣo vedaṃ prajāpatim ajigrahat | so 'śvinau tau sahasrākṣaṃ so 'tri-putrādikān munīn") },
    { id: 'AH.sutra.2.1', skeleton: skeleton('brāhme muhūrta uttiṣṭhet svastho rakṣārtham āyuṣaḥ | śarīra-cintāṃ nirvartya kṛta-śauca-vidhis tataḥ') },
    { id: 'CS.sutra.1.6', skeleton: skeleton('vighnabhūtā yadā rogāḥ prādurbhūtāḥ śarīriṇām\ntapopavāsādhyayanabrahmacaryavratāyuṣām') },
  ];
  const index = buildIndex(entries);

  it('finds a verse from pasted Devanagari', () => {
    const hits = search(index, AH_1_6_DEV);
    expect(hits[0].id).toBe('AH.sutra.1.6');
    expect(hits[0].score).toBeGreaterThan(0.95);
  });
  it('finds a verse from one remembered pāda in loose spelling', () => {
    const hits = search(index, 'vayu pittam kaphash cheti trayo doshah');
    expect(hits[0].id).toBe('AH.sutra.1.6');
    expect(hits[0].score).toBeGreaterThan(0.8);
  });
  it('tolerates typos', () => {
    const hits = search(index, 'brahme muhurte uttishthet swastho rakshartham');
    expect(hits[0].id).toBe('AH.sutra.2.1');
  });
  it('returns nothing for empty or unrelated input', () => {
    expect(search(index, '')).toEqual([]);
    expect(search(index, '12345 !!')).toEqual([]);
    expect(search(index, 'xyzzy quux')).toEqual([]);
  });
  it('respects the limit and sorts by score', () => {
    const hits = search(index, 'brahma', { limit: 2, minScore: 0 });
    expect(hits.length).toBeLessThanOrEqual(2);
    for (let i = 1; i < hits.length; i++) expect(hits[i - 1].score).toBeGreaterThanOrEqual(hits[i].score);
  });
});

describe('verse id helpers', () => {
  it('extracts verse ids from text, de-duplicated', () => {
    expect(extractVerseIds('See AH.sutra.1.6 and CS.sutra.1.28; also AH.sutra.1.6.')).toEqual(['AH.sutra.1.6', 'CS.sutra.1.28']);
    expect(extractVerseIds('no refs here')).toEqual([]);
  });
  it('validates verse ids', () => {
    expect(isVerseId('AH.sutra.1.6')).toBe(true);
    expect(isVerseId('CS Sū 1.28')).toBe(false);
    expect(isVerseId(undefined)).toBe(false);
  });
});
