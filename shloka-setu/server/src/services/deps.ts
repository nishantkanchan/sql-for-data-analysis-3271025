import type { Config } from "../config.js";
import type { ContentStore } from "../content/store.js";
import type { Logger } from "../http/logger.js";
import type { Claude } from "../llm/claude.js";

export interface Deps {
  cfg: Config;
  store: ContentStore;
  /** null in mock mode (no ANTHROPIC_API_KEY): AI routes return flagged demo output. */
  claude: Claude | null;
  log: Logger;
}
