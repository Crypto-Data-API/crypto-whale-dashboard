import type { NextRequest } from "next/server";
import { CDA_UPSTREAM, PROXY_USER_AGENT, jsonError, pickPassthroughHeaders, safePath, serverDemoKey } from "@/lib/cda/server";

/**
 * REST proxy: /api/cda/<path>?<query>  ->  https://cryptodataapi.com/api/v1/<path>?<query>
 *
 * The browser sends its key in `x-cda-key`; if absent we fall back to the
 * optional server env CDA_API_KEY. Status, JSON body, X-RateLimit-* and
 * Retry-After are passed through unchanged. The key is never logged.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TIMEOUT_MS = 25_000;

type Ctx = { params: Promise<{ path: string[] }> };

async function proxy(req: NextRequest, ctx: Ctx): Promise<Response> {
  const { path } = await ctx.params;
  const clean = safePath(path);
  if (!clean) return jsonError(400, "bad_path", "Invalid API path.");

  const upstreamUrl = `${CDA_UPSTREAM}/${clean}${req.nextUrl.search}`;
  const userKey = (req.headers.get("x-cda-key") || "").trim();
  const key = userKey || serverDemoKey();

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
