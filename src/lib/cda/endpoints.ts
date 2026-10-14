"use client";

import { cdaFetch, isCdaError } from "./client";
import {
  parseCandles,
  parseCoinNews,
  parseCoinSearch,
  parseDelayedEvents,
  parseDerivativesSummary,
  parseHlOpenInterest,
  parseHlSummary,
  parseKeyInfo,
  parseQuantCoin,
  parseRecentEvents,
  parseSpikeAlerts,
  parseTradeFlow,
  parseWhaleHistory,
  parseWhales,
} from "./parse";
import { parseTraderProfiles, parseWhaleAccounts } from "./parse-accounts";
import type {
  CandlesResult,
  ChartInterval,
  CoinNews,
  CoinSearchResult,
  DelayedEventsResponse,
  ExchangeFlowSpike,
  HlOpenInterest,
  HlSummary,
  KeyInfo,
  QuantCoin,
  RecentEventsResponse,
  TradeFlowData,
  WhaleHistoryPoint,
  WhalesData,
  TraderProfile,
  WhaleAccountsData,
} from "./types";

type Sig = { signal?: AbortSignal };

/** GET /auth/keys/me — validates a key and returns its tier and limits. */
export async function getKeyInfo(opts: Sig & { keyOverride?: string | null } = {}): Promise<KeyInfo> {
  const raw = await cdaFetch("auth/keys/me", { signal: opts.signal, keyOverride: opts.keyOverride, retry: false });
  return parseKeyInfo(raw, Date.now());
}

/** GET /quant/whales (Pro) */
export async function getWhales({ signal }: Sig = {}): Promise<WhalesData> {
  return parseWhales(await cdaFetch("quant/whales", { signal }));
}

/** GET /quant/whales/history (Pro Plus) */
export async function getWhalesHistory(days: number, { signal }: Sig = {}): Promise<WhaleHistoryPoint[]> {
  return parseWhaleHistory(await cdaFetch("quant/whales/history", { params: { days }, signal }));
}

/** GET /stream/recent (any key) — oldest first. */
export async function getRecentEvents(
  params: { limit?: number; types?: string; symbols?: string; min_usd?: number },
  { signal }: Sig = {},
): Promise<RecentEventsResponse> {
  return parseRecentEvents(await cdaFetch("stream/recent", { params: { limit: 500, ...params }, signal }));
}

/** GET /stream/delayed (no key) — 3-minute window that ended 30 minutes ago. */
export async function getDelayedEvents({ signal }: Sig = {}): Promise<DelayedEventsResponse> {
  return parseDelayedEvents(await cdaFetch("stream/delayed", { signal, keyOverride: null }));
}

const BINANCE_INTERVAL: Record<ChartInterval, string> = { "5m": "5m", "15m": "15m", "1h": "1h", "4h": "4h", "1d": "1d" };

/**
 * Candles: Hyperliquid first (perp universe, any key), then Binance spot
 * klines `<SYMBOL>USDT` as a fallback when HL has no such coin.
 */
export async function getCandles(symbol: string, interval: ChartInterval, { signal }: Sig = {}): Promise<CandlesResult> {
  let hlError: unknown = null;
  try {
    const raw = await cdaFetch("hyperliquid/candles", { params: { coin: symbol, interval, limit: 1000 }, signal });
    const bars = parseCandles(raw);
    if (bars.length > 0) return { bars, source: "hyperliquid", symbol };
  } catch (err) {
    if (signal?.aborted) throw err;
    // Auth problems will fail the fallback too; surface them directly.
    if (isCdaError(err) && (err.isAuth || err.isRateLimited)) throw err;
    hlError = err;
  }
  const pair = `${symbol.toUpperCase().replace(/USDT$/, "")}USDT`;
  try {
    const raw = await cdaFetch("market-data/klines", { params: { symbol: pair, interval: BINANCE_INTERVAL[interval], limit: 1000 }, signal });
    return { bars: parseCandles(raw), source: "binance", symbol: pair };
  } catch (err) {
    throw hlError ?? err;
  }
}

/** GET /hyperliquid/trade-flow (Pro) — 1-minute taker flow buckets. */
export async function getTradeFlow(coin: string, minutes: number, { signal }: Sig = {}): Promise<TradeFlowData> {
  return parseTradeFlow(await cdaFetch("hyperliquid/trade-flow", { params: { coin, minutes }, signal, retry: false }), coin);
}

/** GET /hyperliquid/summary, falling back to /derivatives/summary. */
export async function getFundingOi(coin: string, { signal }: Sig = {}): Promise<HlSummary> {
  try {
    const s = parseHlSummary(await cdaFetch("hyperliquid/summary", { params: { coin }, signal }), coin);
    if (s.fundingRate !== null || s.openInterest !== null || s.markPrice !== null) return s;
  } catch (err) {
    if (signal?.aborted) throw err;
    if (isCdaError(err) && (err.isAuth || err.isRateLimited)) throw err;
  }
  return parseDerivativesSummary(await cdaFetch("derivatives/summary", { params: { coin }, signal }), coin);
}

/** GET /quant/coins/{symbol} (Pro) */
export async function getQuantCoin(symbol: string, { signal }: Sig = {}): Promise<QuantCoin> {
  return parseQuantCoin(await cdaFetch(`quant/coins/${encodeURIComponent(symbol)}`, { signal }), symbol);
}

/** GET /news/coin/{symbol} */
export async function getCoinNews(symbol: string, hours: number, { signal }: Sig = {}): Promise<CoinNews> {
  return parseCoinNews(await cdaFetch(`news/coin/${encodeURIComponent(symbol)}`, { params: { hours }, signal }), symbol);
}

/** GET /on-chain/exchange-flows/spike-alerts */
export async function getSpikeAlerts(minAmount: number, { signal }: Sig = {}): Promise<ExchangeFlowSpike[]> {
  return parseSpikeAlerts(await cdaFetch("on-chain/exchange-flows/spike-alerts", { params: { min_amount: minAmount }, signal }));
}

/** GET /hyperliquid/open-interest — totals across the HL perp universe. */
export async function getHlOpenInterest({ signal }: Sig = {}): Promise<HlOpenInterest> {
  return parseHlOpenInterest(await cdaFetch("hyperliquid/open-interest", { signal }));
}

/** GET /coins/search */
export async function searchCoins(q: string, { signal }: Sig = {}): Promise<CoinSearchResult[]> {
  return parseCoinSearch(await cdaFetch("coins/search", { params: { q }, signal, retry: false }));
}

/** GET /daily/hl-traders: leaderboard plus open positions for tracked wallets. */
export async function getWhaleAccounts({ signal }: Sig = {}): Promise<WhaleAccountsData> {
  return parseWhaleAccounts(await cdaFetch("daily/hl-traders", { signal }));
}

/** GET /hyperliquid/trader-profiles (Pro): classification, win rate and edges per wallet. */
export async function getTraderProfiles({ signal }: Sig = {}): Promise<Record<string, TraderProfile>> {
  return parseTraderProfiles(await cdaFetch("hyperliquid/trader-profiles", { signal }));
}
