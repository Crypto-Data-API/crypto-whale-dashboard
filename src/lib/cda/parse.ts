/**
 * Defensive parsers: raw CDA JSON -> normalised types.
 *
 * The API is documented loosely and evolves, so every parser:
 *  - accepts several field-name spellings (e.g. `symbol` or `coin`),
 *  - tolerates strings where numbers are expected,
 *  - never throws on missing fields (returns null / empty instead).
 */
import type {
  Candle,
  CdaEvent,
  CoinNews,
  CoinSearchResult,
  DelayedEventsResponse,
  ExchangeFlowSpike,
  HlOpenInterest,
  HlSummary,
  KeyInfo,
  NewsItem,
  ProbBlock,
  QuantCoin,
  RecentEventsResponse,
  Tier,
  TradeFlowData,
  WhaleCoin,
  WhaleHistoryPoint,
  WhaleSummary,
  WhaleTagBucket,
  WhalesData,
} from "./types";

type Obj = Record<string, unknown>;

export function isObj(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function asObj(v: unknown): Obj {
  return isObj(v) ? v : {};
}

export function asArr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/** Number or null; accepts numeric strings. */
export function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function str(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

export function bool(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return null;
}

/** First non-null number among the given keys. */
export function pickNum(o: Obj, ...keys: string[]): number | null {
  for (const k of keys) {
    const n = num(o[k]);
    if (n !== null) return n;
  }
  return null;
}

export function pickStr(o: Obj, ...keys: string[]): string | null {
  for (const k of keys) {
    const s = str(o[k]);
    if (s !== null && s !== "") return s;
  }
  return null;
}

/** Normalise an epoch value (s, ms or µs) or ISO string to milliseconds. */
export function toMs(v: unknown): number | null {
  const n = num(v);
  if (n !== null) {
    if (n > 1e17) return Math.round(n / 1e6); // ns
    if (n > 1e14) return Math.round(n / 1e3); // µs
    if (n > 1e11) return Math.round(n); // ms
    if (n > 1e8) return Math.round(n * 1000); // s
    return null;
  }
  if (typeof v === "string") {
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

/** Percent units: values in [0,1] that look like fractions get scaled to 0..100. */
function pctUnits(v: number | null, fallback: number | null = null): number | null {
  if (v === null) return fallback;
  return v;
}

export function parseTier(v: unknown): Tier | null {
  const s = typeof v === "string" ? v.toLowerCase().replace(/[\s-]+/g, "_") : "";
  if (s === "free") return "free";
  if (s === "pro") return "pro";
  if (s === "pro_plus" || s === "proplus" || s === "pro+" || s === "plus") return "pro_plus";
  return null;
}

/* ------------------------------------------------------------------ */

export function parseKeyInfo(raw: unknown, now: number): KeyInfo {
  const o = asObj(raw);
  return {
    tier: parseTier(o.tier) ?? "free",
    keyPrefix: pickStr(o, "key_prefix", "prefix"),
    dailyLimit: pickNum(o, "daily_limit", "limit_day"),
    perMinuteLimit: pickNum(o, "per_minute_limit", "limit_minute"),
    requestsToday: pickNum(o, "requests_today"),
    isActive: bool(o.is_active) ?? true,
    emailVerified: bool(o.email_verified),
    expiresAt: pickStr(o, "expires_at"),
    upgradeMessage: pickStr(o, "upgrade_message"),
    checkedAt: now,
  };
}

/* ------------------------------------------------------------------ */
/* Whales                                                              */
/* ------------------------------------------------------------------ */

function parseTagBucket(raw: unknown): WhaleTagBucket {
  const o = asObj(raw);
  return {
    longUsd: pickNum(o, "long_usd"),
    shortUsd: pickNum(o, "short_usd"),
    netUsd: pickNum(o, "net_usd"),
    grossUsd: pickNum(o, "gross_usd"),
    nAccounts: pickNum(o, "n_accounts", "accounts"),
  };
}

export function parseWhaleSummary(raw: unknown): WhaleSummary {
  const o = asObj(raw);
  const longUsd = pickNum(o, "total_long_usd", "long_usd");
  const shortUsd = pickNum(o, "total_short_usd", "short_usd");
  const grossUsd = pickNum(o, "total_gross_usd", "gross_usd") ?? (longUsd !== null && shortUsd !== null ? longUsd + shortUsd : null);
  const netUsd = pickNum(o, "total_net_usd", "net_usd") ?? (longUsd !== null && shortUsd !== null ? longUsd - shortUsd : null);
  let longPct = pickNum(o, "long_pct");
  if (longPct === null && longUsd !== null && shortUsd !== null && longUsd + shortUsd > 0) {
    longPct = (longUsd / (longUsd + shortUsd)) * 100;
  } else if (longPct !== null && longPct <= 1 && longPct > 0) {
    longPct = longPct * 100;
  }
  const byClass: Record<string, number> = {};
  for (const [k, v] of Object.entries(asObj(o.by_class))) {
    const n = num(v);
    if (n !== null) byClass[k] = n;
  }
  const byTagUsd: Record<string, WhaleTagBucket> = {};
  for (const [k, v] of Object.entries(asObj(o.by_tag_usd))) byTagUsd[k] = parseTagBucket(v);
  return {
    accounts: pickNum(o, "accounts_tracked", "accounts", "n_accounts"),
    universeSize: pickNum(o, "universe_size"),
    minAccountValueUsd: pickNum(o, "min_account_value_usd"),
    byClass,
    byTagUsd,
    coinsHeld: pickNum(o, "coins_held"),
    longUsd,
    shortUsd,
    netUsd,
    grossUsd,
    longPct,
    longShortRatio: pickNum(o, "long_short_ratio", "ls_ratio") ?? (longUsd !== null && shortUsd ? longUsd / shortUsd : null),
    netBias: pickStr(o, "net_bias", "bias"),
  };
}

export function parseWhaleCoin(raw: unknown): WhaleCoin | null {
  const o = asObj(raw);
  const symbol = pickStr(o, "symbol", "coin", "asset", "name");
  if (!symbol) return null;
  const longUsd = pickNum(o, "long_usd");
  const shortUsd = pickNum(o, "short_usd");
  const grossUsd = pickNum(o, "gross_usd") ?? (longUsd !== null && shortUsd !== null ? longUsd + shortUsd : null);
  let longPct = pctUnits(pickNum(o, "long_pct"));
  if (longPct === null && longUsd !== null && grossUsd) longPct = (longUsd / grossUsd) * 100;
  else if (longPct !== null && longPct > 0 && longPct <= 1 && longUsd !== null && grossUsd && longUsd / grossUsd > 0.01) {
    longPct = longPct * 100;
  }
  let pctile = pickNum(o, "long_pct_pctile_30d", "pctile_30d", "long_pct_percentile_30d");
  if (pctile !== null && pctile > 0 && pctile <= 1) pctile = pctile * 100;
  return {
    symbol,
    mark: pickNum(o, "mark", "mark_price", "price", "mid"),
    segment: pickStr(o, "segment"),
    grossUsd,
    longUsd,
    shortUsd,
    netUsd: pickNum(o, "net_usd") ?? (longUsd !== null && shortUsd !== null ? longUsd - shortUsd : null),
    directionalNetUsd: pickNum(o, "directional_net_usd", "net_ex_mm_usd", "net_usd_ex_mm"),
    longPct,
    pctile30d: pctile,
    nAccounts: pickNum(o, "n_accounts", "accounts"),
    nLong: pickNum(o, "n_long", "long_accounts"),
    nShort: pickNum(o, "n_short", "short_accounts"),
    netBias: pickStr(o, "net_bias", "bias"),
    dominantSide: pickStr(o, "dominant_side"),
  };
}

export function parseWhales(raw: unknown): WhalesData {
  const o = asObj(raw);
  const coinsRaw = asArr(o.top_coins ?? o.coins ?? o.data);
  const coins = coinsRaw.map(parseWhaleCoin).filter((c): c is WhaleCoin => c !== null);
  const meta = asObj(o.meta);
  return {
    summary: parseWhaleSummary(o.summary),
    coins,
    positionsAsOf: toMs(o.positions_as_of) ?? toMs(asObj(coinsRaw[0]).positions_as_of),
    timestamp: toMs(o.timestamp),
    venue: pickStr(meta, "venue"),
    note: pickStr(meta, "note"),
  };
}

export function parseWhaleHistory(raw: unknown): WhaleHistoryPoint[] {
  const o = asObj(raw);
  const pts = asArr(o.points ?? o.history ?? o.data ?? raw);
  const out: WhaleHistoryPoint[] = [];
  for (const p of pts) {
    const r = asObj(p);
    const date = pickStr(r, "date", "day");
    const ts = toMs(r.ts_ms) ?? toMs(r.ts) ?? (date ? toMs(date) : null);
    if (ts === null) continue;
    out.push({
      date: date ?? new Date(ts).toISOString().slice(0, 10),
      ts,
      accounts: pickNum(r, "accounts"),
      longUsd: pickNum(r, "long_usd"),
      shortUsd: pickNum(r, "short_usd"),
      netUsd: pickNum(r, "net_usd"),
      grossUsd: pickNum(r, "gross_usd"),
      source: pickStr(r, "source"),
      estimated: bool(r.estimated) ?? pickStr(r, "source") === "seed",
    });
  }
  return out.sort((a, b) => a.ts - b.ts);
}

/* ------------------------------------------------------------------ */
/* Stream events                                                       */
/* ------------------------------------------------------------------ */

const EVENT_NUM_FIELDS = [
  "usd",
  "px",
  "sz",
  "amount",
  "size",
  "rate_1h",
  "prev_rate_1h",
  "pct",
  "window_s",
  "oi_usd",
  "price",
  "prev_price",
  "recv_ts",
] as const;

const EVENT_STR_FIELDS = ["venue", "side", "exchange", "chain", "direction", "action", "address"] as const;

export function parseEvent(raw: unknown): CdaEvent | null {
  const o = asObj(raw);
  const id = num(o.id);
  const type = pickStr(o, "type", "event");
  const ts = toMs(o.ts) ?? toMs(o.recv_ts) ?? toMs(o.time);
  if (id === null || !type || ts === null) return null;
  const ev: CdaEvent = { id, ts, type, symbol: pickStr(o, "symbol", "coin") ?? "?" };
  for (const k of EVENT_NUM_FIELDS) {
    const n = num(o[k]);
    if (n !== null) ev[k] = n;
  }
  for (const k of EVENT_STR_FIELDS) {
    const s = str(o[k]);
    if (s !== null) ev[k] = s;
  }
  const cp = num(o.change_pct);
  ev.change_pct = cp;
  const settle = bool(o.settle);
  if (settle !== null) ev.settle = settle;
  return ev;
}

export function parseEvents(raw: unknown): CdaEvent[] {
  return asArr(raw)
    .map(parseEvent)
    .filter((e): e is CdaEvent => e !== null);
}

export function parseRecentEvents(raw: unknown): RecentEventsResponse {
  const o = asObj(raw);
  const events = parseEvents(o.events ?? o.data);
  const lastId = num(o.last_id) ?? (events.length ? events[events.length - 1].id : null);
  return { count: num(o.count) ?? events.length, lastId, events };
}

export function parseDelayedEvents(raw: unknown): DelayedEventsResponse {
  const o = asObj(raw);
  const events = parseEvents(o.events ?? o.data);
  return {
    serverNow: toMs(o.server_now),
    delayMs: num(o.delay_ms),
    windowStart: toMs(o.window_start),
    windowEnd: toMs(o.window_end),
    count: num(o.count) ?? events.length,
    events,
  };
}

/* ------------------------------------------------------------------ */
/* Candles                                                             */
/* ------------------------------------------------------------------ */

/**
 * Accepts `{candles|klines|bars|data: [...]}` or a bare array. Each bar may be
 * an array `[t, o, h, l, c, v]` or an object with letter (`t,o,h,l,c,v`) or
 * word keys (`timestamp|time|open_time, open, high, low, close, volume`).
 * Timestamps may be seconds or ms. Output: ascending, de-duplicated, seconds.
 */
export function parseCandles(raw: unknown): Candle[] {
  const o = asObj(raw);
  const rows = Array.isArray(raw) ? raw : asArr(o.candles ?? o.klines ?? o.bars ?? o.data);
  const byTime = new Map<number, Candle>();
  for (const r of rows) {
    let t: number | null, op: number | null, hi: number | null, lo: number | null, cl: number | null, vol: number | null;
    if (Array.isArray(r)) {
      t = toMs(r[0]);
      op = num(r[1]);
      hi = num(r[2]);
      lo = num(r[3]);
      cl = num(r[4]);
      vol = num(r[5]);
    } else {
      const b = asObj(r);
      t = toMs(b.timestamp ?? b.time ?? b.open_time ?? b.t ?? b.T ?? b.ts);
      op = pickNum(b, "open", "o");
      hi = pickNum(b, "high", "h");
      lo = pickNum(b, "low", "l");
      cl = pickNum(b, "close", "c");
      vol = pickNum(b, "volume", "v", "vol");
    }
    if (t === null || op === null || hi === null || lo === null || cl === null) continue;
    const time = Math.floor(t / 1000);
    byTime.set(time, { time, open: op, high: hi, low: lo, close: cl, volume: vol ?? 0 });
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

/* ------------------------------------------------------------------ */
/* Trade flow                                                          */
/* ------------------------------------------------------------------ */

export function parseTradeFlow(raw: unknown, coin: string): TradeFlowData {
  const o = asObj(raw);
  const data = asArr(o.data)
    .map((r) => {
      const b = asObj(r);
      const time = toMs(b.time ?? b.ts ?? b.timestamp);
      if (time === null) return null;
      return {
        time,
        buyNotional: pickNum(b, "buy_notional", "buy_usd") ?? 0,
        sellNotional: pickNum(b, "sell_notional", "sell_usd") ?? 0,
        nTrades: pickNum(b, "n_trades"),
        vwap: pickNum(b, "vwap"),
        maxFillUsd: pickNum(b, "max_fill_usd"),
        largeFillShare: pickNum(b, "large_fill_share"),
        cvdUsd: pickNum(b, "cvd_usd", "cvd"),
        partial: bool(b.partial) ?? false,
      };
    })
    .filter((b): b is NonNullable<typeof b> => b !== null)
    .sort((a, b) => a.time - b.time);
  return {
    coin: pickStr(o, "coin", "symbol") ?? coin,
    bucket: pickStr(o, "bucket"),
    largeFillUsd: pickNum(o, "large_fill_usd"),
    data,
  };
}

/* ------------------------------------------------------------------ */
/* On-chain exchange flow spikes                                       */
/* ------------------------------------------------------------------ */

export function parseSpikeAlerts(raw: unknown): ExchangeFlowSpike[] {
  const o = asObj(raw);
  const rows = asArr(o.alerts ?? o.data ?? o.spikes ?? raw);
  const out: ExchangeFlowSpike[] = [];
  for (const r of rows) {
    const a = asObj(r);
    const ts = toMs(a.ts ?? a.time ?? a.timestamp);
    const symbol = pickStr(a, "symbol", "coin", "asset");
    if (ts === null || !symbol) continue;
    out.push({
      ts,
      chain: pickStr(a, "chain"),
      symbol,
      exchange: pickStr(a, "exchange"),
      direction: (pickStr(a, "direction") ?? "").toLowerCase(),
      amount: pickNum(a, "amount"),
      unit: pickStr(a, "unit"),
      amountUsd: pickNum(a, "amount_usd", "usd", "value_usd"),
      source: pickStr(a, "source"),
    });
  }
  return out.sort((a, b) => b.ts - a.ts);
}

/* ------------------------------------------------------------------ */
/* Funding / OI                                                        */
/* ------------------------------------------------------------------ */

export function parseHlSummary(raw: unknown, coin: string): HlSummary {
  const o = asObj(raw);
  const price = pickNum(o, "price", "mid", "mark_price");
  const markPrice = pickNum(o, "mark_price", "mark") ?? price;
  const oi = pickNum(o, "open_interest");
  const fundingHistory = asArr(o.funding_history)
    .map((r) => {
      const f = asObj(r);
      const time = toMs(f.time ?? f.ts);
      const rate = pickNum(f, "funding_rate", "rate");
      return time !== null && rate !== null ? { time, rate } : null;
    })
    .filter((f): f is { time: number; rate: number } => f !== null)
    .sort((a, b) => a.time - b.time);
  return {
    coin: pickStr(o, "coin", "symbol") ?? coin,
    price,
    markPrice,
    oraclePrice: pickNum(o, "oracle_price"),
    fundingRate: pickNum(o, "funding_rate", "funding"),
    openInterest: oi,
    openInterestUsd: pickNum(o, "open_interest_usd") ?? (oi !== null && markPrice !== null ? oi * markPrice : null),
    premium: pickNum(o, "premium"),
    dayVolumeUsd: pickNum(o, "day_volume", "day_ntl_vlm", "volume_24h"),
    prevDayPrice: pickNum(o, "prev_day_px"),
    fundingHistory,
    asOf: toMs(o.as_of) ?? toMs(o.generated_at),
    source: "hyperliquid/summary",
    binance: null,
  };
}

/** /derivatives/summary -> the same card shape (Hyperliquid block + Binance extras). */
export function parseDerivativesSummary(raw: unknown, coin: string): HlSummary {
  const o = asObj(raw);
  const hl = asObj(o.hyperliquid);
  const bn = asObj(o.binance);
  const markPrice = pickNum(hl, "mark_price", "mark");
  const oi = pickNum(hl, "open_interest");
  const bnFunding = asObj(bn.funding);
  const bnOi = asObj(bn.open_interest);
  const bnLs = asObj(bn.long_short);
  const hasBinance = Object.keys(bn).length > 0;
  return {
    coin: pickStr(o, "coin") ?? coin,
    price: markPrice,
    markPrice,
    oraclePrice: pickNum(hl, "oracle_price"),
    fundingRate: pickNum(hl, "funding_rate"),
    openInterest: oi,
    openInterestUsd: pickNum(hl, "open_interest_usd") ?? (oi !== null && markPrice !== null ? oi * markPrice : null),
    premium: pickNum(hl, "premium"),
    dayVolumeUsd: pickNum(hl, "day_ntl_vlm", "day_volume"),
    prevDayPrice: pickNum(hl, "prev_day_px"),
    fundingHistory: [],
    asOf: null,
    source: "derivatives/summary",
    binance: hasBinance
      ? {
          fundingRate: pickNum(bnFunding, "current_rate"),
          openInterest: pickNum(bnOi, "current"),
          longPct: pickNum(bnLs, "long_pct"),
          longShortRatio: pickNum(bnLs, "ratio"),
        }
      : null,
  };
}

export function parseHlOpenInterest(raw: unknown): HlOpenInterest {
  const o = asObj(raw);
  const byCoin: Record<string, number> = {};
  for (const r of asArr(o.assets ?? o.data)) {
    const a = asObj(r);
    const c = pickStr(a, "coin", "symbol");
    const usd = pickNum(a, "open_interest_usd");
    if (c && usd !== null) byCoin[c] = usd;
  }
  const total = pickNum(o, "total_oi_usd", "total_open_interest_usd") ?? (Object.keys(byCoin).length ? Object.values(byCoin).reduce((s, v) => s + v, 0) : null);
  return { totalOiUsd: total, asOf: toMs(o.as_of) ?? toMs(o.generated_at), byCoin };
}

/* ------------------------------------------------------------------ */
/* Quant                                                               */
/* ------------------------------------------------------------------ */

function probBlock(raw: unknown): ProbBlock | null {
  if (!isObj(raw)) return null;
  const out: ProbBlock = {};
  for (const [k, v] of Object.entries(raw)) {
    const n = num(v);
    if (n !== null) out[k] = n;
  }
  return Object.keys(out).length ? out : null;
}

export function parseQuantCoin(raw: unknown, symbol: string): QuantCoin {
  const o = asObj(raw);
  const reg = asObj(o.current ?? o.regime);
  const probs = asObj(o.probabilities);
  const tm = asObj(o.tomorrow);
  const quantiles: Record<string, number> = {};
  for (const [k, v] of Object.entries(asObj(tm.cum_return_quantiles))) {
    const n = num(v);
    if (n !== null) quantiles[k] = n;
  }
  return {
    symbol: pickStr(o, "symbol", "scope") ?? symbol,
    timestamp: pickStr(o, "timestamp"),
    horizon: pickStr(o, "horizon"),
    regime: Object.keys(reg).length
      ? {
          label: pickStr(reg, "label"),
          name: pickStr(reg, "name", "label"),
          confidence: pickNum(reg, "confidence"),
          since: pickStr(reg, "in_regime_since"),
        }
      : null,
    directional: probBlock(probs.directional),
    volatility: probBlock(probs.volatility),
    funding: probBlock(probs.funding),
    openInterest: probBlock(probs.open_interest),
    tomorrow: Object.keys(tm).length
      ? {
          quantiles,
          pVolSpike: pickNum(tm, "p_visit_vol_spike"),
          pDrawdownGt5: pickNum(tm, "p_drawdown_gt_5pct"),
        }
      : null,
    status: pickStr(asObj(o.meta), "status"),
  };
}

/* ------------------------------------------------------------------ */
/* News / search                                                       */
/* ------------------------------------------------------------------ */

export function parseCoinNews(raw: unknown, symbol: string): CoinNews {
  const o = asObj(raw);
  const items: NewsItem[] = [];
  asArr(o.events ?? o.news ?? o.items ?? o.data).forEach((r, i) => {
    const n = asObj(r);
    const title = pickStr(n, "title", "headline");
    if (!title) return;
    items.push({
      id: pickStr(n, "event_id", "id", "url") ?? String(i),
      title,
      url: pickStr(n, "url", "link"),
      source: pickStr(n, "source", "publisher"),
      published: toMs(n.published ?? n.published_at ?? n.time),
      category: pickStr(n, "category"),
      impactScore: pickNum(n, "impact_score", "impact"),
      bias: pickNum(n, "bias", "sentiment"),
      corroboration: pickNum(n, "corroboration"),
    });
  });
  items.sort((a, b) => (b.published ?? 0) - (a.published ?? 0));
  return {
    symbol: pickStr(o, "symbol") ?? symbol,
    newsPressure: pickNum(o, "news_pressure"),
    newsTilt: pickNum(o, "news_tilt"),
    items,
  };
}

export function parseCoinSearch(raw: unknown): CoinSearchResult[] {
  const o = asObj(raw);
  const rows = Array.isArray(raw) ? raw : asArr(o.results ?? o.coins ?? o.data);
  const out: CoinSearchResult[] = [];
  for (const r of rows) {
    const c = asObj(r);
    const symbol = pickStr(c, "symbol", "coin");
    if (!symbol) continue;
    out.push({
      id: pickStr(c, "coingecko_id", "id"),
      symbol: symbol.toUpperCase(),
      name: pickStr(c, "name"),
      price: pickNum(c, "current_price", "price"),
      marketCap: pickNum(c, "market_cap"),
      rank: pickNum(c, "market_cap_rank", "rank"),
      change24h: pickNum(c, "price_change_24h_pct", "change_24h"),
      image: pickStr(c, "image_url", "image"),
    });
  }
  return out;
}
