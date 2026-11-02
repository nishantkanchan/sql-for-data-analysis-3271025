import { serve } from "@hono/node-server";
import { createApp, VERSION } from "./app.js";
import { loadConfig } from "./config.js";
import { contentPaths } from "./content/loader.js";
import { ContentStore } from "./content/store.js";
import { createLogger } from "./http/logger.js";
import { createClaudeClient } from "./llm/claude.js";

const cfg = loadConfig();
const log = createLogger(cfg.logLevel);

const started = Date.now();
const store = ContentStore.load(contentPaths(cfg.contentDir), log);
const stats = store.content.stats;
log.info("content_loaded", {
  dir: cfg.contentDir,
  ms: Date.now() - started,
  verses: stats.verses,
  texts: stats.texts,
  translated_verses: stats.translated_verses,
  glossary_terms: stats.glossary_terms,
  skipped_files: stats.skipped_files,
});
if (stats.verses === 0) log.warn("no_corpus_loaded", { dir: cfg.contentDir, hint: "set CONTENT_DIR to the content/data folder" });
const stopReload = store.startAutoReload(cfg.contentReloadSeconds);

const client = createClaudeClient(cfg);
const app = createApp({ cfg, store, client, log });

const server = serve({ fetch: app.fetch, port: cfg.port, hostname: cfg.host }, (info) => {
  log.info("server_started", {
    version: VERSION,
    url: `http://${info.address}:${info.port}`,
    mock: cfg.mock,
    model: cfg.mock ? null : cfg.anthropic.model,
  });
  if (cfg.mock) log.warn("mock_mode", { reason: "ANTHROPIC_API_KEY not set (or MOCK_MODE=true): /v1/scan and /v1/tutor return demo output" });
});

function shutdown(signal: string) {
  log.info("shutdown", { signal });
  stopReload();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
