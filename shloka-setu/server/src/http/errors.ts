import type { ZodError } from "zod";

/**
 * Every non-2xx response has the same body:
 *   { "error": { "code": "validation_error", "message": "...", "details": [...] }, "request_id": "..." }
 * `code` is stable and machine-readable; `message` is friendly and safe to show to students.
 */
export type ErrorCode =
  | "validation_error"
  | "invalid_json"
  | "not_found"
  | "payload_too_large"
  | "unsupported_media_type"
  | "rate_limited"
  | "no_text_found"
  | "ai_refused"
  | "ai_busy"
  | "ai_timeout"
  | "ai_unavailable"
  | "ai_bad_output"
  | "internal_error";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
    readonly headers?: Record<string, string>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function zodToApiError(err: ZodError, what = "request"): ApiError {
  const details = err.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
  const first = details[0];
  const msg = first ? `Invalid ${what}: ${first.path ? `${first.path}: ` : ""}${first.message}` : `Invalid ${what}`;
  return new ApiError(400, "validation_error", msg, details);
}

export function errorBody(code: ErrorCode, message: string, requestId: string | undefined, details?: unknown) {
  return {
    error: { code, message, ...(details !== undefined ? { details } : {}) },
    request_id: requestId ?? null,
  };
}
