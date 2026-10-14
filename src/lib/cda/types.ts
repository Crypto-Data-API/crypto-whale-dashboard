/**
 * Normalised CryptoDataApi shapes used by the UI.
 * Raw responses are parsed defensively in ./parse.ts. Field names noted in
 * comments are the ones observed from the live API (Oct 2026).
 */

export type Tier = "free" | "pro" | "pro_plus";

export const TIER_RANK: Record<Tier, number> = { free: 0, pro: 1, pro_plus: 2 };

export const TIER_LABEL: Record<Tier, string> = { free: "Free", pro: "Pro", pro_plus: "Pro Plus" };

/** GET /auth/keys/me */
export interface KeyInfo {
  tier: Tier;
  keyPrefix: string | null;
  dailyLimit: number | null;
  perMinuteLimit: number | null;
  requestsToday: number | null;
  isActive: boolean;
  emailVerified: boolean | null;
  expiresAt: string | null;
  upgradeMessage: string | null;
  checkedAt: number;
}

export type ChartInterval = "5m" | "15m" | "1h" | "4h" | "1d";
export const CHART_INTERVALS: ChartInterval[] = ["5m", "15m", "1h", "4h", "1d"];
export const INTERVAL_SECONDS: Record<ChartInterval, number> = {
  "5m": 300,
  "15m": 900,
  "1h": 3600,
  "4h": 14400,
  "1d": 86400,
};

/* ------------------------------------------------------------------ */
/* Whales                                                              */
/* ------------------------------------------------------------------ */

export interface WhaleTagBucket {
  longUsd: number | null;
  shortUsd: number | null;
  netUsd: number | null;
  grossUsd: number | null;
  nAccounts: number | null;
}

export interface WhaleSummary {
  accounts: number | null;
  universeSize: number | null;
  minAccountValueUsd: number | null;
  byClass: Record<string, number>;
  byTagUsd: Record<string, WhaleTagBucket>;
  coinsHeld: number | null;
  longUsd: number | null;
  shortUsd: number | null;
  netUsd: number | null;
  grossUsd: number | null;
  /** percent units (45.2) */
  longPct: number | null;
  longShortRatio: number | null;
  netBias: string | null;
}

export interface WhaleCoin {
  symbol: string;
  mark: number | null;
  segment: string | null;
  grossUsd: number | null;
  longUsd: number | null;
  shortUsd: number | null;
  netUsd: number | null;
  /** Net excluding market-maker books ("directional_net_usd"). */
  directionalNetUsd: number | null;
  /** percent units */
  longPct: number | null;
  /** 0..100 percentile of long_pct against this coin's own 30-day history. */
  pctile30d: number | null;
  nAccounts: number | null;
  nLong: number | null;
  nShort: number | null;
  netBias: string | null;
  dominantSide: string | null;
}

export interface WhalesData {
  summary: WhaleSummary;
  coins: WhaleCoin[];
  positionsAsOf: number | null;
  timestamp: number | null;
  venue: string | null;
  note: string | null;
}

export interface WhaleHistoryPoint {
  date: string;
  ts: number;
  accounts: number | null;
  longUsd: number | null;
  shortUsd: number | null;
  netUsd: number | null;
  grossUsd: number | null;
  source: string | null;
  estimated: boolean;
}

/* ------------------------------------------------------------------ */
/* Stream events                                                       */
/* ------------------------------------------------------------------ */

export type EventType = "liquidation" | "whale_transfer" | "whale_position" | "funding" | "oi_delta" | "price_move";

export const EVENT_TYPES: EventType[] = [
  "whale_position",
  "whale_transfer",
  "liquidation",
  "oi_delta",
  "price_move",
  "funding",
];

export const EVENT_LABEL: Record<EventType, string> = {
  whale_position: "Whale position",
  whale_transfer: "Whale transfer",
  liquidation: "Liquidation",
  oi_delta: "OI change",
  price_move: "Price move",
  funding: "Funding",
};

export function isEventType(t: string): t is EventType {
  return (EVENT_TYPES as string[]).includes(t);
}

/** Where an event in the buffer came from. */
export type EventOrigin = "live" | "backfill" | "delayed" | "restored";

/**
 * A single stream event. One loose shape (rather than a discriminated union)
 * so unknown future types and missing fields never break rendering.
 */
export interface CdaEvent {
  id: number;
  /** event time, ms */
  ts: number;
  recv_ts?: number;
  type: string;
  venue?: string;
  symbol: string;
  // liquidation
  side?: string;
  usd?: number;
  px?: number;
  sz?: number;
  // whale_transfer
  exchange?: string;
  chain?: string;
  direction?: string;
  amount?: number;
  // whale_position
  action?: string;
  size?: number;
  address?: string;
  change_pct?: number | null;
  // funding
  rate_1h?: number;
  prev_rate_1h?: number;
  settle?: boolean;
  // oi_delta / price_move
  pct?: number;
  window_s?: number;
  oi_usd?: number;
  price?: number;
  prev_price?: number;
  origin?: EventOrigin;
}

export interface RecentEventsResponse {
  count: number;
  lastId: number | null;
  events: CdaEvent[];
}

export interface DelayedEventsResponse {
  serverNow: number | null;
  delayMs: number | null;
  windowStart: number | null;
  windowEnd: number | null;
  count: number;
  events: CdaEvent[];
}

/* ------------------------------------------------------------------ */
/* Market data                                                         */
/* ------------------------------------------------------------------ */

export interface Candle {
  /** seconds (lightweight-charts UTCTimestamp) */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface CandlesResult {
  bars: Candle[];
  source: "hyperliquid" | "binance";
  symbol: string;
}

export interface TradeFlowBucket {
  /** ms */
  time: number;
  buyNotional: number;
  sellNotional: number;
  nTrades: number | null;
  vwap: number | null;
  maxFillUsd: number | null;
  largeFillShare: number | null;
  cvdUsd: number | null;
  partial: boolean;
}

export interface TradeFlowData {
  coin: string;
  bucket: string | null;
  largeFillUsd: number | null;
  data: TradeFlowBucket[];
}

export interface ExchangeFlowSpike {
  /** ms */
  ts: number;
  chain: string | null;
  symbol: string;
  exchange: string | null;
  direction: string;
  amount: number | null;
  unit: string | null;
  amountUsd: number | null;
  source: string | null;
}

export interface HlSummary {
  coin: string;
  price: number | null;
  markPrice: number | null;
  oraclePrice: number | null;
  /** hourly funding rate, fraction */
  fundingRate: number | null;
  /** open interest in coin units */
  openInterest: number | null;
  openInterestUsd: number | null;
  premium: number | null;
  dayVolumeUsd: number | null;
  prevDayPrice: number | null;
  fundingHistory: { time: number; rate: number }[];
  asOf: number | null;
  source: "hyperliquid/summary" | "derivatives/summary";
  binance: {
    fundingRate: number | null;
    openInterest: number | null;
    longPct: number | null;
    longShortRatio: number | null;
  } | null;
}

export type ProbBlock = Record<string, number>;

export interface QuantCoin {
  symbol: string;
  timestamp: string | null;
  horizon: string | null;
  regime: { label: string | null; name: string | null; confidence: number | null; since: string | null } | null;
  directional: ProbBlock | null;
  volatility: ProbBlock | null;
  funding: ProbBlock | null;
  openInterest: ProbBlock | null;
  tomorrow: {
    quantiles: Record<string, number>;
    pVolSpike: number | null;
    pDrawdownGt5: number | null;
  } | null;
  status: string | null;
}

export interface NewsItem {
  id: string;
  title: string;
  url: string | null;
  source: string | null;
  published: number | null;
  category: string | null;
  impactScore: number | null;
  bias: number | null;
  corroboration: number | null;
}

export interface CoinNews {
  symbol: string;
  newsPressure: number | null;
  newsTilt: number | null;
  items: NewsItem[];
}

export interface CoinSearchResult {
  id: string | null;
  symbol: string;
  name: string | null;
  price: number | null;
  marketCap: number | null;
  rank: number | null;
  change24h: number | null;
  image: string | null;
}

export interface HlOpenInterest {
  totalOiUsd: number | null;
  asOf: number | null;
  byCoin: Record<string, number>;
}
