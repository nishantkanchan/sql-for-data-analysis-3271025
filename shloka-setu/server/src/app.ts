import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";
import type { Config } from "./config.js";
import type { ContentStore } from "./content/store.js";
import { ApiError, errorBody, zodToApiError } from "./http/errors.js";
import { silentLogger, type Logger } from "./http/logger.js";
import { clientIp, rateLimit } from "./http/rateLimit.js";
import { Claude, type ClaudeClient } from "./llm/claude.js";
import type { Deps } from "./services/deps.js";
import { explainText } from "./services/explain.js";
import { scanImage, validateImage } from "./services/scan.js";
import { tutor } from "./services/tutor.js";

export const VERSION = "0.1.0";

const LangSchema = z.enum(["en", "hi", "hinglish"]).optional();
const VERSE_ID = /^[A-Z]{2,4}\.[a-z_]+\.\d+\.\d+[a-z]?$/;

export const SearchQuery = z.object({
  q: z.string().trim().min(1, "q is required").max(1000),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  text: z.enum(["AH", "CS", "SS"]).optional(),
});

export const ExplainBody = z.object({
  text: z.string().trim().min(2, "text is required").max(3000),
  lang: LangSchema,
});

export const ScanBody = z.object({
  imageBase64: z.string().min(16, "imageBase64 is required"),
  mediaType: z.string().min(1, "mediaType is required"),
  lang: LangSchema,
});

export const TutorBody = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(4000) }))
    .min(1)
    .max(40),
  verseId: z.string().regex(VERSE_ID, "verseId must look like AH.sutra.1.6").optional(),
  lang: LangSchema,
});

export interface AppOptions {
  cfg: Config;
  store: ContentStore;
  /** Anthropic client (or a test fake). null/undefined => mock mode. */
  client?: ClaudeClient | null;
  log?: Logger;
}

async function readJson<T>(c: Context, schema: z.ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new ApiError(400, "invalid_json", "Request body must be valid JSON (Content-Type: application/json).");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw zodToApiError(parsed.error, "request body");
  return parsed.data;
}

export function createApp(opts: AppOptions) {
  const { cfg, store } = opts;
  const log = opts.log ?? silentLogger;
  const claude = opts.client && !cfg.mock ? new Claude(opts.client, cfg, log) : null;
  const deps: Deps = { cfg, store, claude, log };
  const mock = claude === null;

  const app = new Hono();

  app.use("*", requestId());

  // Request logging (one JSON line per request).
  app.use("*", async (c, next) => {
    const started = Date.now();
    await next();
    log.info("request", {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      ms: Date.now() - started,
      ip: clientIp(c, cfg.trustProxy),
      request_id: c.get("requestId"),
    });
  });

  app.use(
    "*",
    cors({
      origin: cfg.corsOrigins === "*" ? "*" : cfg.corsOrigins,
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
      exposeHeaders: ["X-Request-Id", "Retry-After"],
      maxAge: 86400,
    }),
  );

  app.onError((err, c) => {
    const rid = c.get("requestId");
    if (err instanceof ApiError) {
      if (err.headers) for (const [k, v] of Object.entries(err.headers)) c.header(k, v);
      return c.json(errorBody(err.code, err.message, rid, err.details), err.status as ContentfulStatusCode);
    }
    if (err instanceof HTTPException) {
      const status = err.status;
      const code = status === 413 ? "payload_too_large" : status === 404 ? "not_found" : "validation_error";
      return c.json(errorBody(code, err.message || "Request error", rid), status as ContentfulStatusCode);
    }
    log.error("unhandled_error", { request_id: rid, error: err.message, stack: err.stack });
    return c.json(errorBody("internal_error", "Something went wrong. Please try again.", rid), 500);
  });

  app.notFound((c) => c.json(errorBody("not_found", `No route for ${c.req.method} ${c.req.path}`, c.get("requestId")), 404));

  const general = rateLimit({ windowMs: cfg.rateLimit.windowMs, max: cfg.rateLimit.max, name: "General", trustProxy: cfg.trustProxy });
  const ai = rateLimit({ windowMs: cfg.rateLimit.windowMs, max: cfg.rateLimit.aiMax, name: "AI", trustProxy: cfg.trustProxy });
  const tooLarge = (max: number) =>
    bodyLimit({
      maxSize: max,
      onError: () => {
        throw new ApiError(413, "payload_too_large", `Request body is too large (limit ${Math.round(max / 1024)} KB).`);
      },
    });
  const jsonLimit = tooLarge(cfg.jsonBodyLimitBytes);
  // base64 inflates by 4/3; allow some slack for the JSON wrapper.
  const scanLimit = tooLarge(Math.ceil((cfg.maxImageBytes * 4) / 3) + 64 * 1024);

  app.use("/v1/*", general);

  // ---------- routes ----------
  app.get("/", (c) =>
    c.json({
      name: "Shloka Setu API",
      version: VERSION,
      mock,
      endpoints: ["GET /health", "GET /v1/search?q=&limit=", "GET /v1/verse/:id", "POST /v1/explain", "POST /v1/scan", "POST /v1/tutor"],
    }),
  );

  app.get("/health", (c) => {
    const s = store.content.stats;
    return c.json({
      status: "ok",
      version: VERSION,
      mock,
      model: mock ? null : cfg.anthropic.model,
      content: {
        verses: s.verses,
        texts: s.texts,
        translated_verses: s.translated_verses,
        chapters_with_translation: s.chapters_with_translation,
        glossary_terms: s.glossary_terms,
        syllabus: s.syllabus,
        skipped_files: s.skipped_files.length,
        loaded_at: s.loaded_at,
      },
      uptime_s: Math.round(process.uptime()),
    });
  });

  app.get("/v1/search", (c) => {
    const parsed = SearchQuery.safeParse(c.req.query());
    if (!parsed.success) throw zodToApiError(parsed.error, "query");
    const { q, limit, text } = parsed.data;
    const hits = store.index.search(q, limit, { textCode: text });
    const results = hits.map((h) => ({ score: h.score, ...store.content.view(h.id)! }));
    return c.json({ query: q, count: results.length, results });
  });

  app.get("/v1/verse/:id", (c) => {
    const id = c.req.param("id");
    if (!VERSE_ID.test(id)) throw new ApiError(400, "validation_error", "Verse id must look like AH.sutra.1.6");
    const view = store.content.view(id);
    if (!view) throw new ApiError(404, "not_found", `Verse ${id} was not found.`);
    return c.json({ ...view, ...store.content.neighbours(id) });
  });

  app.post("/v1/explain", ai, jsonLimit, async (c) => {
    const body = await readJson(c, ExplainBody);
    return c.json(await explainText(deps, body.text, body.lang));
  });

  app.post("/v1/scan", ai, scanLimit, async (c) => {
    const body = await readJson(c, ScanBody);
    const image = validateImage(body.imageBase64, body.mediaType, cfg.maxImageBytes);
    return c.json(await scanImage(deps, image, body.lang));
  });

  app.post("/v1/tutor", ai, jsonLimit, async (c) => {
    const body = await readJson(c, TutorBody);
    return c.json(await tutor(deps, body));
  });

  return app;
}
