import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { makeApp, postJson, testStore } from "./helpers.js";

describe("validation errors", () => {
  const app = makeApp();

  it("returns structured JSON errors with a request id", async () => {
    const res = await postJson(app, "/v1/explain", { text: "" });
    expect(res.status).toBe(400);
    expect(res.json.error.code).toBe("validation_error");
    expect(res.json.error.message).toMatch(/text/);
    expect(Array.isArray(res.json.error.details)).toBe(true);
    expect(typeof res.json.request_id).toBe("string");
    expect(res.headers.get("x-request-id")).toBe(res.json.request_id);
  });

  it("rejects malformed JSON", async () => {
    const res = await postJson(app, "/v1/explain", "{not json");
    expect(res.status).toBe(400);
    expect(res.json.error.code).toBe("invalid_json");
  });

  it("rejects bad enums and bad tutor payloads", async () => {
    expect((await postJson(app, "/v1/explain", { text: "vata", lang: "fr" })).status).toBe(400);
    expect((await postJson(app, "/v1/tutor", { messages: [] })).status).toBe(400);
    expect((await postJson(app, "/v1/tutor", { messages: [{ role: "system", content: "x" }] })).status).toBe(400);
    expect((await postJson(app, "/v1/tutor", { messages: [{ role: "user", content: "x".repeat(5000) }] })).status).toBe(400);
    expect((await postJson(app, "/v1/scan", { mediaType: "image/png" })).status).toBe(400);
  });

  it("enforces the JSON body size limit", async () => {
    const small = makeApp({ env: { JSON_BODY_LIMIT_BYTES: "200" } });
    const res = await postJson(small, "/v1/explain", { text: "a".repeat(500) });
    expect(res.status).toBe(413);
    expect(res.json.error.code).toBe("payload_too_large");
  });

  it("returns JSON 404 for unknown routes", async () => {
    const res = await app.request("/v2/nothing");
    expect(res.status).toBe(404);
    expect(((await res.json()) as any).error.code).toBe("not_found");
  });
});

describe("rate limiting", () => {
  it("limits AI endpoints per IP and returns 429 with Retry-After", async () => {
    const app = makeApp({ env: { RATE_LIMIT_AI_MAX: "2", TRUST_PROXY: "true" } });
    const ip = { "x-forwarded-for": "203.0.113.7" };
    const text = { text: "vayuh pittam kaphashceti trayo doshah samasatah" };
    expect((await postJson(app, "/v1/explain", text, ip)).status).toBe(200);
    const second = await postJson(app, "/v1/explain", text, ip);
    expect(second.status).toBe(200);
    expect(second.headers.get("x-ratelimit-ai-remaining")).toBe("0");
    const third = await postJson(app, "/v1/explain", text, ip);
    expect(third.status).toBe(429);
    expect(third.json.error.code).toBe("rate_limited");
    expect(Number(third.headers.get("retry-after"))).toBeGreaterThan(0);
    // another IP is unaffected; cheap endpoints use the separate general bucket
    expect((await postJson(app, "/v1/explain", text, { "x-forwarded-for": "198.51.100.1" })).status).toBe(200);
    expect((await app.request("/v1/search?q=vata", { headers: ip })).status).toBe(200);
  });

  it("limits all /v1 endpoints with the general bucket", async () => {
    const app = makeApp({ env: { RATE_LIMIT_MAX: "3", TRUST_PROXY: "true" } });
    const h = { headers: { "x-forwarded-for": "192.0.2.9" } };
    for (let i = 0; i < 3; i++) expect((await app.request("/v1/verse/AH.sutra.1.6", h)).status).toBe(200);
    expect((await app.request("/v1/verse/AH.sutra.1.6", h)).status).toBe(429);
    expect((await app.request("/health", h)).status).toBe(200); // health is not limited
  });
});

describe("CORS", () => {
  it("allows configured origins", async () => {
    const app = makeApp({ env: { CORS_ORIGINS: "https://app.example.com" } });
    const ok = await app.request("/health", { headers: { origin: "https://app.example.com" } });
    expect(ok.headers.get("access-control-allow-origin")).toBe("https://app.example.com");
    const preflight = await app.request("/v1/explain", {
      method: "OPTIONS",
      headers: { origin: "https://app.example.com", "access-control-request-method": "POST" },
    });
    expect(preflight.status).toBe(204);
    const other = await app.request("/health", { headers: { origin: "https://evil.example" } });
    expect(other.headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("config and content loading", () => {
  it("is in mock mode without a key and live with one", () => {
    expect(loadConfig({}).mock).toBe(true);
    const live = loadConfig({ ANTHROPIC_API_KEY: "sk-x", ANTHROPIC_MODEL: "claude-sonnet-5-5" });
    expect(live.mock).toBe(false);
    expect(live.anthropic.model).toBe("claude-sonnet-5-5");
    expect(loadConfig({ ANTHROPIC_API_KEY: "sk-x", MOCK_MODE: "true" }).mock).toBe(true);
    expect(() => loadConfig({ ANTHROPIC_EFFORT_EXPLAIN: "huge" })).toThrow(/Invalid environment/);
  });

  it("skips partial / mid-write translation files and bad records gracefully", () => {
    const c = testStore().content;
    // 1.json: 1.6 (full), 1.8 (english only) kept; empty 1.7, unknown id, garbage string skipped
    expect(c.translations.has("AH.sutra.1.6")).toBe(true);
    expect(c.translations.has("AH.sutra.1.8")).toBe(true);
    expect(c.translations.has("AH.sutra.1.7")).toBe(false);
    expect(c.translations.get("AH.sutra.1.8")!.word_meanings).toEqual([]);
    expect(c.translations.get("AH.sutra.1.8")!.modern_correlation).toBeNull();
    const skipped = c.stats.skipped_files.map((s) => s.file);
    expect(skipped.some((f) => f.endsWith("sutra/2.json"))).toBe(true); // truncated JSON
    expect(skipped.some((f) => f.endsWith("nidana/1.json"))).toBe(true); // empty file
    expect(c.glossary).toHaveLength(1);
    expect(c.byId.size).toBe(c.stats.verses);
  });
});
