import type { Logger } from "../http/logger.js";
import { SearchIndex } from "../search/index.js";
import { Content, contentSignature, loadContent, type ContentPaths } from "./loader.js";

/**
 * Holds the current content + search index. Translation files are still being
 * written by other agents, so the store can re-load periodically: it only
 * re-parses when the file list / sizes / mtimes changed, and swaps atomically.
 */
export class ContentStore {
  private _content: Content;
  private _index: SearchIndex;
  private signature = "";

  private constructor(
    content: Content,
    private readonly paths: ContentPaths | null,
    private readonly log?: Logger,
  ) {
    this._content = content;
    this._index = new SearchIndex(content);
  }

  static load(paths: ContentPaths, log?: Logger): ContentStore {
    const sig = contentSignature(paths);
    const store = new ContentStore(loadContent(paths, log), paths, log);
    store.signature = sig;
    return store;
  }

  /** For tests: wrap an already-built Content. */
  static fromContent(content: Content): ContentStore {
    return new ContentStore(content, null);
  }

  get content(): Content {
    return this._content;
  }

  get index(): SearchIndex {
    return this._index;
  }

  /** Re-load if anything changed on disk. Returns true when a reload happened. */
  reloadIfChanged(): boolean {
    if (!this.paths) return false;
    const sig = contentSignature(this.paths);
    if (sig === this.signature) return false;
    const started = Date.now();
    const content = loadContent(this.paths, this.log);
    const index = new SearchIndex(content);
    this._content = content;
    this._index = index;
    this.signature = sig;
    this.log?.info("content_reloaded", {
      ms: Date.now() - started,
      verses: content.stats.verses,
      translated_verses: content.stats.translated_verses,
      skipped_files: content.stats.skipped_files.length,
    });
    return true;
  }

  startAutoReload(seconds: number): () => void {
    if (!this.paths || seconds <= 0) return () => {};
    const timer = setInterval(() => {
      try {
        this.reloadIfChanged();
      } catch (err) {
        this.log?.error("content_reload_failed", { error: (err as Error).message });
      }
    }, seconds * 1000);
    timer.unref();
    return () => clearInterval(timer);
  }
}
