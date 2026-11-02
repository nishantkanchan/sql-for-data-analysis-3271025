import { describe, expect, it } from "vitest";
import { longestCommonSubstring, skeleton, trigrams } from "../src/search/normalize.js";
import { devanagariToIast, hasDevanagari } from "../src/search/translit.js";

describe("devanagariToIast", () => {
  it("transliterates a full verse with conjuncts, anusvara, visarga and dandas", () => {
    expect(devanagariToIast("वायुः पित्तं कफश्चेति त्रयो दोषाः समासतः ॥ ६ ॥")).toBe(
      "vāyuḥ pittaṃ kaphaśceti trayo doṣāḥ samāsataḥ || 6 ||",
    );
  });

  it("handles virama, vocalic r, independent vowels and avagraha", () => {
    expect(devanagariToIast("अष्टावङ्गानि")).toBe("aṣṭāvaṅgāni");
    expect(devanagariToIast("हृदय")).toBe("hṛdaya");
    expect(devanagariToIast("ऋतु")).toBe("ṛtu");
    expect(devanagariToIast("सोऽश्विनौ")).toBe("so'śvinau");
    expect(devanagariToIast("ज्ञान")).toBe("jñāna");
    expect(devanagariToIast("क्षय")).toBe("kṣaya");
  });

  it("passes non-Devanagari through and detects script", () => {
    expect(devanagariToIast("verse 6: वात")).toBe("verse 6: vāta");
    expect(hasDevanagari("vata")).toBe(false);
    expect(hasDevanagari("वात")).toBe(true);
  });

  it("ignores nukta and stray marks without crashing", () => {
    expect(devanagariToIast("ज़")).toBe("ja");
    expect(devanagariToIast("ा")).toBe("ā");
  });
});

describe("skeleton", () => {
  const target = skeleton("vāyuḥ pittaṃ kaphaś ceti trayo doṣāḥ samāsataḥ || 6 ||");

  it("maps Devanagari, IAST and loose romanisation to the same skeleton", () => {
    expect(skeleton("वायुः पित्तं कफश्चेति त्रयो दोषाः समासतः ॥ ६ ॥")).toBe(target);
    expect(skeleton("vayuh pittam kaphashceti trayo doshah samasatah")).toBe(target);
    expect(skeleton("VAAYUH PITTAM KAPHASH CHETI TRAYO DOSHAAH SAMAASATAH")).toBe(target);
  });

  it("strips dandas, digits, hyphens, spaces and avagraha", () => {
    expect(skeleton("pakvāśaya-kaṭī || 1 ||")).toBe(skeleton("pakvasayakati"));
    expect(skeleton("so 'śvinau")).toBe(skeleton("soshvinau"));
    expect(skeleton("|| १२ ||")).toBe("");
  });

  it("folds common spelling variants", () => {
    expect(skeleton("śarīra")).toBe(skeleton("shareera")); // ś=sh, ī=ee
    expect(skeleton("vṛddhi")).toBe(skeleton("vriddhi")); // ṛ=ri
    expect(skeleton("bala")).toBe(skeleton("vala")); // v/b
    expect(skeleton("saṃśritā")).toBe(skeleton("sanshrita")); // ṃ/n before consonant
    expect(skeleton("aṅga")).toBe(skeleton("anga"));
    expect(skeleton("pitta")).toBe(skeleton("pita")); // doubled consonants
    expect(skeleton("kṣaya")).toBe(skeleton("kshaya"));
    expect(skeleton("cikitsā")).toBe(skeleton("chikitsa"));
  });

  it("produces ASCII only", () => {
    expect(skeleton("आयुर्वेदोपदेशेषु विधेयः परमादरः")).toMatch(/^[a-z]+$/);
  });
});

describe("trigrams and longest common substring", () => {
  it("builds trigram sets", () => {
    expect([...trigrams("abcd")]).toEqual(["abc", "bcd"]);
    expect([...trigrams("ab")]).toEqual(["ab"]);
    expect(trigrams("").size).toBe(0);
  });

  it("computes the longest common substring", () => {
    expect(longestCommonSubstring("xxabcdyy", "zabcdz")).toBe(4);
    expect(longestCommonSubstring("abc", "xyz")).toBe(0);
    expect(longestCommonSubstring("", "abc")).toBe(0);
  });
});
