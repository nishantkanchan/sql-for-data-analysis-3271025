import { devanagariToIast, hasDevanagari } from "./translit.js";

/**
 * Reduce any Sanskrit input (Devanagari, IAST, Harvard-Kyoto-ish, or loose
 * English-keyboard romanisation like "vayuh pittam kaphashceti") to a lossy,
 * diacritic-free ASCII "skeleton". The same function is applied to the corpus
 * and to queries, so the folds only need to be consistent, not reversible.
 */
export function skeleton(input: string): string {
  let s = input.normalize("NFC");
  if (hasDevanagari(s)) s = devanagariToIast(s);
  s = s.toLowerCase();
  // Strip diacritics: ā->a, ś/ṣ->s, ṛ->r, ṃ->m, ḥ->h, ṅ/ñ/ṇ->n, ṭ->t ...
  s = s.normalize("NFD").replace(/\p{M}+/gu, "");
  // Keep letters only: drops dandas, digits, hyphens, spaces, avagraha, punctuation.
  s = s.replace(/[^a-z]+/g, "");
  if (!s) return "";

  s = s.replace(/x/g, "ks").replace(/w/g, "v").replace(/q/g, "k").replace(/z/g, "j").replace(/f/g, "p");
  s = s.replace(/ee/g, "i").replace(/oo/g, "u");

  // Rules that can feed each other (e.g. "chchh") are iterated to a fixed point.
  for (let i = 0; i < 4; i++) {
    const before = s;
    s = s
      // aspiration: kh->k, ch->c, sh->s (covers ś/ṣ written as "sh"), ksh->ks ...
      .replace(/([bcdgjkpst])h/g, "$1")
      // any other h: visarga (ḥ) is very often dropped in loose typing and OCR
      .replace(/h/g, "")
      // v/b
      .replace(/b/g, "v")
      // ṛ vs "ri"/"ru" (kṛ -> kri)
      .replace(/ri/g, "r")
      // anusvāra / nasal before a consonant: ṃ, m, n, ṅ, ñ, ṇ -> n
      .replace(/[mn](?=[^aeiou])/g, "n")
      // doubled letters and long vowels: aa->a, tt->t
      .replace(/(.)\1+/g, "$1");
    if (s === before) break;
  }
  return s;
}

/** Character trigrams of a skeleton (as a set). Short strings yield themselves. */
export function trigrams(s: string): Set<string> {
  const out = new Set<string>();
  if (s.length === 0) return out;
  if (s.length < 3) {
    out.add(s);
    return out;
  }
  for (let i = 0; i <= s.length - 3; i++) out.add(s.slice(i, i + 3));
  return out;
}

/** Length of the longest common substring (dynamic programming, O(n*m) time, O(m) memory). */
export function longestCommonSubstring(a: string, b: string): number {
  if (!a || !b) return 0;
  const m = b.length;
  let prev = new Uint16Array(m + 1);
  let curr = new Uint16Array(m + 1);
  let best = 0;
  for (let i = 1; i <= a.length; i++) {
    const ac = a.charCodeAt(i - 1);
    for (let j = 1; j <= m; j++) {
      if (ac === b.charCodeAt(j - 1)) {
        const v = prev[j - 1]! + 1;
        curr[j] = v;
        if (v > best) best = v;
      } else {
        curr[j] = 0;
      }
    }
    const t = prev;
    prev = curr;
    curr = t;
  }
  return best;
}

/** Normalise free text for keyword (non-Sanskrit-verse) matching: lowercase word tokens. */
export function wordTokens(input: string): string[] {
  return input
    .normalize("NFC")
    .toLowerCase()
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter((t) => t.length >= 2);
}
