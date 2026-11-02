/**
 * Minimal, dependency-free Devanagari -> IAST transliteration.
 *
 * Covers classical Sanskrit (consonants, independent vowels, mātrās, virāma,
 * anusvāra, candrabindu, visarga, avagraha, daṇḍas, digits). Nukta and Vedic
 * accent marks are dropped. Non-Devanagari characters pass through unchanged,
 * so mixed input ("verse 6: वायुः") works.
 */

const CONSONANTS: Record<string, string> = {
  "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "ṅ",
  "च": "c", "छ": "ch", "ज": "j", "झ": "jh", "ञ": "ñ",
  "ट": "ṭ", "ठ": "ṭh", "ड": "ḍ", "ढ": "ḍh", "ण": "ṇ",
  "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n",
  "प": "p", "फ": "ph", "ब": "b", "भ": "bh", "म": "m",
  "य": "y", "र": "r", "ल": "l", "व": "v",
  "श": "ś", "ष": "ṣ", "स": "s", "ह": "h", "ळ": "ḷ",
  // precomposed nukta letters (U+0958-095F)
  "क़": "q", "ख़": "kh", "ग़": "g", "ज़": "z", "ड़": "ṛ", "ढ़": "ṛh", "फ़": "f", "य़": "y",
};

const VOWELS: Record<string, string> = {
  "अ": "a", "आ": "ā", "इ": "i", "ई": "ī", "उ": "u", "ऊ": "ū",
  "ऋ": "ṛ", "ॠ": "ṝ", "ऌ": "ḷ", "ॡ": "ḹ",
  "ए": "e", "ऐ": "ai", "ओ": "o", "औ": "au", "ऍ": "e", "ऑ": "o", "ऎ": "e", "ऒ": "o",
};

const MATRAS: Record<string, string> = {
  "ा": "ā", "ि": "i", "ी": "ī", "ु": "u", "ू": "ū",
  "ृ": "ṛ", "ॄ": "ṝ", "ॢ": "ḷ", "ॣ": "ḹ",
  "े": "e", "ै": "ai", "ो": "o", "ौ": "au", "ॅ": "e", "ॉ": "o", "ॆ": "e", "ॊ": "o",
};

const OTHERS: Record<string, string> = {
  "ं": "ṃ", "ँ": "ṃ", "ः": "ḥ", "ऽ": "'", "ॐ": "oṃ", "।": "|", "॥": "||",
  "०": "0", "१": "1", "२": "2", "३": "3", "४": "4", "५": "5", "६": "6", "७": "7", "८": "8", "९": "9",
};

const VIRAMA = "्";
const NUKTA = "़";
// Vedic accents, ZWJ/ZWNJ, abbreviation sign: dropped.
const IGNORED = new Set(["॑", "॒", "॓", "॔", "‌", "‍", "॰"]);

const DEVANAGARI_RE = /[ऀ-ॿ]/;

export function hasDevanagari(s: string): boolean {
  return DEVANAGARI_RE.test(s);
}

export function devanagariToIast(input: string): string {
  const s = input.normalize("NFC");
  const chars = Array.from(s);
  let out = "";
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]!;
    const cons = CONSONANTS[ch];
    if (cons !== undefined) {
      out += cons;
      let j = i + 1;
      while (j < chars.length && (chars[j] === NUKTA || IGNORED.has(chars[j]!))) j++;
      const next = chars[j];
      if (next === VIRAMA) {
        i = j; // dead consonant: no inherent vowel
      } else if (next !== undefined && MATRAS[next] !== undefined) {
        out += MATRAS[next];
        i = j;
      } else {
        out += "a";
        i = j - 1;
      }
      continue;
    }
    if (VOWELS[ch] !== undefined) out += VOWELS[ch];
    else if (OTHERS[ch] !== undefined) out += OTHERS[ch];
    else if (MATRAS[ch] !== undefined) out += MATRAS[ch]; // stray mātrā (OCR noise)
    else if (ch === VIRAMA || ch === NUKTA || IGNORED.has(ch)) continue;
    else out += ch;
  }
  return out;
}
