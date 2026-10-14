import "server-only";

/** Upstream base URL (no trailing slash). */
export const CDA_UPSTREAM = (process.env.CDA_API_BASE || "https://cryptodataapi.com/api/v1").replace(/\/+$/, "");

export const PROXY_USER_AGENT = "crypto-whale-dashboard/0.1 (+nextjs proxy)";

/**
 * Server-side fallback key, used when the browser has not supplied its own
 * key. CDA_API_KEY is the primary name; CDA_DEMO_KEY is kept as an alias.
 * Never sent to the browser and never logged.
 */
export function serverKey(): string {
  return (process.env.CDA_API_KEY || process.env.CDA_DEMO_KEY || "").trim();
}

export function hasServerKey(): boolean {
  return serverKey().length > 0;
}

/** Body for GET /api/cda/_status. Reveals only whether a server key exists. */
export function statusResponse(): Response {
  return Response.json({ hasServerKey: hasServerKey() }, { headers: { "cache-control": "no-store" } });
}

/** Response headers we pass back to the browser. */
export function pickPassthroughHeaders(src: Headers): Headers {
  const out = new Headers();
  src.forEach((value, name) => {
    const n = name.toLowerCase();
    if (n.startsWith("x-ratelimit-") || n === "retry-after" || n === "x-api-version") out.set(n, value);
  });
  // Let the browser read them (same-origin anyway, but harmless and explicit).
  out.set("access-control-expose-headers", "retry-after, x-ratelimit-limit-day, x-ratelimit-remaining-day, x-ratelimit-limit-minute, x-ratelimit-remaining-minute, x-ratelimit-reset-day, x-ratelimit-reset-minute");
  return out;
}

/** Reject path segments that could escape /api/v1. */
export function safePath(segments: string[] | undefined): string | null {
  if (!segments || segments.length === 0) return null;
  for (const s of segments) {
    if (!s || s === "." || s === ".." || s.includes("\\") || s.includes("\0")) return null;
  }
  return segments.map((s) => encodeURIComponent(s)).join("/");
}

export function jsonError(status: number, error: string, message: string, extra: HeadersInit = {}): Response {
  return new Response(JSON.stringify({ detail: { error, message } }), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...extra },
  });
}
