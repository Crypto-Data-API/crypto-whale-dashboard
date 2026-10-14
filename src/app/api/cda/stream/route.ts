import type { NextRequest } from "next/server";
import { CDA_UPSTREAM, PROXY_USER_AGENT, pickPassthroughHeaders, serverDemoKey } from "@/lib/cda/server";

/**
 * SSE proxy: /api/cda/stream?types=&symbols=&min_usd=&since_id=
 *
 * EventSource cannot set headers, so the key comes from (in order):
 *   1. the `cda_key` cookie (path-scoped to this route, set by the client),
 *   2. a `key` query param (supported, but the app does not use it because
 *      URLs end up in request logs),
 *   3. the optional server env CDA_API_KEY.
 *
 * The upstream body is piped frame-by-frame with no buffering beyond the
 * current partial frame. `: ping` comment frames are rewritten as
 * `event: ping` so the browser can run a heartbeat watchdog.
 *
 * Upstream HTTP errors are delivered as a 200 SSE response carrying a single
 * `event: upstream_error` frame, because EventSource cannot read the status
 * code of a failed response and would otherwise retry blindly forever.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const FORWARD_PARAMS = ["types", "symbols", "min_usd", "since_id"] as const;

const SSE_HEADERS: Record<string, string> = {
  "content-type": "text/event-stream; charset=utf-8",
  // no-transform stops compression middleware from buffering the stream.
  "cache-control": "no-cache, no-transform",
  connection: "keep-alive",
  "x-accel-buffering": "no",
};

function sseErrorResponse(status: number, error: string, message: string, retryAfter: number | null): Response {
  const payload = JSON.stringify({ status, error, message, retry_after: retryAfter });
  const body = `retry: 15000\nevent: upstream_error\ndata: ${payload}\n\n`;
  return new Response(body, { status: 200, headers: { ...SSE_HEADERS, "x-upstream-status": String(status) } });
}

function errorDetail(text: string): { error: string; message: string } {
  try {
    const j = JSON.parse(text) as { detail?: unknown; error?: unknown; message?: unknown };
    const d = j.detail;
    if (d && typeof d === "object" && !Array.isArray(d)) {
      const o = d as Record<string, unknown>;
      return { error: String(o.error ?? "upstream_error"), message: String(o.message ?? "Stream request failed.") };
    }
    if (typeof d === "string") return { error: "upstream_error", message: d };
    return { error: String(j.error ?? "upstream_error"), message: String(j.message ?? "Stream request failed.") };
  } catch {
    return { error: "upstream_error", message: "Stream request failed." };
  }
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const key = (req.cookies.get("cda_key")?.value || sp.get("key") || serverDemoKey()).trim();

  const upstreamUrl = new URL(`${CDA_UPSTREAM}/stream`);
  for (const name of FORWARD_PARAMS) {
    const v = sp.get(name);
    if (v) upstreamUrl.searchParams.set(name, v);
  }

  const headers: Record<string, string> = {
    Accept: "text/event-stream",
    "User-Agent": PROXY_USER_AGENT,
  };
  if (key) headers["X-API-Key"] = key;
  const lastEventId = req.headers.get("last-event-id");
  if (lastEventId) {
    headers["Last-Event-ID"] = lastEventId;
    if (!upstreamUrl.searchParams.has("since_id")) upstreamUrl.searchParams.set("since_id", lastEventId);
  }

  const upstreamAbort = new AbortController();
  const onClientAbort = () => upstreamAbort.abort();
  req.signal.addEventListener("abort", onClientAbort, { once: true });

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, { headers, cache: "no-store", signal: upstreamAbort.signal });
  } catch {
    req.signal.removeEventListener("abort", onClientAbort);
    return sseErrorResponse(502, "upstream_unreachable", "Could not reach the CryptoDataApi stream.", null);
  }

  if (!upstream.ok || !upstream.body) {
    req.signal.removeEventListener("abort", onClientAbort);
    const text = await upstream.text().catch(() => "");
    const { error, message } = errorDetail(text);
    const ra = Number(upstream.headers.get("retry-after"));
    return sseErrorResponse(upstream.status, error, message, Number.isFinite(ra) && ra > 0 ? ra : null);
  }

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  const stream = new ReadableStream<Uint8Array>({
    // Push loop: forward each complete frame as soon as it arrives.
    async start(controller) {
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true }).replace(/\r\n?/g, "\n");
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";
          let out = "";
          for (const frame of frames) {
            if (!frame) continue;
            const lines = frame.split("\n").filter(Boolean);
            const commentOnly = lines.length > 0 && lines.every((l) => l.startsWith(":"));
            out += commentOnly ? "event: ping\ndata: {}\n\n" : `${frame}\n\n`;
          }
          if (out) controller.enqueue(encoder.encode(out));
        }
        if (buffer.trim()) controller.enqueue(encoder.encode(`${buffer}\n\n`));
      } catch {
        // Upstream dropped or client went away; just end the response.
      } finally {
        req.signal.removeEventListener("abort", onClientAbort);
        try {
          controller.close();
        } catch {
          // already closed / cancelled
        }
      }
    },
    cancel() {
      upstreamAbort.abort();
      reader.cancel().catch(() => undefined);
    },
  });

  const out = pickPassthroughHeaders(upstream.headers);
  for (const [k, v] of Object.entries(SSE_HEADERS)) out.set(k, v);
  return new Response(stream, { status: 200, headers: out });
}
