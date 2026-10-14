import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Sample-data fallback for the REST proxy.
 *
 * When no API key is available at all (no key in Settings, no CDA_API_KEY on
 * the server) the proxy answers a fixed set of GET endpoints from JSON
 * snapshots in src/data/sample/, captured with scripts/capture-sample-data.mjs.
 * As soon as a key exists the proxy talks to CryptoDataApi instead, so sample
 * data is replaced automatically.
 *
 * Timestamps are shifted forward so the snapshot always ends "now": the chart
 * frames the latest days and relative times read sensibly. The shift is a
 * whole number of hours so 5m/15m/1h bars stay on their grid.
 */

const SAMPLE_DIR = path.join(process.cwd(), "src", "data", "sample");
const HOUR_MS = 3_600_000;

type Json = unknown;
const cache = new Map<string, Promise<Json | null>>();

function load(name: string): Promise<Json | null> {
  let p = cache.get(name);
  if (!p) {
    p = readFile(path.join(SAMPLE_DIR, `${name}.json`), "utf8")
      .then((t) => JSON.parse(t) as Json)
      .catch(() => null);
    cache.set(name, p);
  }
  return p;
}

interface Manifest {
  capturedAt: number;
  coins: string[];
  intervals: string[];
}

async function manifest(): Promise<Manifest | null> {
  const m = (await load("manifest")) as Partial<Manifest> | null;
  return m && typeof m.capturedAt === "number" ? (m as Manifest) : null;
}

/** True when sample snapshots exist on this deployment. */
export async function hasSampleData(): Promise<boolean> {
  return (await manifest()) !== null;
}

/** Milliseconds to add to every sample timestamp (rounded down to whole hours). */
function shiftMs(capturedAt: number): number {
  return Math.max(0, Math.floor((Date.now() - capturedAt) / HOUR_MS) * HOUR_MS);
}

const MS_KEYS = new Set(["ts", "recv_ts", "time", "timestamp", "positions_as_of", "window_start", "window_end", "forming_bar_timestamp", "start", "end"]);
const ISO_KEYS = new Set(["timestamp", "updated_at", "as_of", "published_at", "published", "date", "created_at"]);

/** Recursively shifts epoch-ms and ISO timestamps found under known keys. */
function shiftTimes(v: Json, ms: number): Json {
  if (ms === 0) return v;
  if (Array.isArray(v)) return v.map((x) => shiftTimes(x, ms));
  if (v && typeof v === "object") {
    const out: Record<string, Json> = {};
    for (const [k, val] of Object.entries(v as Record<string, Json>)) {
      if (typeof val === "number" && MS_KEYS.has(k) && val > 1e12) out[k] = val + ms;
      else if (typeof val === "number" && MS_KEYS.has(k) && val > 1e9 && val < 1e11) out[k] = val + ms / 1000; // epoch seconds
      else if (typeof val === "string" && ISO_KEYS.has(k) && /^\d{4}-\d{2}-\d{2}T/.test(val)) {
        const t = Date.parse(val);
        out[k] = Number.isFinite(t) ? new Date(t + ms).toISOString() : val;
      } else out[k] = shiftTimes(val, ms);
    }
    return out;
  }
  return v;
}

function json(data: Json, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", "x-cda-key-source": "sample" },
  });
}

function notInSample(path: string): Response {
  return json({ detail: { error: "not_in_sample", message: `No sample data for ${path}. Add an API key for live data.` } }, 404);
}

function coinOf(sp: URLSearchParams, coins: string[]): string | null {
  const c = (sp.get("coin") || sp.get("symbol") || "").toUpperCase().replace(/USDT$/, "");
  return coins.includes(c) ? c : null;
}

function filterEvents(data: Json, sp: URLSearchParams): Json {
  const o = (data ?? {}) as { events?: unknown[]; count?: number; last_id?: number };
  let events = Array.isArray(o.events) ? (o.events as Record<string, unknown>[]) : [];
  const types = sp.get("types")?.split(",").map((s) => s.trim()).filter(Boolean);
  const symbols = sp.get("symbols")?.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  const minUsd = Number(sp.get("min_usd") ?? 0) || 0;
  const limit = Math.min(500, Math.max(1, Number(sp.get("limit") ?? 100) || 100));
  if (types?.length) events = events.filter((e) => types.includes(String(e.type)));
  if (symbols?.length) events = events.filter((e) => symbols.includes(String(e.symbol).toUpperCase()));
  if (minUsd > 0) events = events.filter((e) => typeof e.usd !== "number" || Math.abs(e.usd) >= minUsd);
  events = events.slice(-limit);
  const last = events[events.length - 1];
  return { ...o, events, count: events.length, last_id: last ? last.id : o.last_id };
}

/**
 * Answers a GET request from the sample snapshots, or returns null when the
 * path is not covered (the caller then responds as it would without a key).
 */
export async function sampleResponse(rawPath: string, sp: URLSearchParams): Promise<Response | null> {
  const m = await manifest();
  if (!m) return null;
  const ms = shiftMs(m.capturedAt);
  const serve = async (name: string, transform?: (d: Json) => Json) => {
    const data = await load(name);
    if (data === null) return notInSample(rawPath);
    const shifted = shiftTimes(data, ms);
    return json(transform ? transform(shifted) : shifted);
  };

  switch (true) {
    case rawPath === "auth/keys/me":
      return json({
        key_prefix: "sample",
        tier: "pro_plus",
        is_active: true,
        requests_today: 0,
        daily_limit: 0,
        per_minute_limit: 0,
        email_verified: true,
        sample: true,
        upgrade_message: "Sample data. Add your CryptoDataApi key in Settings for live data.",
      });
    case rawPath === "quant/whales":
      return serve("quant-whales");
    case rawPath === "quant/whales/history":
      return serve("quant-whales-history");
    case rawPath === "daily/hl-traders":
      return serve("hl-traders");
    case rawPath === "hyperliquid/trader-profiles":
      return serve("trader-profiles");
    case rawPath === "hyperliquid/open-interest":
      return serve("hl-open-interest");
    case rawPath === "market-health":
      return serve("market-health");
    case rawPath === "on-chain/exchange-flows/spike-alerts":
      return serve("spike-alerts");
    case rawPath === "coins/top":
      return serve("coins-top");
    case rawPath === "coins/search": {
      const q = (sp.get("q") || "").toUpperCase();
      return serve("coins-top", (d) => {
        const o = (d ?? {}) as Record<string, unknown>;
        const list = (Array.isArray(o.coins) ? o.coins : Array.isArray(o.data) ? o.data : Array.isArray(d) ? d : []) as Record<string, unknown>[];
        const hits = list.filter((c) => [c.symbol, c.name, c.coin].some((v) => typeof v === "string" && v.toUpperCase().includes(q)));
        return Array.isArray(d) ? hits : { ...o, coins: hits, data: hits, count: hits.length };
      });
    }
    case rawPath === "stream/recent": {
      const symbols = sp.get("symbols")?.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean) ?? [];
      const coin = symbols.length === 1 && m.coins.includes(symbols[0]) ? symbols[0] : null;
      const name = coin ? `events/${coin}` : "stream-recent";
      const data = (await load(name)) ?? (await load("stream-recent"));
      if (data === null) return notInSample(rawPath);
      return json(filterEvents(shiftTimes(data, ms), sp));
    }
    case rawPath === "hyperliquid/candles": {
      const coin = coinOf(sp, m.coins);
      const interval = sp.get("interval") || "1h";
      if (!coin || !m.intervals.includes(interval)) return notInSample(rawPath);
      return serve(`candles/${coin}-${interval}`);
    }
    case rawPath === "hyperliquid/trade-flow": {
      const coin = coinOf(sp, m.coins);
      return coin ? serve(`trade-flow/${coin}`) : notInSample(rawPath);
    }
    case rawPath === "hyperliquid/summary": {
      const coin = coinOf(sp, m.coins);
      return coin ? serve(`summary/${coin}`) : notInSample(rawPath);
    }
    case /^quant\/coins\/[A-Za-z0-9]+$/.test(rawPath): {
      const coin = rawPath.split("/")[2].toUpperCase();
      return m.coins.includes(coin) ? serve(`quant/${coin}`) : notInSample(rawPath);
    }
    case /^news\/coin\/[A-Za-z0-9]+$/.test(rawPath): {
      const coin = rawPath.split("/")[2].toUpperCase();
      return m.coins.includes(coin) ? serve(`news/${coin}`) : notInSample(rawPath);
    }
    default:
      return notInSample(rawPath);
  }
}
