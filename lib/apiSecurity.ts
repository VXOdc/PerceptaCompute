import { NextRequest, NextResponse } from 'next/server';
import type { OperationalContext } from '@/core/types';
import { API_SESSION_COOKIE, BROWSER_FRAME_HEADER } from '@/lib/securityConstants';

const MAX_JSON_BODY_CHARS = 1_600_000;
const MIN_IMAGE_BASE64_CHARS = 64;
const MAX_IMAGE_BASE64_CHARS = 1_500_000;
const BASE64_IMAGE_RE = /^[A-Za-z0-9+/]+={0,2}$/;
const SAFE_ID_RE = /^[a-zA-Z0-9_.:-]{1,80}$/;
const ALLOWED_MODES = new Set(['run', 'walk', 'cycle', 'vehicle', 'industrial']);
const ALLOWED_SENSITIVITY = new Set(['low', 'med', 'high']);

interface RateBucket {
  count: number;
  resetAt: number;
}

interface ApiGuardOptions {
  route: string;
  maxRequests: number;
  windowMs: number;
}

interface ApiGuardSuccess {
  ok: true;
  headers: Headers;
}

interface ApiGuardFailure {
  ok: false;
  response: NextResponse;
}

interface ApiProblem {
  status: number;
  message: string;
}

const buckets = new Map<string, RateBucket>();
let lastSweepAt = 0;

function jsonProblem(message: string, status: number, headers?: HeadersInit): NextResponse {
  return NextResponse.json({ error: message }, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      ...Object.fromEntries(new Headers(headers).entries()),
    },
  });
}

function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded
    || req.headers.get('cf-connecting-ip')
    || req.headers.get('x-real-ip')
    || 'local';
}

function getAllowedOrigins(req: NextRequest): Set<string> {
  const currentOrigin = new URL(req.url).origin;
  const configured = (process.env.PERCEPTA_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
  return new Set([currentOrigin, ...configured]);
}

function requestOrigin(req: NextRequest): string | null {
  const origin = req.headers.get('origin');
  if (origin) return origin;

  const referer = req.headers.get('referer');
  if (!referer) return null;

  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

function isAllowedOrigin(req: NextRequest): boolean {
  const origin = requestOrigin(req);
  return Boolean(origin && getAllowedOrigins(req).has(origin));
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

function hasBearerAccess(req: NextRequest): boolean {
  const expected = process.env.PERCEPTA_API_KEY?.trim();
  if (!expected) return false;

  const header = req.headers.get('authorization') ?? '';
  const token = header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? '';
  return token.length > 0 && constantTimeEqual(token, expected);
}

function hasBrowserSession(req: NextRequest): boolean {
  const session = req.cookies.get(API_SESSION_COOKIE)?.value;
  const client = req.headers.get('x-percepta-client');
  return Boolean(session && client === BROWSER_FRAME_HEADER && isAllowedOrigin(req));
}

function rateLimit(req: NextRequest, options: ApiGuardOptions): { allowed: boolean; headers: Headers } {
  const now = Date.now();
  if (now - lastSweepAt > options.windowMs) {
    lastSweepAt = now;
    for (const [key, bucket] of buckets.entries()) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }

  const key = `${options.route}:${clientIp(req)}`;
  const current = buckets.get(key);
  const bucket = current && current.resetAt > now
    ? current
    : { count: 0, resetAt: now + options.windowMs };

  bucket.count += 1;
  buckets.set(key, bucket);

  const remaining = Math.max(0, options.maxRequests - bucket.count);
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'X-RateLimit-Limit': String(options.maxRequests),
    'X-RateLimit-Remaining': String(remaining),
    'X-RateLimit-Reset': String(Math.ceil(bucket.resetAt / 1000)),
  });

  if (bucket.count > options.maxRequests) {
    headers.set('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
    return { allowed: false, headers };
  }

  return { allowed: true, headers };
}

export function guardApiRequest(req: NextRequest, options: ApiGuardOptions): ApiGuardSuccess | ApiGuardFailure {
  const contentType = req.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return { ok: false, response: jsonProblem('Content-Type must be application/json', 415) };
  }

  if (!hasBearerAccess(req) && !hasBrowserSession(req)) {
    return { ok: false, response: jsonProblem('Unauthorized API request', 401) };
  }

  const limited = rateLimit(req, options);
  if (!limited.allowed) {
    return { ok: false, response: jsonProblem('Too many frame requests', 429, limited.headers) };
  }

  return { ok: true, headers: limited.headers };
}

export async function readJsonObject(req: NextRequest): Promise<Record<string, unknown>> {
  const length = Number(req.headers.get('content-length') ?? 0);
  if (Number.isFinite(length) && length > MAX_JSON_BODY_CHARS) {
    throw { status: 413, message: 'Frame payload is too large' } satisfies ApiProblem;
  }

  let text = '';
  try {
    text = await req.text();
  } catch {
    throw { status: 400, message: 'Unable to read request body' } satisfies ApiProblem;
  }

  if (text.length > MAX_JSON_BODY_CHARS) {
    throw { status: 413, message: 'Frame payload is too large' } satisfies ApiProblem;
  }

  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Body must be a JSON object');
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw { status: 400, message: 'Body must be valid JSON' } satisfies ApiProblem;
  }
}

export function apiProblemResponse(err: unknown, fallbackHeaders?: Headers): NextResponse {
  const problem = err as Partial<ApiProblem>;
  const status = typeof problem.status === 'number' ? problem.status : 500;
  const message = typeof problem.message === 'string' ? problem.message : 'Request failed';
  return jsonProblem(message, status, fallbackHeaders);
}

export function normalizeBase64Image(input: unknown): string {
  if (typeof input !== 'string') {
    throw { status: 400, message: 'image must be a base64 JPEG string' } satisfies ApiProblem;
  }

  const withoutPrefix = input.replace(/^data:image\/(?:jpeg|jpg|png|webp);base64,/i, '');
  if (
    withoutPrefix.length < MIN_IMAGE_BASE64_CHARS
    || withoutPrefix.length > MAX_IMAGE_BASE64_CHARS
    || !BASE64_IMAGE_RE.test(withoutPrefix)
  ) {
    throw { status: 400, message: 'image payload is invalid or too large' } satisfies ApiProblem;
  }

  return withoutPrefix;
}

function safeId(input: unknown, fallback: string): string {
  if (typeof input !== 'string') return fallback;
  const value = input.trim();
  return SAFE_ID_RE.test(value) ? value : fallback;
}

export function contextFromBody(body: Record<string, unknown>): OperationalContext {
  const mode = typeof body.mode === 'string' && ALLOWED_MODES.has(body.mode)
    ? body.mode as OperationalContext['mode']
    : 'walk';

  const operatorId = typeof body.operatorId === 'string' && SAFE_ID_RE.test(body.operatorId.trim())
    ? body.operatorId.trim()
    : undefined;

  return {
    siteId: safeId(body.siteId, process.env.PERCEPTA_SITE_ID ?? 'local-site'),
    zoneId: safeId(body.zoneId, process.env.PERCEPTA_ZONE_ID ?? 'default-zone'),
    cameraId: safeId(body.cameraId, 'browser-camera'),
    operatorId,
    mode,
  };
}

export function sanitizeSensitivity(input: unknown): string {
  return typeof input === 'string' && ALLOWED_SENSITIVITY.has(input) ? input : 'med';
}

export function numberInRange(input: unknown, min: number, max: number): number | undefined {
  return typeof input === 'number' && Number.isFinite(input) && input >= min && input <= max
    ? input
    : undefined;
}
