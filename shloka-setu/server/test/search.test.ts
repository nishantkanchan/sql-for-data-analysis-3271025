import { describe, expect, it } from "vitest";
import { makeApp, testStore } from "./helpers.js";

const index = () => testStore().index;
const top1 = (q: string) => index().search(q, 5)[0];

describe("search ranking (real Aṣṭāṅgahṛdaya corpus)", () => {
  it.each([
    ["Devanagari", "अष्टावङ्गानि तस्याहुश्चिकित्सा येषु संश्रिता । वायुः पित्तं कफश्चेति त्रयो दोषाः समासतः ॥ ६ ॥"],
    ["IAST", "aṣṭāv aṅgāni tasyāhuś cikitsā yeṣu saṃśritā | vāyuḥ pittaṃ kaphaś ceti trayo doṣāḥ samāsataḥ"],
    ["loose romanisation", "vayuh pittam kaphashceti trayo doshah samasatah"],
    ["OCR-noisy partial line (lost visargas, श्च read as श्व)", "वायु पित्तं कफश्वेति त्रयो दोषा समासत"],
  ])("finds AH.sutra.1.6 top-1 from %s", (_label, q) => {
    const hit = top1(q);
    expect(hit?.id).toBe("AH.sutra.1.6");
  });

  it.each([
    ["Devanagari", "पक्वाशयकटीसक्थिश्रोत्रास्थिस्पर्शनेन्द्रियम् । स्थानं वातस्य तत्रापि पक्वाधानं विशेषतः ॥ १ ॥"],
    ["IAST", "pakvāśaya-kaṭī-sakthi-śrotrāsthi-sparśanendriyam | sthānaṃ vātasya tatrāpi pakvādhānaṃ viśeṣataḥ"],
    ["loose romanisation", "pakvashaya kati sakthi shrotra asthi sparshanendriyam sthanam vatasya"],
    ["OCR-noisy partial line (dropped र्, सक्थि read as सकथि)", "पक्वाशयकटीसकथिश्रोत्रास्थिस्पशनेन्द्रियम्"],
    ["second line only", "sthanam vatasya tatrapi pakvadhanam visheshatah"],
  ])("finds AH.sutra.12.1 top-1 from %s", (_label, q) => {
    expect(top1(q)?.id).toBe("AH.sutra.12.1");
  });

  it("scores exact matches near 1 and unrelated text low", () => {
    expect(top1("vāyuḥ pittaṃ kaphaś ceti trayo doṣāḥ samāsataḥ")!.score).toBeGreaterThan(0.85);
    const junk = index().search("the quick brown fox jumps over the lazy dog", 1)[0];
    expect(junk?.score ?? 0).toBeLessThan(0.4);
  });

  it("down-weights very short queries", () => {
    expect(top1("vata")!.score).toBeLessThan(0.5);
  });

  it("returns results sorted by score and respects limit and text filter", () => {
    const hits = index().search("dharmartha sukha sadhanam", 7);
    expect(hits.length).toBe(7);
    for (let i = 1; i < hits.length; i++) expect(hits[i - 1]!.score).toBeGreaterThanOrEqual(hits[i]!.score);
    expect(hits[0]!.id).toBe("AH.sutra.1.2");
    const cs = index().search("athato dirghanjivitiyam adhyayam vyakhyasyamah", 5, { textCode: "CS" });
    expect(cs.every((h) => h.id.startsWith("CS."))).toBe(true);
    expect(cs[0]!.id).toBe("CS.sutra.1.1");
  });

  it("searches translations by keyword for tutor questions", () => {
    const hits = index().searchTranslations("What are the three doshas?", 3);
    expect(hits[0]?.id).toBe("AH.sutra.1.6");
  });
});

describe("GET /v1/search", () => {
  const app = makeApp();

  it("returns verse records joined with translations plus a score", async () => {
    const res = await app.request(`/v1/search?q=${encodeURIComponent("vayuh pittam kaphashceti")}&limit=3`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.count).toBe(3);
    const first = body.results[0];
    expect(first.id).toBe("AH.sutra.1.6");
    expect(typeof first.score).toBe("number");
    expect(first.devanagari).toContain("वायुः");
    expect(first.source_title).toBe("Aṣṭāṅgahṛdaya, Sūtrasthāna 1.6");
    expect(first.translation.english).toMatch(/three doṣas/);
    expect(first.translation.word_meanings.length).toBeGreaterThan(0);
    expect(first.chapter_info.title_en).toMatch(/long life/);
    // a verse without a translation file has translation: null
    expect(body.results.some((r: any) => r.translation === null)).toBe(true);
  });

  it("validates q and limit", async () => {
    const missing = await app.request("/v1/search");
    expect(missing.status).toBe(400);
    expect(((await missing.json()) as any).error.code).toBe("validation_error");
    const badLimit = await app.request("/v1/search?q=vata&limit=500");
    expect(badLimit.status).toBe(400);
  });
});

describe("GET /v1/verse/:id", () => {
  const app = makeApp();

  it("returns the verse with translation and neighbours", async () => {
    const res = await app.request("/v1/verse/AH.sutra.12.1");
    expect(res.status).toBe(200);
    const v = (await res.json()) as any;
    expect(v.iast).toMatch(/^pakvāśaya/);
    expect(v.translation.english).toMatch(/colon/);
    expect(v.translation.modern_correlation).toBeNull();
    expect(v.prev_id).toBe("AH.sutra.11.45");
    expect(v.next_id).toBe("AH.sutra.12.2");
  });

  it("404s for unknown ids and 400s for malformed ids", async () => {
    const nf = await app.request("/v1/verse/AH.sutra.99.99");
    expect(nf.status).toBe(404);
    expect(((await nf.json()) as any).error.code).toBe("not_found");
    const bad = await app.request("/v1/verse/hello");
    expect(bad.status).toBe(400);
  });
});

describe("multi-text corpus (Caraka + Suśruta complete files)", () => {
  const store = testStore();
  const hasFull = store.content.stats.texts.SS !== undefined && (store.content.stats.texts.CS ?? 0) > 5000;

  it.runIf(hasFull)("ranks Caraka and Suśruta verses top-1 from loose / Devanagari input", () => {
    expect(top1("vayuh pittam kaphashcoktah shariro doshasangrahah manasah punaruddishto")?.id).toBe("CS.sutra.1.57");
    expect(top1("दोषधातुमलमूलं हि शरीरं तस्मादेतेषां लक्षणमुच्यमानमुपधारय")?.id).toBe("SS.sutra.15.3");
  });

  it.runIf(hasFull)("exposes ref / provenance and pada-aware source titles", async () => {
    const res = await makeApp().request("/v1/verse/CS.chikitsa.1.202");
    const v = (await res.json()) as any;
    expect(v.ref).toBe("Ca. Ci. 1.2.2");
    expect(v.pada).toBe(2);
    expect(v.verse_in_pada).toBe(2);
    expect(typeof v.source).toBe("string");
    expect(v.source_title).toBe("Carakasaṃhitā, Cikitsāsthāna 1.2.2");
    const ah = (await (await makeApp().request("/v1/verse/AH.sutra.1.6")).json()) as any;
    expect(ah.ref).toBeNull();
  });

  it.runIf(hasFull)("skips the obsolete charaka_selected.json when present", () => {
    const skipped = store.content.stats.skipped_files.map((s) => s.file);
    const selectedPresent = skipped.some((f) => f.endsWith("charaka_selected.json"));
    if (selectedPresent) expect(store.content.byId.has("CS.chikitsa.1.1")).toBe(false); // selected-only numbering
    expect(store.content.textTitles.get("CS")).toMatch(/complete/);
  });
});
