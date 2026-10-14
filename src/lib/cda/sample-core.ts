/**
 * Sample-data resolver shared by the server proxy and the static (GitHub
 * Pages) build.
 *
 * The snapshots live in public/sample/ (captured with
 * scripts/capture-sample-data.mjs). This module only maps an API path plus
 * query to a snapshot file and reshapes the result; reading the file is left
 * to a loader, so the same code runs on the server (fs) and in the browser
 * (fetch of /sample/<name>.json).
 *
 * Timestamps are shifted forward so the snapshot always ends "now": the chart
 * frames the latest days and relative times read sensibly. The shift is a
 * whole number of hours so 5m/15m/1h bars stay on their grid.
 */

export type Json = unknown;

/**
 * Loads public/sample/<name>.json. Resolves null when the file does not
 * exist; may reject on I/O or network errors.
 */
export type SampleLoader = (name: string) => Promise<Json | null>;

export interface SampleManifest {
  capturedAt: number;
  coins: string[];
  intervals: string[];
}

/** Status + JSON body, turned into a Response (server) or a value / CdaError (browser). */
export interface SampleReply {
  status: number;
  body: Json;
}

const HOUR_MS = 3_600_000;

export async function loadManifest(load: SampleLoader): Promise<SampleManifest | null> {
  const m = (await load("manifest")) as Partial<SampleManifest> | null;
  return m && typeof m.capturedAt === "number" && Array.isArray(m.coins) && Array.isArray(m.intervals) ? (m as SampleManifest) : null;
}

/** Milliseconds to add to every sample timestamp (rounded down to whole hours). */
export function sampleShiftMs(capturedAt: number, now: number = Date.now()): number {
  return Math.max(0, Math.floor((now - capturedAt) / HOUR_MS) * HOUR_MS);
}

const MS_KEYS = new Set(["ts", "recv_ts", "time", "timestamp", "positions_as_of", "window_start", "window_end", "forming_bar_timestamp", "start", "end"]);
const ISO_KEYS = new Set(["timestamp", "updated_at", "as_of", "published_at", "published", "date", "created_at"]);

/** Recursively shifts epoch-ms and ISO timestamps found under known keys. */
export function shiftTimes(v: Json, ms: number): Json {
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

/** 404 body in the API's documented error format, so clients raise a normal CdaError. */
export function notInSample(path: string): SampleReply {
  return {
    status: 404,
    body: { detail: { error: "not_in_sample", message: `The sample snapshot has no data for ${path}. Live data needs a CryptoDataApi key.` } },
  };
}

/** Synthetic /auth/keys/me: the snapshot covers every tier, so it reports Pro Plus. */
export const SAMPLE_KEY_INFO = {
  key_prefix: "sample",
  tier: "pro_plus",
  is_active: true,
  requests_today: 0,
  daily_limit: 0,
  per_minute_limit: 0,
  email_verified: true,
  sample: true,
  upgrade_message: "Sample data. Live data needs a CryptoDataApi key.",
} as const;

function coinOf(sp: URLSearchParams, coins: string[]): string | null {
  const c = (sp.get("coin") || sp.get("symbol") || "").toUpperCase().replace(/USDT$/, "");
  return coins.includes(c) ? c : null;
}

/** Applies the /stream/recent filters (types, symbols, min_usd, limit) to a snapshot. */
export function filterEvents(data: Json, sp: URLSearchParams): Json {
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
 * Answers a GET request from the sample snapshots. `rawPath` is the API path
 * without the /api/v1 prefix and with decoded segments ("quant/coins/BTC").
 * Returns null only when the snapshots are missing altogether; paths the
 * snapshot does not cover get a 404 `not_in_sample` reply.
 */
export async function resolveSample(load: SampleLoader, rawPath: string, sp: URLSearchParams, now: number = Date.now()): Promise<SampleReply | null> {
  const m = await loadManifest(load);
  if (!m) return null;
  const ms = sampleShiftMs(m.capturedAt, now);
  const ok = (body: Json): SampleReply => ({ status: 200, body });
  const serve = async (name: string, transform?: (d: Json) => Json): Promise<SampleReply> => {
    const data = await load(name);
    if (data === null) return notInSample(rawPath);
    const shifted = shiftTimes(data, ms);
    return ok(transform ? transform(shifted) : shifted);
  };

  switch (true) {
    case rawPath === "auth/keys/me":
      return ok({ ...SAMPLE_KEY_INFO });
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
      return ok(filterEvents(shiftTimes(data, ms), sp));
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
