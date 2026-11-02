import { describe, expect, it } from "vitest";
import { validateImage } from "../src/services/scan.js";
import { JPEG_HEADER_B64, PNG_1PX, fakeClient, fakeMessage, makeApp, postJson } from "./helpers.js";

const OCR_OK = {
  lines: ["वायुः पित्तं कफश्चेति त्रयो दोषाः समासतः ॥ ६ ॥"],
  contains_devanagari: true,
  legibility: "clear",
};

describe("POST /v1/scan (Claude mocked)", () => {
  it("runs vision OCR, then the curated explain path (one LLM call total)", async () => {
    const { client, create } = fakeClient(fakeMessage(JSON.stringify(OCR_OK)));
    const app = makeApp({ client });
    const res = await postJson(app, "/v1/scan", { imageBase64: PNG_1PX, mediaType: "image/png" });
    expect(res.status).toBe(200);
    expect(create).toHaveBeenCalledTimes(1);
    const body = create.mock.calls[0]![0];
    const content = body.messages[0].content;
    expect(content[0]).toEqual({ type: "image", source: { type: "base64", media_type: "image/png", data: PNG_1PX } });
    expect(body.output_config.effort).toBe("low");
    expect(body.output_config.format.schema.required).toContain("lines");

    expect(res.json.ocr_text).toBe(OCR_OK.lines[0]);
    expect(res.json.ocr_legibility).toBe("clear");
    expect(res.json.source).toBe("curated");
    expect(res.json.match.id).toBe("AH.sutra.1.6");
    expect(res.json.mock).toBe(false);
  });

  it("falls through to the AI explain step for unmatched OCR text (two LLM calls)", async () => {
    const explain = {
      devanagari: "कश्चित् श्लोकः",
      iast: "kaścit ślokaḥ",
      matched_verse_id: null,
      in_corpus: false,
      word_meanings: [],
      english: "Some verse.",
      hindi: "कोई श्लोक।",
      explanation_en: "This verse was not found in the Shloka Setu corpus.",
      explanation_hi: "यह श्लोक Shloka Setu के संग्रह में नहीं मिला।",
      modern_correlation: null,
      key_terms: [],
      related_verse_ids: [],
      confidence: "low",
    };
    const { client, create } = fakeClient(
      fakeMessage(JSON.stringify({ lines: ["कश्चित् श्लोकः यः न अस्ति"], contains_devanagari: true, legibility: "poor" })),
      fakeMessage(JSON.stringify(explain)),
    );
    const res = await postJson(makeApp({ client }), "/v1/scan", { imageBase64: PNG_1PX, mediaType: "image/png", lang: "hi" });
    expect(res.status).toBe(200);
    expect(create).toHaveBeenCalledTimes(2);
    expect(res.json.source).toBe("ai");
    expect(res.json.in_corpus).toBe(false);
    expect(res.json.match).toBeNull();
    expect(res.json.ocr_text).toBe("कश्चित् श्लोकः यः न अस्ति");
  });

  it("returns 422 no_text_found when the photo has no Devanagari", async () => {
    const { client } = fakeClient(fakeMessage(JSON.stringify({ lines: [], contains_devanagari: false, legibility: "clear" })));
    const res = await postJson(makeApp({ client }), "/v1/scan", { imageBase64: PNG_1PX, mediaType: "image/png" });
    expect(res.status).toBe(422);
    expect(res.json.error.code).toBe("no_text_found");
  });
});

describe("image validation", () => {
  it("accepts data URLs and corrects a wrong declared media type from magic bytes", () => {
    const img = validateImage(`data:image/png;base64,${JPEG_HEADER_B64}`, "image/png", 5_000_000);
    expect(img.mediaType).toBe("image/jpeg");
    expect(validateImage(PNG_1PX, "image/jpg", 5_000_000).mediaType).toBe("image/png");
  });

  it("rejects unsupported media types with 415", async () => {
    const res = await postJson(makeApp(), "/v1/scan", { imageBase64: PNG_1PX, mediaType: "application/pdf" });
    expect(res.status).toBe(415);
    expect(res.json.error.code).toBe("unsupported_media_type");
  });

  it("rejects non-image bytes with 415", async () => {
    const res = await postJson(makeApp(), "/v1/scan", { imageBase64: Buffer.from("hello world, not an image").toString("base64"), mediaType: "image/png" });
    expect(res.status).toBe(415);
  });

  it("rejects invalid base64 with 400", async () => {
    const res = await postJson(makeApp(), "/v1/scan", { imageBase64: "###not-base64###...", mediaType: "image/png" });
    expect(res.status).toBe(400);
    expect(res.json.error.code).toBe("validation_error");
  });

  it("rejects images over the size limit with 413", async () => {
    const big = Buffer.alloc(2048, 0);
    Buffer.from(JPEG_HEADER_B64, "base64").copy(big);
    const app = makeApp({ env: { MAX_IMAGE_BYTES: "1024" } });
    const res = await postJson(app, "/v1/scan", { imageBase64: big.toString("base64"), mediaType: "image/jpeg" });
    expect(res.status).toBe(413);
    expect(res.json.error.code).toBe("payload_too_large");
  });
});
