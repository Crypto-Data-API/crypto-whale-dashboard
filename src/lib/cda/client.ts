"use client";

import { STATIC_SAMPLE, withBasePath } from "@/lib/deploy";
import { useRateLimit } from "@/stores/rate-limit";
import { useSettings } from "@/stores/settings";
import { asObj, num, parseTier, pickStr } from "./parse";
import { sampleFetch } from "./sample-browser";
import type { Tier } from "./types";

/** Typed API error. `requiredTier` is set for 402/403 tier gates. */
export class CdaError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requiredTier: Tier | null;
  /** seconds */
  readonly retryAfter: number | null;

  constructor(init: { status: number; code: string; message: string; requiredTier?: Tier | null; retryAfter?: number | null }) {
    super(init.message);
    this.name = "CdaError";
    this.status = init.status;
    this.code = init.code;
    this.requiredTier = init.requiredTier ?? null;
    this.retryAfter = init.retryAfter ?? null;
  }

  /** The key is fine but the plan does not include this endpoint. */
  get isTierGate(): boolean {
    return this.status === 402 || (this.status === 403 && this.code !== "cloudflare_block");
  }

  get isAuth(): boolean {
    return this.status === 401;
  }

  get isWarming(): boolean {
    return this.status === 503;
  }

  get isRateLimited(): boolean {
    return this.status === 429;
  }
}

export function isCdaError(e: unknown): e is CdaError {
  return e instanceof CdaError;
}

/** Parse `Retry-After` (seconds or HTTP date) into seconds. */
export function parseRetryAfter(value: string | null, now: number): number | null {
  if (!value) return null;
  const n = Number(value);
  if (Number.isFinite(n)) return Math.max(0, n);
  const t = Date.parse(value);
  return Number.isFinite(t) ? Math.max(0, Math.round((t - now) / 1000)) : null;
}

/**
 * Build a CdaError from an error response body. Handles:
 *  - `{ detail: { error, message, required_tier? } }` (documented format)
 *  - `{ detail: "string" }` and FastAPI 422 `{ detail: [{ msg }] }`
 *  - x402 `402 { error: "payment_required", grants_tier, message }`
 */
export function errorFromBody(status: number, body: unknown, retryAfter: number | null): CdaError {
  const o = asObj(body);
  const detail = o.detail;
  let code = `http_${status}`;
  let message = "";
  let requiredTier: Tier | null = null;

  if (typeof detail === "string") {
    message = detail;
  } else if (Array.isArray(detail)) {
    code = "validation_error";
    message = detail
      .map((d) => pickStr(asObj(d), "msg", "message"))
      .filter(Boolean)
      .join("; ");
  } else if (detail && typeof detail === "object") {
    const d = asObj(detail);
    code = pickStr(d, "error", "code") ?? code;
    message = pickStr(d, "message", "msg") ?? "";
    requiredTier = parseTier(d.required_tier ?? d.tier_required ?? d.min_tier ?? d.requires);
  }
  if (!message) message = pickStr(o, "message", "error") ?? "";
  if (code.startsWith("http_")) code = pickStr(o, "error", "code") ?? code;

  if (status === 402) {
    requiredTier = requiredTier ?? parseTier(o.grants_tier) ?? "pro";
    message = message.startsWith("Payment required") || !message ? "This endpoint needs a paid CryptoDataApi key." : message;
  } else if (status === 403) {
    requiredTier = requiredTier ?? (/plus/i.test(message) ? "pro_plus" : "pro");
    if (!message) message = "Your plan does not include this endpoint.";
  } else if (status === 401) {
    message = message || "Invalid or missing API key.";
  } else if (status === 429) {
    message = message || "Rate limit reached.";
  } else if (status === 503) {
    message = message || "The API is warming up this dataset.";
  }
  if (!message) message = `Request failed (HTTP ${status}).`;
  const ra = retryAfter ?? num(asObj(detail).retry_after) ?? num(o.retry_after);
  return new CdaError({ status, code, message, requiredTier, retryAfter: ra });
}

export type QueryValue = string | number | boolean | null | undefined;

export interface CdaFetchOptions {
  params?: Record<string, QueryValue>;
  signal?: AbortSignal;
  /** Use this key instead of the stored one (Settings "Test & Save"). `null` = send no key. */
  keyOverride?: string | null;
  /** Retry once on 429/503 honouring Retry-After (max 30s). Default true. */
  retry?: boolean;
}

const MAX_RETRY_WAIT_S = 30;

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(signal?.reason);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** The key the browser should send right now ("" when none / demo mode). */
export function currentClientKey(): string {
  const s = useSettings.getState();
  return s.demoMode ? "" : s.apiKey;
}

function toSearchParams(params?: Record<string, QueryValue>): URLSearchParams {
  const qs = new URLSearchParams();
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null || v === "") continue;
      qs.set(k, String(v));
    }
  }
  return qs;
}

export function buildCdaUrl(path: string, params?: Record<string, QueryValue>): string {
  const clean = path.replace(/^\/+/, "");
  const q = toSearchParams(params).toString();
  return withBasePath(`/api/cda/${clean}${q ? `?${q}` : ""}`);
}

/**
 * Static build: no proxy exists, so answer from the bundled snapshot with the
 * same bodies and errors the proxy would return (404 not_in_sample -> CdaError).
 */
async function staticSampleFetch<T>(path: string, params: Record<string, QueryValue> | undefined, signal?: AbortSignal): Promise<T> {
  // The proxy sees decoded path segments ("quant/coins/BTC"); match that.
  const rawPath = path
    .replace(/^\/+/, "")
    .split("/")
    .map((seg) => {
      try {
        return decodeURIComponent(seg);
      } catch {
        return seg;
      }
    })
    .join("/");
  if (signal?.aborted) throw signal.reason;
  let reply;
  try {
    reply = await sampleFetch(rawPath, toSearchParams(params));
  } catch {
    if (signal?.aborted) throw signal.reason;
    throw new CdaError({ status: 0, code: "network_error", message: "Network error: could not load the bundled sample data." });
  }
  if (signal?.aborted) throw signal.reason;
  if (reply.status >= 200 && reply.status < 300) return reply.body as T;
  throw errorFromBody(reply.status, reply.body, null);
}

/**
 * Fetch a CDA endpoint through our Next.js proxy and return parsed JSON.
 * Throws CdaError on non-2xx. In the static build (no server) it resolves
 * from the bundled sample snapshot instead.
 */
export async function cdaFetch<T = unknown>(path: string, opts: CdaFetchOptions = {}): Promise<T> {
  const { params, signal, keyOverride, retry = true } = opts;
  if (STATIC_SAMPLE) return staticSampleFetch<T>(path, params, signal);
  const url = buildCdaUrl(path, params);
  const key = keyOverride === undefined ? currentClientKey() : keyOverride ?? "";
  const headers: HeadersInit = { Accept: "application/json" };
  if (key) (headers as Record<string, string>)["x-cda-key"] = key;
  // Demo mode: ask the proxy for bundled sample data instead of the server key.
  if (!key && useSettings.getState().demoMode) (headers as Record<string, string>)["x-cda-sample"] = "1";

  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, { headers, signal, cache: "no-store" });
    } catch (err) {
      if (signal?.aborted) throw err;
      throw new CdaError({ status: 0, code: "network_error", message: "Network error: could not reach the dashboard server." });
    }
    const now = Date.now();
    useRateLimit.getState().record(res.headers, now);

    if (res.ok) {
      const text = await res.text();
      if (!text) return null as T;
      try {
        return JSON.parse(text) as T;
      } catch {
        throw new CdaError({ status: res.status, code: "bad_json", message: "The API returned a non-JSON response." });
      }
    }

    const retryAfter = parseRetryAfter(res.headers.get("retry-after"), now);
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    const err = errorFromBody(res.status, body, retryAfter);
    if (res.status === 429) useRateLimit.getState().mark429(now);

    const retriable = res.status === 429 || res.status === 503;
    if (retry && retriable && attempt === 0) {
      const wait = retryAfter ?? 2;
      if (wait <= MAX_RETRY_WAIT_S) {
        await sleep(Math.max(250, wait * 1000), signal);
        continue;
      }
    }
    throw err;
  }
}

/** Short, non-reversible fingerprint used to scope query caches per key. */
export function keyFingerprint(key: string): string {
  if (!key) return "none";
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (Math.imul(31, h) + key.charCodeAt(i)) | 0;
  return `k${(h >>> 0).toString(36)}`;
}
