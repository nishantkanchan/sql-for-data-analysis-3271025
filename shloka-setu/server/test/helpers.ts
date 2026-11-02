import path from "node:path";
import { fileURLToPath } from "node:url";
import { vi } from "vitest";
import { createApp } from "../src/app.js";
import { loadConfig, type Config } from "../src/config.js";
import { contentPaths } from "../src/content/loader.js";
import { ContentStore } from "../src/content/store.js";
import type { ClaudeClient } from "../src/llm/claude.js";

const here = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURES = path.join(here, "fixtures");
export const REAL_CONTENT_DIR = path.resolve(here, "../../content/data");

/** Real corpus + fixture translations/glossary (the real translation set changes while other agents write it). */
export const testPaths = contentPaths(REAL_CONTENT_DIR, {
  translationsDir: path.join(FIXTURES, "translations"),
  glossaryPath: path.join(FIXTURES, "glossary.json"),
  syllabusPath: path.join(FIXTURES, "does-not-exist.json"),
});

let cached: ContentStore | null = null;
export function testStore(): ContentStore {
  if (!cached) cached = ContentStore.load(testPaths);
  return cached;
}

export function testConfig(env: Record<string, string> = {}): Config {
  return loadConfig({ CONTENT_DIR: REAL_CONTENT_DIR, CONTENT_RELOAD_SECONDS: "0", LOG_LEVEL: "silent", ...env } as NodeJS.ProcessEnv);
}

/** A fake Anthropic message as returned by client.beta.messages.create. */
export function fakeMessage(text: string, stop_reason = "end_turn") {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    content: [{ type: "text", text, citations: null }],
    stop_reason,
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  };
}

/** Fake client whose create() returns the given responses in order (functions are called with the request body). */
export function fakeClient(...responses: Array<unknown | ((body: any) => unknown)>) {
  const queue = [...responses];
  const create = vi.fn(async (body: any) => {
    const next = queue.length > 1 ? queue.shift() : queue[0];
    const value = typeof next === "function" ? (next as (b: any) => unknown)(body) : next;
    if (value instanceof Error) throw value;
    return value;
  });
  const client = { beta: { messages: { create } } } as unknown as ClaudeClient;
  return { client, create };
}

export function makeApp(opts: { env?: Record<string, string>; client?: ClaudeClient | null } = {}) {
  const env = { ...(opts.client ? { ANTHROPIC_API_KEY: "sk-test" } : {}), ...opts.env };
  return createApp({ cfg: testConfig(env), store: testStore(), client: opts.client ?? null });
}

export async function postJson(app: ReturnType<typeof makeApp>, url: string, body: unknown, headers: Record<string, string> = {}) {
  const res = await app.request(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  return { status: res.status, headers: res.headers, json: (await res.json()) as any };
}

// Smallest valid images (magic bytes are what the server checks).
export const PNG_1PX =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
export const JPEG_HEADER_B64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01]).toString("base64");
