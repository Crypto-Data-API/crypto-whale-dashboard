import type { NextRequest } from "next/server";
import { CDA_UPSTREAM, PROXY_USER_AGENT, jsonError, pickPassthroughHeaders, safePath, serverKey, statusResponse } from "@/lib/cda/server";

/**
 * REST proxy: /api/cda/<path>?<query>  ->  https://cryptodataapi.com/api/v1/<path>?<query>
 *
 * The browser sends its own key in `x-cda-key`; if absent we fall back to the
 * server env CDA_API_KEY. The server key is only used for GET/HEAD, so a
 * deployment cannot be used to change the key owner's account (webhooks,
 * watchlists). Status, JSON body, X-RateLimit-* and Retry-After are passed
 * through unchanged. Keys are never logged.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TIMEOUT_MS = 25_000;

/**
 * Account-private reads that must not be served with the server key: they
 * would expose the key owner's billing, webhooks (target URLs) or watchlist
 * to any visitor. A visitor's own key in Settings can still reach them.
 */
const SERVER_KEY_BLOCKED: RegExp[] = [
  /^auth\/(?!keys\/me$)/,
  /^payments\/(subscription|invoices)(\/|$)/,
  /^webhooks(\/|$)/,
  /^hyperliquid\/watchlist(\/|$)/,
];

/** Fields of /auth/keys/me that identify the server key's owner. */
const OWNER_FIELDS = ["email"];

type Ctx = { params: Promise<{ path: string[] }> };

async function proxy(req: NextRequest, ctx: Ctx): Promise<Response> {
  const { path } = await ctx.params;
  // Normally answered by the dedicated %5Fstatus route; guarded here so it is never proxied upstream.
  if (path?.length === 1 && path[0] === "_status") return statusResponse();
  const clean = safePath(path);
  if (!clean) return jsonError(400, "bad_path", "Invalid API path.");

  const upstreamUrl = `${CDA_UPSTREAM}/${clean}${req.nextUrl.search}`;
  const userKey = (req.headers.get("x-cda-key") || "").trim();
  const isRead = req.method === "GET" || req.method === "HEAD";
  if (!userKey && !isRead && serverKey()) {
    return jsonError(401, "user_key_required", "Write requests need your own API key; the server key is read-only.");
  }
  const key = userKey || (isRead ? serverKey() : "");
  const usingServerKey = !userKey && key !== "";
  const rawPath = path.join("/");
  if (usingServerKey && SERVER_KEY_BLOCKED.some((re) => re.test(rawPath))) {
    return jsonError(401, "user_key_required", "This account endpoint needs your own API key; the server key cannot read it.");
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": PROXY_USER_AGENT,
  };
  if (key) headers["X-API-Key"] = key;

  let body: BodyInit | undefined;
  if (req.method !== "GET" && req.method !== "HEAD") {
    body = await req.text();
    headers["Content-Type"] = req.headers.get("content-type") || "application/json";
  }

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method: req.method,
      headers,
      body,
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.any([req.signal, AbortSignal.timeout(TIMEOUT_MS)]),
    });
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    return timedOut
      ? jsonError(504, "upstream_timeout", "CryptoDataApi did not respond in time.")
      : jsonError(502, "upstream_unreachable", "Could not reach CryptoDataApi.");
  }

  const out = pickPassthroughHeaders(upstream.headers);
  out.set("content-type", upstream.headers.get("content-type") || "application/json");
  out.set("cache-control", "no-store");
  out.set("x-cda-key-source", userKey ? "user" : key ? "server" : "none");

  // Server key: keep tier/limits from /auth/keys/me but drop owner-identifying fields.
  if (usingServerKey && rawPath === "auth/keys/me" && upstream.ok) {
    try {
      const data = (await upstream.json()) as Record<string, unknown>;
      for (const f of OWNER_FIELDS) delete data[f];
      out.set("content-type", "application/json");
      return new Response(JSON.stringify(data), { status: upstream.status, headers: out });
    } catch {
      return jsonError(502, "bad_upstream_json", "CryptoDataApi returned an unreadable response.");
    }
  }

  // Stream the body straight through (fetch has already decoded any gzip).
  const nullBody = upstream.status === 204 || upstream.status === 205 || upstream.status === 304;
  return new Response(nullBody ? null : upstream.body, { status: upstream.status, headers: out });
}

export async function GET(req: NextRequest, ctx: Ctx) {
  return proxy(req, ctx);
}

export async function POST(req: NextRequest, ctx: Ctx) {
  return proxy(req, ctx);
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  return proxy(req, ctx);
}
