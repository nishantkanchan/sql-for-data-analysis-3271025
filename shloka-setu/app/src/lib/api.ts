/** Client for the Shloka Setu API (server/). See docs/CONTENT_SCHEMA.md section 6. */
import type { ScanResult, TutorMessage, TutorResponse } from '../types/content';

export class ApiError extends Error {
  constructor(
    message: string,
    public offline: boolean,
    public status?: number,
  ) {
    super(message);
  }
}

function join(base: string, path: string): string {
  return base.replace(/\/+$/, '') + path;
}

async function request<T>(base: string, path: string, init: RequestInit, timeoutMs: number): Promise<T> {
  if (!base) throw new ApiError('No API address configured', true);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(join(base, path), { ...init, signal: ctrl.signal });
  } catch (e) {
    throw new ApiError(e instanceof Error ? e.message : 'Network error', true);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      msg = body?.error?.message ?? body?.error ?? body?.message ?? msg;
    } catch {
      // ignore
    }
    throw new ApiError(String(msg), false, res.status);
  }
  return (await res.json()) as T;
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  body: JSON.stringify(body),
});

/** The server accepts en | hi | hinglish and always returns both English and Hindi fields. */
const apiLang = (lang: 'en' | 'hi' | 'both') => (lang === 'hi' ? 'hi' : 'en');

export function scanImage(base: string, imageBase64: string, mediaType: string, lang: 'en' | 'hi' | 'both') {
  return request<ScanResult>(base, '/v1/scan', json({ imageBase64, mediaType, lang: apiLang(lang) }), 60_000);
}

export function explainText(base: string, text: string, lang: 'en' | 'hi' | 'both') {
  return request<ScanResult>(base, '/v1/explain', json({ text, lang: apiLang(lang) }), 45_000);
}

export function askTutor(base: string, messages: TutorMessage[], verseId?: string) {
  return request<TutorResponse>(base, '/v1/tutor', json({ messages, verseId }), 60_000);
}

/** Quick reachability check: any HTTP answer from the server counts as reachable. */
export async function ping(base: string): Promise<boolean> {
  try {
    await request<unknown>(base, '/health', { method: 'GET' }, 6_000);
    return true;
  } catch (e) {
    return e instanceof ApiError && !e.offline;
  }
}
