import { describe, expect, it } from "vitest";
import { PNG_1PX, makeApp, postJson } from "./helpers.js";

describe("mock mode (no ANTHROPIC_API_KEY)", () => {
  const app = makeApp();

  it("reports mock mode on /health", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.status).toBe("ok");
    expect(body.mock).toBe(true);
    expect(body.model).toBeNull();
    expect(body.content.verses).toBeGreaterThan(7000);
    expect(body.content.translated_verses).toBe(3);
  });

  it("/v1/scan returns a flagged demo ScanResult for AH.sutra.1.6", async () => {
    const res = await postJson(app, "/v1/scan", { imageBase64: PNG_1PX, mediaType: "image/png" });
    expect(res.status).toBe(200);
    expect(res.json.mock).toBe(true);
    expect(res.json.source).toBe("mock");
    expect(res.json.notice).toMatch(/Demo mode/);
    expect(res.json.match.id).toBe("AH.sutra.1.6");
    expect(res.json.ocr_text).toContain("वायुः पित्तं");
    expect(res.json.english.length).toBeGreaterThan(10);
  });

  it("/v1/scan still validates input in mock mode", async () => {
    const res = await postJson(app, "/v1/scan", { imageBase64: PNG_1PX, mediaType: "text/plain" });
    expect(res.status).toBe(415);
  });

  it("/v1/tutor returns a flagged canned reply with retrieved verse citations", async () => {
    const res = await postJson(app, "/v1/tutor", { messages: [{ role: "user", content: "What does vayuh pittam kaphashceti trayo doshah mean?" }] });
    expect(res.status).toBe(200);
    expect(res.json.mock).toBe(true);
    expect(res.json.reply).toMatch(/Demo mode/);
    expect(res.json.citations).toContain("AH.sutra.1.6");
    expect(res.json.reply).toContain("[AH.sutra.1.6]");
  });

  it("/v1/tutor canned reply can be in Hindi", async () => {
    const res = await postJson(app, "/v1/tutor", { lang: "hi", messages: [{ role: "user", content: "pakvashaya kati sakthi shrotra asthi sparshanendriyam" }] });
    expect(res.json.reply).toMatch(/डेमो मोड/);
    expect(res.json.citations).toContain("AH.sutra.12.1");
  });

  it("/v1/explain without a curated translation returns the corpus verse flagged as mock", async () => {
    const res = await postJson(app, "/v1/explain", { text: "brahmā smṛtvāyuṣo vedaṃ prajāpatim ajigrahat" });
    expect(res.status).toBe(200);
    expect(res.json.source).toBe("corpus_only");
    expect(res.json.mock).toBe(true);
    expect(res.json.match.id).toBe("AH.sutra.1.3");
    expect(res.json.devanagari).toContain("ब्रह्मा");
  });

  it("/v1/explain with no match at all returns an empty flagged result", async () => {
    const res = await postJson(app, "/v1/explain", { text: "hello world this is not sanskrit at all" });
    expect(res.status).toBe(200);
    expect(res.json.match).toBeNull();
    expect(res.json.mock).toBe(true);
  });
});
