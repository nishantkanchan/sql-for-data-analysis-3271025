/**
 * Sanskrit text normalisation shared by the app (search.ts) and the content
 * build script (scripts/build-content.mjs imports this file directly using
 * Node's built-in TypeScript type stripping, so: no imports, no enums,
 * erasable syntax only).
 *
 * skeleton() maps Devanagari, IAST and loose romanisation ("shloka",
 * "hridaya", "doshah") onto one diacritic-free ASCII string so that the
 * same verse typed three different ways produces (nearly) the same output.
 */

const INDEPENDENT_VOWELS: Record<string, string> = {
  'अ': 'a', 'आ': 'ā', 'इ': 'i', 'ई': 'ī', 'उ': 'u', 'ऊ': 'ū', 'ऋ': 'ṛ', 'ॠ': 'ṝ',
  'ऌ': 'ḷ', 'ॡ': 'ḹ', 'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au', 'ऍ': 'e', 'ऑ': 'o', 'ऎ': 'e', 'ऒ': 'o',
};

const MATRAS: Record<string, string> = {
  'ा': 'ā', 'ि': 'i', 'ी': 'ī', 'ु': 'u', 'ू': 'ū', 'ृ': 'ṛ', 'ॄ': 'ṝ', 'ॢ': 'ḷ', 'ॣ': 'ḹ',
  'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ॅ': 'e', 'ॉ': 'o', 'ॆ': 'e', 'ॊ': 'o',
};

const CONSONANTS: Record<string, string> = {
  'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'ṅ',
  'च': 'c', 'छ': 'ch', 'ज': 'j', 'झ': 'jh', 'ञ': 'ñ',
  'ट': 'ṭ', 'ठ': 'ṭh', 'ड': 'ḍ', 'ढ': 'ḍh', 'ण': 'ṇ',
  'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n', 'ऩ': 'n',
  'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm',
  'य': 'y', 'र': 'r', 'ऱ': 'r', 'ल': 'l', 'ळ': 'ḷ', 'ऴ': 'ḷ', 'व': 'v',
  'श': 'ś', 'ष': 'ṣ', 'स': 's', 'ह': 'h',
  // precomposed nukta forms: fold to the base consonant
  'क़': 'k', 'ख़': 'kh', 'ग़': 'g', 'ज़': 'j', 'ड़': 'ḍ', 'ढ़': 'ḍh', 'फ़': 'ph', 'य़': 'y',
};

const SIGNS: Record<string, string> = {
  'ं': 'ṃ', 'ः': 'ḥ', 'ँ': 'ṃ', 'ऽ': "'", 'ॐ': 'oṃ', '।': '|', '॥': '||',
  '०': '0', '१': '1', '२': '2', '३': '3', '४': '4', '५': '5', '६': '6', '७': '7', '८': '8', '९': '9',
};

const VIRAMA = '्';
const NUKTA = '़';
const DEVANAGARI_RE = /[ऀ-ॿ]/;

export function hasDevanagari(text: string): boolean {
  return DEVANAGARI_RE.test(text);
}

/** Transliterate Devanagari to IAST. Non-Devanagari characters pass through unchanged. */
export function devanagariToIast(text: string): string {
  let out = '';
  const chars = Array.from(text.normalize('NFC'));
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const cons = CONSONANTS[ch];
    if (cons !== undefined) {
      out += cons;
      let j = i + 1;
      if (chars[j] === NUKTA) j++;
      const next = chars[j];
      if (next === VIRAMA) {
        i = j;
      } else if (next !== undefined && MATRAS[next] !== undefined) {
        out += MATRAS[next];
        i = j;
      } else {
        out += 'a';
        i = j - 1;
      }
      continue;
    }
    const v = INDEPENDENT_VOWELS[ch];
    if (v !== undefined) {
      out += v;
      continue;
    }
    const s = SIGNS[ch];
    if (s !== undefined) {
      out += s;
      continue;
    }
    if (ch === NUKTA || ch === VIRAMA) continue;
    if (MATRAS[ch] !== undefined) {
      out += MATRAS[ch];
      continue;
    }
    out += ch;
  }
  return out;
}

/** Lowercase + strip diacritics (Latin only). Useful for English/IAST display search. */
export function foldLatin(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/**
 * Map any Sanskrit input (Devanagari, IAST, Harvard-Kyoto-ish, or loose
 * Indian romanisation) to a compact ASCII skeleton with no spaces.
 */
export function skeleton(input: string): string {
  if (!input) return '';
  let s = hasDevanagari(input) ? devanagariToIast(input) : input;
  s = s.toLowerCase();
  // IAST letters that need more than diacritic stripping
  s = s
    .replace(/ḥ/g, '') // visarga: loose writers rarely type it
    .replace(/[ṛṝ]/g, 'ri') // matches loose "hridaya", "prakriti", "ritu"
    .replace(/r̥/g, 'ri')
    .replace(/[ḷḹ]/g, 'l')
    .replace(/[ṃṁ]/g, 'm')
    .replace(/m̐/g, 'm');
  s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  // loose romanisation: word-final "h" after a vowel is a typed visarga
  s = s.replace(/([aeiou])h(?=[^a-z]|$)/g, '$1');
  // letters only
  s = s.replace(/[^a-z]/g, '');
  s = s
    .replace(/w/g, 'v')
    .replace(/q/g, 'k')
    .replace(/z/g, 'j')
    .replace(/x/g, 'ks')
    .replace(/f/g, 'p')
    .replace(/ee/g, 'i')
    .replace(/oo/g, 'u')
    .replace(/jn/g, 'gy')
    // aspirates and sh/ch: kh->k, sh->s, ch->c, th->t ...
    .replace(/([kgcjtdpbs])h/g, '$1')
    // nasal before a consonant (anusvara vs n/m spellings)
    .replace(/[mn](?=[^aeiou])/g, 'n')
    // vowel length and gemination: aa->a, tt->t
    .replace(/(.)\1+/g, '$1');
  return s;
}

/** Unique character trigrams of a skeleton. Strings shorter than 3 yield the string itself. */
export function trigrams(s: string): string[] {
  if (s.length === 0) return [];
  if (s.length < 3) return [s];
  const set = new Set<string>();
  for (let i = 0; i + 3 <= s.length; i++) set.add(s.slice(i, i + 3));
  return Array.from(set);
}
