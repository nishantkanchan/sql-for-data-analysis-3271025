import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const here = path.dirname(fileURLToPath(import.meta.url));
// src/ (dev, tsx) and dist/ (prod) both sit one level below server/, and
// content/ sits next to server/, so ../../content/data works for both.
const DEFAULT_CONTENT_DIR = path.resolve(here, "../../content/data");

const effort = z.enum(["low", "medium", "high", "xhigh", "max"]);
const bool = z
  .string()
  .optional()
  .transform((v) => (v === undefined || v === "" ? undefined : ["1", "true", "yes", "on"].includes(v.toLowerCase())));
const int = (def: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? def : Number.parseInt(v, 10)))
    .pipe(z.number().int().nonnegative());
const num = (def: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? def : Number.parseFloat(v)))
    .pipe(z.number().nonnegative());

const EnvSchema = z.object({
  PORT: int(8787),
  HOST: z.string().optional().default("0.0.0.0"),
  NODE_ENV: z.string().optional().default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error", "silent"]).optional().default("info"),

  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().optional().default("claude-opus-5-5"),
  ANTHROPIC_EFFORT_OCR: effort.optional().default("low"),
  ANTHROPIC_EFFORT_EXPLAIN: effort.optional().default("medium"),
  ANTHROPIC_EFFORT_TUTOR: effort.optional().default("low"),
  ANTHROPIC_TIMEOUT_MS: int(90_000),
  ANTHROPIC_MAX_RETRIES: int(2),
  ANTHROPIC_FALLBACKS: bool,
  MOCK_MODE: bool,

  CONTENT_DIR: z.string().optional().default(DEFAULT_CONTENT_DIR),
  CONTENT_RELOAD_SECONDS: int(60),

  CORS_ORIGINS: z.string().optional().default("*"),
  TRUST_PROXY: bool,
  RATE_LIMIT_WINDOW_MS: int(60_000),
  RATE_LIMIT_MAX: int(120),
  RATE_LIMIT_AI_MAX: int(12),
  JSON_BODY_LIMIT_BYTES: int(256 * 1024),
  MAX_IMAGE_BYTES: int(5 * 1024 * 1024),

  MATCH_STRONG_THRESHOLD: num(0.65),
  TUTOR_MAX_HISTORY: int(12),
});

export type Effort = z.infer<typeof effort>;

export interface Config {
  port: number;
  host: string;
  env: string;
  logLevel: "debug" | "info" | "warn" | "error" | "silent";
  anthropic: {
    apiKey: string | undefined;
    model: string;
    effort: { ocr: Effort; explain: Effort; tutor: Effort };
    timeoutMs: number;
    maxRetries: number;
    /** Server-side refusal fallbacks (`fallbacks: "default"`), only sent for models that support it. */
    fallbacks: boolean;
  };
  /** True when no API key is configured (or MOCK_MODE=true): AI routes return flagged demo output. */
  mock: boolean;
  contentDir: string;
  contentReloadSeconds: number;
  corsOrigins: string[] | "*";
  trustProxy: boolean;
  rateLimit: { windowMs: number; max: number; aiMax: number };
  jsonBodyLimitBytes: number;
  maxImageBytes: number;
  matchStrongThreshold: number;
  tutorMaxHistory: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${msg}`);
  }
  const e = parsed.data;
  const apiKey = e.ANTHROPIC_API_KEY?.trim() || undefined;
  const origins = e.CORS_ORIGINS.trim();
  return {
    port: e.PORT,
    host: e.HOST,
    env: e.NODE_ENV,
    logLevel: e.LOG_LEVEL,
    anthropic: {
      apiKey,
      model: e.ANTHROPIC_MODEL.trim(),
      effort: { ocr: e.ANTHROPIC_EFFORT_OCR, explain: e.ANTHROPIC_EFFORT_EXPLAIN, tutor: e.ANTHROPIC_EFFORT_TUTOR },
      timeoutMs: e.ANTHROPIC_TIMEOUT_MS,
      maxRetries: e.ANTHROPIC_MAX_RETRIES,
      fallbacks: e.ANTHROPIC_FALLBACKS ?? true,
    },
    mock: e.MOCK_MODE === true || !apiKey,
    contentDir: path.resolve(e.CONTENT_DIR),
    contentReloadSeconds: e.CONTENT_RELOAD_SECONDS,
    corsOrigins: origins === "*" ? "*" : origins.split(",").map((s) => s.trim()).filter(Boolean),
    trustProxy: e.TRUST_PROXY ?? false,
    rateLimit: { windowMs: e.RATE_LIMIT_WINDOW_MS, max: e.RATE_LIMIT_MAX, aiMax: e.RATE_LIMIT_AI_MAX },
    jsonBodyLimitBytes: e.JSON_BODY_LIMIT_BYTES,
    maxImageBytes: e.MAX_IMAGE_BYTES,
    matchStrongThreshold: e.MATCH_STRONG_THRESHOLD,
    tutorMaxHistory: Math.max(2, e.TUTOR_MAX_HISTORY),
  };
}
