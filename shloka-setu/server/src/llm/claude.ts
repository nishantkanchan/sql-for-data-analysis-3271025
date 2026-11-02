import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import type { Config, Effort } from "../config.js";
import { ApiError } from "../http/errors.js";
import type { Logger } from "../http/logger.js";

type BetaCreateParams = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
type BetaMessage = Anthropic.Beta.Messages.BetaMessage;
export type BetaMessageParam = Anthropic.Beta.Messages.BetaMessageParam;

/**
 * The slice of the Anthropic SDK client this server uses. Injected into the app so
 * tests can pass a fake (`{ beta: { messages: { create: vi.fn() } } }`).
 * All calls go through `client.beta.messages` because the server-side refusal
 * fallback (`fallbacks: "default"`) is a beta parameter.
 */
export interface ClaudeClient {
  beta: { messages: { create(body: BetaCreateParams, options?: Anthropic.RequestOptions): PromiseLike<BetaMessage> } };
}

export function createClaudeClient(cfg: Config): ClaudeClient | null {
  if (cfg.mock || !cfg.anthropic.apiKey) return null;
  return new Anthropic({
    apiKey: cfg.anthropic.apiKey,
    timeout: cfg.anthropic.timeoutMs,
    maxRetries: cfg.anthropic.maxRetries, // SDK retries 408/409/429/5xx with backoff
  });
}

/** Models that accept `fallbacks: "default"` (server-side retry when a safety classifier declines). */
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "claude-fable-5", "claude-sonnet-5-5"]);

export interface ClaudeCallArgs {
  route: "ocr" | "explain" | "tutor";
  system: string;
  messages: BetaMessageParam[];
  maxTokens: number;
  effort: Effort;
  /** JSON schema for structured output (output_config.format). Omit for free text. */
  jsonSchema?: Record<string, unknown>;
}

export interface ClaudeCallResult {
  text: string;
  model: string;
  usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number };
}

export class LlmOutputError extends Error {}

export class Claude {
  constructor(
    private readonly client: ClaudeClient,
    private readonly cfg: Config,
    private readonly log: Logger,
  ) {}

  get model(): string {
    return this.cfg.anthropic.model;
  }

  async call(args: ClaudeCallArgs): Promise<ClaudeCallResult> {
    const model = this.cfg.anthropic.model;
    const body: BetaCreateParams = {
      model,
      max_tokens: args.maxTokens,
      // Static system prompt first, marked for caching. Everything volatile goes in `messages`.
      system: [{ type: "text", text: args.system, cache_control: { type: "ephemeral" } }],
      messages: args.messages,
      output_config: {
        effort: args.effort,
        ...(args.jsonSchema ? { format: { type: "json_schema", schema: args.jsonSchema } } : {}),
      },
    };
    if (this.cfg.anthropic.fallbacks && FALLBACK_MODELS.has(model)) {
      body.betas = ["server-side-fallback-2026-07-01"];
      body.fallbacks = "default";
    }

    const started = Date.now();
    let res: BetaMessage;
    try {
      res = await this.client.beta.messages.create(body);
    } catch (err) {
      throw this.mapError(err, args.route);
    }

    const usage = {
      input_tokens: res.usage?.input_tokens ?? 0,
      output_tokens: res.usage?.output_tokens ?? 0,
      cache_read_input_tokens: res.usage?.cache_read_input_tokens ?? 0,
      cache_creation_input_tokens: res.usage?.cache_creation_input_tokens ?? 0,
    };
    this.log.info("llm_call", { route: args.route, model: res.model ?? model, stop_reason: res.stop_reason, ms: Date.now() - started, ...usage });

    if (res.stop_reason === "refusal") {
      throw new ApiError(
        422,
        "ai_refused",
        "The AI could not help with this request. If this is a verse from your textbook, try a clearer photo or type the text.",
      );
    }
    if (res.stop_reason === "max_tokens") {
      throw new LlmOutputError("response truncated at max_tokens");
    }
    const text = res.content
      .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return { text, model: res.model ?? model, usage };
  }

  /**
   * Structured output with validation: ask for JSON matching `jsonSchema` (enforced
   * server-side by output_config.format), validate it again with zod, retry once.
   */
  async json<T>(args: ClaudeCallArgs & { jsonSchema: Record<string, unknown> }, schema: z.ZodType<T>): Promise<{ data: T; model: string }> {
    let lastErr = "";
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await this.call(args);
        const parsed = schema.safeParse(JSON.parse(res.text));
        if (parsed.success) return { data: parsed.data, model: res.model };
        lastErr = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      } catch (err) {
        if (err instanceof ApiError) throw err;
        lastErr = (err as Error).message;
      }
      this.log.warn("llm_output_invalid", { route: args.route, attempt, error: lastErr.slice(0, 500) });
    }
    throw new ApiError(502, "ai_bad_output", "The AI returned an unexpected answer. Please try again.");
  }

  private mapError(err: unknown, route: string): ApiError {
    const retryAfter = (e: InstanceType<typeof Anthropic.APIError>) => e.headers?.get?.("retry-after") ?? undefined;
    // Most specific first. APIConnectionTimeoutError extends APIConnectionError extends APIError.
    if (err instanceof Anthropic.APIConnectionTimeoutError) {
      this.log.warn("llm_timeout", { route });
      return new ApiError(504, "ai_timeout", "The AI took too long to answer. Please try again.");
    }
    if (err instanceof Anthropic.APIConnectionError) {
      this.log.error("llm_connection_error", { route, error: err.message });
      return new ApiError(503, "ai_unavailable", "The AI service is unreachable right now. Search still works; please try again shortly.");
    }
    if (err instanceof Anthropic.RateLimitError) {
      const ra = retryAfter(err);
      this.log.warn("llm_rate_limited", { route, retry_after: ra });
      return new ApiError(503, "ai_busy", "Many students are using Shloka Setu right now. Please try again in a minute.", { reason: "upstream_rate_limited" }, { "Retry-After": ra ?? "30" });
    }
    if (err instanceof Anthropic.APIError && (err.status === 529 || err.type === "overloaded_error")) {
      this.log.warn("llm_overloaded", { route });
      return new ApiError(503, "ai_busy", "The AI is very busy right now. Please try again in a minute.", { reason: "upstream_overloaded" }, { "Retry-After": "30" });
    }
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
      this.log.error("llm_auth_error", { route, status: err.status, error: err.message });
      return new ApiError(503, "ai_unavailable", "The AI service is not configured correctly. Search still works.");
    }
    if (err instanceof Anthropic.BadRequestError || err instanceof Anthropic.NotFoundError || err instanceof Anthropic.UnprocessableEntityError) {
      this.log.error("llm_bad_request", { route, status: err.status, error: err.message });
      return new ApiError(502, "ai_unavailable", "The AI could not process this request. Please try different input.");
    }
    if (err instanceof Anthropic.APIError) {
      this.log.error("llm_api_error", { route, status: err.status, error: err.message });
      return new ApiError(503, "ai_unavailable", "The AI service had a problem. Please try again shortly.");
    }
    this.log.error("llm_unknown_error", { route, error: (err as Error)?.message });
    return new ApiError(500, "internal_error", "Something went wrong. Please try again.");
  }
}
