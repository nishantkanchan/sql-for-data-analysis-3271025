import type { Context, MiddlewareHandler } from "hono";
import { getConnInfo } from "@hono/node-server/conninfo";
import { ApiError } from "./errors.js";

/**
 * Simple fixed-window, in-memory, per-IP rate limiter. Good enough for a single
 * instance; for several instances put a shared limiter (Redis, Cloud Armor, ...) in front.
 */
export interface RateLimitOptions {
  windowMs: number;
  max: number;
  name: string;
  trustProxy: boolean;
}

export function clientIp(c: Context, trustProxy: boolean): string {
  if (trustProxy) {
    const xff = c.req.header("x-forwarded-for");
    if (xff) return xff.split(",")[0]!.trim();
    const real = c.req.header("x-real-ip");
    if (real) return real.trim();
  }
  try {
    return getConnInfo(c).remote.address ?? "unknown";
  } catch {
    return "unknown"; // e.g. app.request() in tests: no socket
  }
}

export function rateLimit(opts: RateLimitOptions): MiddlewareHandler {
  const hits = new Map<string, { count: number; resetAt: number }>();
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  }, Math.max(opts.windowMs, 10_000));
  sweep.unref();

  return async (c, next) => {
    if (opts.max <= 0) return next(); // 0 disables
    const key = clientIp(c, opts.trustProxy);
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + opts.windowMs };
      hits.set(key, entry);
    }
    entry.count++;
    const remaining = Math.max(0, opts.max - entry.count);
    const resetSec = Math.ceil((entry.resetAt - now) / 1000);
    c.header(`X-RateLimit-${opts.name}-Limit`, String(opts.max));
    c.header(`X-RateLimit-${opts.name}-Remaining`, String(remaining));
    if (entry.count > opts.max) {
      throw new ApiError(
        429,
        "rate_limited",
        "Too many requests. Please wait a moment and try again.",
        { limit: opts.max, window_seconds: Math.round(opts.windowMs / 1000), retry_after_seconds: resetSec, bucket: opts.name.toLowerCase() },
        { "Retry-After": String(resetSec) },
      );
    }
    return next();
  };
}
