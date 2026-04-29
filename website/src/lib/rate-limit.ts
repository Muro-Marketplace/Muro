// Rate limiter.
//
// Priority order:
//   1. If UPSTASH_REDIS_REST_URL + _TOKEN are set → use @upstash/ratelimit
//      with a sliding-window algorithm backed by Redis. Durable across
//      serverless instances. The only correct answer in production.
//   2. Otherwise fall back to an in-memory Map keyed on (ip, url). Works
//      for local dev + lets us write tests. Logs a warning once in prod.
//
// Old callers use `checkRateLimit(req, limit, windowMs)`, kept as a
// compatibility shim. New code should use `withRateLimit()` with an
// explicit rule name.

import { NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// ── Upstash wiring (lazy) ──────────────────────────────────────────────
let _redis: Redis | null = null;
let _warned = false;

function redis(): Redis | null {
  if (_redis) return _redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    if (!_warned && process.env.NODE_ENV === "production") {
      console.warn(
        "[rate-limit] UPSTASH_REDIS_REST_URL/_TOKEN not set, falling back to in-memory limiter. " +
          "Each serverless instance has its own store, so this provides NO protection in production.",
      );
      _warned = true;
    }
    return null;
  }
  _redis = new Redis({ url, token });
  return _redis;
}

const _upstashCache = new Map<string, Ratelimit>();
function upstashFor(name: string, limit: number, windowSeconds: number): Ratelimit | null {
  const client = redis();
  if (!client) return null;
  const key = `${name}:${limit}/${windowSeconds}s`;
  const cached = _upstashCache.get(key);
  if (cached) return cached;
  const rl = new Ratelimit({
    redis: client,
    limiter: Ratelimit.slidingWindow(limit, `${windowSeconds} s`),
    prefix: `wp:rl:${name}`,
    analytics: false,
  });
  _upstashCache.set(key, rl);
  return rl;
}

// ── In-memory fallback ─────────────────────────────────────────────────
interface MemEntry { count: number; resetAt: number }
const memStore = new Map<string, MemEntry>();
const MEM_MAX = 10_000;
let lastCleanup = Date.now();

function memCleanup(now: number) {
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;
  for (const [k, v] of memStore) if (v.resetAt < now) memStore.delete(k);
  if (memStore.size > MEM_MAX) {
    const sorted = [...memStore.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt);
    for (const [k] of sorted.slice(0, memStore.size - MEM_MAX)) memStore.delete(k);
  }
}

function memCheck(key: string, limit: number, windowMs: number, now: number): { success: boolean; remaining: number; resetAt: number } {
  memCleanup(now);
  const entry = memStore.get(key);
  if (!entry || entry.resetAt < now) {
    memStore.set(key, { count: 1, resetAt: now + windowMs });
    return { success: true, remaining: limit - 1, resetAt: now + windowMs };
  }
  entry.count++;
  if (entry.count > limit) return { success: false, remaining: 0, resetAt: entry.resetAt };
  return { success: true, remaining: limit - entry.count, resetAt: entry.resetAt };
}

// ── Public ─────────────────────────────────────────────────────────────

export function getIP(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const real = request.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}

function tooManyResponse(retryAfter: number): NextResponse {
  return NextResponse.json(
    { error: "Too many requests. Please try again later." },
    { status: 429, headers: { "Retry-After": String(Math.max(1, retryAfter)) } },
  );
}

/**
 * Legacy shim. Existing callers use this, keep the signature stable.
 * New code should use `withRateLimit()` instead.
 */
export async function checkRateLimit(
  request: Request,
  limit: number,
  windowMs = 60_000,
): Promise<NextResponse | null> {
  const ip = getIP(request);
  const key = `legacy:${ip}:${new URL(request.url).pathname}`;
  const windowSeconds = Math.max(1, Math.round(windowMs / 1000));

  const rl = upstashFor("legacy", limit, windowSeconds);
  if (rl) {
    const res = await rl.limit(key);
    if (!res.success) {
      return tooManyResponse(Math.ceil((res.reset - Date.now()) / 1000));
    }
    return null;
  }
  const mem = memCheck(key, limit, windowMs, Date.now());
  if (!mem.success) {
    return tooManyResponse(Math.ceil((mem.resetAt - Date.now()) / 1000));
  }
  return null;
}

/**
 * New helper. Named rules, explicit key, explicit window.
 *
 *   const blocked = await withRateLimit(request, {
 *     name: "login",
 *     limit: 5,
 *     windowSeconds: 900, // 15 min
 *     key: `${ip}:${email}`,
 *   });
 *   if (blocked) return blocked;
 */
export async function withRateLimit(
  request: Request,
  rule: { name: string; limit: number; windowSeconds: number; key?: string },
): Promise<NextResponse | null> {
  const key = rule.key || getIP(request);
  const rl = upstashFor(rule.name, rule.limit, rule.windowSeconds);
  if (rl) {
    const res = await rl.limit(key);
    if (!res.success) {
      return tooManyResponse(Math.ceil((res.reset - Date.now()) / 1000));
    }
    return null;
  }
  const mem = memCheck(
    `${rule.name}:${key}`,
    rule.limit,
    rule.windowSeconds * 1000,
    Date.now(),
  );
  if (!mem.success) {
    return tooManyResponse(Math.ceil((mem.resetAt - Date.now()) / 1000));
  }
  return null;
}

/** Test-only: reset the in-memory store between test runs. */
export function _resetInMemoryStore() {
  memStore.clear();
}
