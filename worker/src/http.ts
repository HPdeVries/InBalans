import type { ApiError } from '../../src/lib/sync/protocol';

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    public extra: Partial<ApiError> = {},
  ) {
    super(code);
  }
}

const SECURITY_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

export function json(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  const h = new Headers(headers);
  h.set('Content-Type', 'application/json; charset=utf-8');
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) h.set(k, v);
  return new Response(JSON.stringify(body), { status, headers: h });
}

export function errorResponse(e: HttpError): Response {
  return json({ error: e.code, ...e.extra } satisfies ApiError, e.status);
}

export async function readJson<T>(request: Request, maxBytes = 2_000_000): Promise<T> {
  const length = Number(request.headers.get('Content-Length') ?? 0);
  if (length > maxBytes) throw new HttpError(413, 'too_large');
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, 'too_large');
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(400, 'invalid_json');
  }
}

export const SESSION_COOKIE = '__Host-inbalans_session';

export function getCookie(request: Request, name: string): string | null {
  for (const part of (request.headers.get('Cookie') ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

/** maxAgeSeconds null = browser-session cookie (shared devices). */
export function sessionCookie(token: string, maxAgeSeconds: number | null): string {
  const age = maxAgeSeconds === null ? '' : `; Max-Age=${maxAgeSeconds}`;
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax${age}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function clientIp(request: Request): string {
  return request.headers.get('CF-Connecting-IP') ?? 'unknown';
}
