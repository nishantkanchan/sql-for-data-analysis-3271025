import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { fakeClient, fakeMessage, makeApp, postJson } from "./helpers.js";

const AI_OUTPUT = {
  devanagari: "धर्मार्थसुखसाधनम्",
  iast: "dharmārtha-sukha-sādhanam",
  matched_verse_id: "AH.sutra.1.2",
  in_corpus: true,
  word_meanings: [{ sa: "धर्म", iast: "dharma", en: "virtue", hi: "धर्म" }],
  english: "Life is the means to dharma, artha and sukha.",
  hindi: "आयु धर्म, अर्थ और सुख का साधन है।",
  explanation_en: "Explains why one should respect Ayurveda.",
  explanation_hi: "व्याख्या।",
  modern_correlation: null,
  key_terms: ["dharma", "artha", "sukha"],
  related_verse_ids: ["AH.sutra.1.3", "AH.sutra.404.1"],
  confidence: "high",
};

describe("POST /v1/explain: curated path (no LLM)", () => {
  it("returns curated content for a strong match without calling Claude", async () => {
    const { client, create } = fakeClient(fakeMessage("{}"));
    const app = makeApp({ client });
    const res = await postJson(app, "/v1/explain", { text: "वायुः पित्तं कफश्चेति त्रयो दोषाः समासतः" });
    expect(res.status).toBe(200);
    expect(create).not.toHaveBeenCalled();
    const r = res.json;
    expect(r.source).toBe("curated");
    expect(r.mock).toBe(false);
    expect(r.match.id).toBe("AH.sutra.1.6");
    expect(r.match.source_title).toBe("Aṣṭāṅgahṛdaya, Sūtrasthāna 1.6");
    expect(r.english).toMatch(/three doṣas/);
    expect(r.word_meanings[0]).toEqual({ sa: "अष्टौ", iast: "aṣṭau", en: "eight", hi: "आठ" });
    expect(r.review_status).toBe("expert_reviewed");
    expect(r.disclaimer).toMatch(/Expert-reviewed/);
    expect(r.related_verse_ids).toEqual(expect.arrayContaining(["AH.sutra.1.5", "AH.sutra.1.7"]));
    expect(r.ocr_text).toBe("वायुः पित्तं कफश्चेति त्रयो दोषाः समासतः");
    // ScanResult contract keys are all present
    for (const k of ["ocr_text", "iast", "match", "word_meanings", "english", "hindi", "explanation_en", "explanation_hi", "modern_correlation", "key_terms", "related_verse_ids", "confidence", "disclaimer"]) {
      expect(r).toHaveProperty(k);
    }
  });

  it("works in mock mode too (no API key)", async () => {
    const app = makeApp();
    const res = await postJson(app, "/v1/explain", { text: "pakvashaya kati sakthi shrotra asthi sparshanendriyam sthanam vatasya" });
    expect(res.status).toBe(200);
    expect(res.json.source).toBe("curated");
    expect(res.json.mock).toBe(false);
    expect(res.json.match.id).toBe("AH.sutra.12.1");
    expect(res.json.modern_correlation).toBeNull();
  });
});

describe("POST /v1/explain: AI path (Claude mocked)", () => {
  it("calls Claude with structured output, grounding candidates and a cached system prompt", async () => {
    const { client, create } = fakeClient(fakeMessage(JSON.stringify(AI_OUTPUT)));
    const app = makeApp({ client });
    const res = await postJson(app, "/v1/explain", { text: "dharmartha sukha sadhanam" });
    expect(res.status).toBe(200);
    expect(create).toHaveBeenCalledTimes(1);
    const body = create.mock.calls[0]![0];
    expect(body.model).toBe("claude-opus-5-5");
    expect(body.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(body.output_config.format.type).toBe("json_schema");
    expect(body.output_config.effort).toBe("medium");
    expect(body.fallbacks).toBe("default");
    expect(body.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(body.tool_choice).toBeUndefined();
    expect(body.messages[0].content).toContain("AH.sutra.1.2");

    const r = res.json;
    expect(r.source).toBe("ai");
    expect(r.match.id).toBe("AH.sutra.1.2");
    expect(r.in_corpus).toBe(true);
    expect(r.iast).toMatch(/dharmārtha/); // canonical corpus text
    expect(r.related_verse_ids).toEqual(["AH.sutra.1.3"]); // unknown id dropped
    expect(r.model).toBe("claude-opus-5-5");
    expect(r.review_status).toBe("ai_draft");
  });

  it("uses the AI path when the strong match has no curated translation", async () => {
    const { client, create } = fakeClient(fakeMessage(JSON.stringify({ ...AI_OUTPUT, matched_verse_id: "AH.sutra.1.3" })));
    const app = makeApp({ client });
    const res = await postJson(app, "/v1/explain", { text: "brahmā smṛtvāyuṣo vedaṃ prajāpatim ajigrahat" });
    expect(res.status).toBe(200);
    expect(create).toHaveBeenCalledTimes(1);
    expect(res.json.match.id).toBe("AH.sutra.1.3");
  });

  it("drops a hallucinated verse id and marks the verse as not in the corpus", async () => {
    const { client } = fakeClient(fakeMessage(JSON.stringify({ ...AI_OUTPUT, matched_verse_id: "AH.sutra.77.7", in_corpus: true })));
    const app = makeApp({ client });
    const res = await postJson(app, "/v1/explain", { text: "some unknown sanskrit verse text here" });
    expect(res.json.match).toBeNull();
    expect(res.json.in_corpus).toBe(false);
  });

  it("retries once when the model output fails schema validation", async () => {
    const { client, create } = fakeClient(fakeMessage('{"english": 42}'), fakeMessage(JSON.stringify(AI_OUTPUT)));
    const app = makeApp({ client });
    const res = await postJson(app, "/v1/explain", { text: "dharmartha sukha sadhanam" });
    expect(res.status).toBe(200);
    expect(create).toHaveBeenCalledTimes(2);
    expect(res.json.english).toBe(AI_OUTPUT.english);
  });

  it("returns ai_bad_output after two invalid outputs", async () => {
    const { client, create } = fakeClient(fakeMessage("not json at all"));
    const app = makeApp({ client });
    const res = await postJson(app, "/v1/explain", { text: "dharmartha sukha sadhanam" });
    expect(res.status).toBe(502);
    expect(res.json.error.code).toBe("ai_bad_output");
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("maps Anthropic overload / rate-limit errors to a friendly 503 with Retry-After", async () => {
    const overloaded = Anthropic.APIError.generate(529, { type: "error", error: { type: "overloaded_error", message: "Overloaded" } }, "Overloaded", new Headers());
    const { client } = fakeClient(overloaded);
    const res = await postJson(makeApp({ client }), "/v1/explain", { text: "dharmartha sukha sadhanam" });
    expect(res.status).toBe(503);
    expect(res.json.error.code).toBe("ai_busy");
    expect(res.headers.get("retry-after")).toBe("30");

    const limited = Anthropic.APIError.generate(429, { type: "error", error: { type: "rate_limit_error", message: "slow down" } }, "slow down", new Headers({ "retry-after": "12" }));
    const r2 = await postJson(makeApp({ client: fakeClient(limited).client }), "/v1/explain", { text: "dharmartha sukha sadhanam" });
    expect(r2.status).toBe(503);
    expect(r2.json.error.code).toBe("ai_busy");
    expect(r2.headers.get("retry-after")).toBe("12");
    expect(r2.json.error.message).not.toMatch(/slow down/); // upstream message is not leaked
  });

  it("maps a refusal stop reason to ai_refused", async () => {
    const { client } = fakeClient({ ...fakeMessage(""), content: [], stop_reason: "refusal" });
    const res = await postJson(makeApp({ client }), "/v1/explain", { text: "dharmartha sukha sadhanam" });
    expect(res.status).toBe(422);
    expect(res.json.error.code).toBe("ai_refused");
  });

  it("does not send fallbacks for models that do not support them", async () => {
    const { client, create } = fakeClient(fakeMessage(JSON.stringify(AI_OUTPUT)));
    const app = makeApp({ client, env: { ANTHROPIC_MODEL: "claude-haiku-5-5" } });
    await postJson(app, "/v1/explain", { text: "dharmartha sukha sadhanam" });
    const body = create.mock.calls[0]![0];
    expect(body.model).toBe("claude-haiku-5-5");
    expect(body.fallbacks).toBeUndefined();
    expect(body.betas).toBeUndefined();
  });
});
