"use client";

import { useQuery } from "@tanstack/react-query";
import { useCdaQuery } from "@/hooks/use-cda-query";
import { useAccess } from "@/hooks/use-access";
import {
  getCandles,
  getCoinNews,
  getFundingOi,
  getHlOpenInterest,
  getQuantCoin,
  getRecentEvents,
  getSpikeAlerts,
  getTradeFlow,
  getTraderProfiles,
  getWhaleAccounts,
  getWhales,
  getWhalesHistory,
  searchCoins,
} from "@/lib/cda/endpoints";
import type { ChartInterval } from "@/lib/cda/types";
import { useSettings } from "@/stores/settings";

/** Whale positioning across the Hyperliquid universe (Pro, default 5-min poll). */
export function useWhales() {
  const sec = useSettings((s) => s.refresh.whalesSec);
  return useCdaQuery({
    key: ["quant/whales"],
    fn: (signal) => getWhales({ signal }),
    requires: "pro",
    refetchMs: sec * 1000,
    keepPrevious: true,
  });
}

/** Daily whale long/short notional history (Pro Plus). */
export function useWhalesHistory(days = 180) {
  return useCdaQuery({
    key: ["quant/whales/history", days],
    fn: (signal) => getWhalesHistory(days, { signal }),
    requires: "pro_plus",
    refetchMs: 30 * 60_000,
  });
}

/** Total Hyperliquid open interest (for the stat tile). */
export function useHlOpenInterest() {
  const sec = useSettings((s) => s.refresh.summariesSec);
  return useCdaQuery({
    key: ["hyperliquid/open-interest"],
    fn: (signal) => getHlOpenInterest({ signal }),
    requires: "any",
    refetchMs: sec * 1000,
    keepPrevious: true,
  });
}

/** OHLCV candles with Binance fallback (default 60s poll). */
export function useCandles(symbol: string, interval: ChartInterval) {
  const sec = useSettings((s) => s.refresh.candlesSec);
  return useCdaQuery({
    key: ["candles", symbol, interval],
    fn: (signal) => getCandles(symbol, interval, { signal }),
    requires: "any",
    refetchMs: sec * 1000,
  });
}

/** 1-minute taker flow for the CVD pane (Pro). Retries later on 503 warm-up. */
export function useTradeFlow(symbol: string, minutes = 1440, enabled = true) {
  const sec = useSettings((s) => s.refresh.candlesSec);
  return useCdaQuery({
    key: ["hyperliquid/trade-flow", symbol, minutes],
    fn: (signal) => getTradeFlow(symbol, minutes, { signal }),
    requires: "pro",
    refetchMs: Math.max(60, sec) * 1000,
    enabled,
  });
}

export function useFundingOi(symbol: string) {
  const sec = useSettings((s) => s.refresh.summariesSec);
  return useCdaQuery({
    key: ["funding-oi", symbol],
    fn: (signal) => getFundingOi(symbol, { signal }),
    requires: "any",
    refetchMs: sec * 1000,
  });
}

export function useQuantCoin(symbol: string) {
  const sec = useSettings((s) => s.refresh.summariesSec);
  return useCdaQuery({
    key: ["quant/coins", symbol],
    fn: (signal) => getQuantCoin(symbol, { signal }),
    requires: "pro",
    refetchMs: Math.max(300, sec) * 1000,
  });
}

export function useCoinNews(symbol: string, hours = 72) {
  return useCdaQuery({
    key: ["news/coin", symbol, hours],
    fn: (signal) => getCoinNews(symbol, hours, { signal }),
    requires: "any",
    refetchMs: 10 * 60_000,
  });
}

/** Large CEX wallet transfers (~10h window). */
export function useSpikeAlerts(minAmount = 1_000_000) {
  const sec = useSettings((s) => s.refresh.summariesSec);
  return useCdaQuery({
    key: ["on-chain/spike-alerts", minAmount],
    fn: (signal) => getSpikeAlerts(minAmount, { signal }),
    requires: "any",
    refetchMs: Math.max(120, sec) * 1000,
    keepPrevious: true,
  });
}

/**
 * Per-symbol whale/liquidation history from the server stream buffer
 * (~2h deep), used to seed chart markers beyond the local ring buffer.
 */
export function useCoinRecentEvents(symbol: string) {
  return useCdaQuery({
    key: ["stream/recent", symbol],
    fn: (signal) =>
      getRecentEvents({ limit: 500, types: "whale_position,liquidation,whale_transfer", symbols: symbol }, { signal }),
    requires: "any",
    refetchMs: 3 * 60_000,
  });
}

/** Coin search for the header box (debounce the query before calling). */
export function useCoinSearch(q: string) {
  const access = useAccess();
  const term = q.trim();
  const enabled = term.length >= 2 && access.gate("any") === "ok";
  return useQuery({
    queryKey: ["cda", access.fp, "coins/search", term.toLowerCase()],
    queryFn: ({ signal }) => searchCoins(term, { signal }),
    enabled,
    staleTime: 10 * 60_000,
    retry: false,
  });
}

/** Tracked Hyperliquid whale wallets with open positions (any key, 5-min poll). */
export function useWhaleAccounts() {
  const sec = useSettings((s) => s.refresh.whalesSec);
  return useCdaQuery({
    key: ["daily/hl-traders"],
    fn: (signal) => getWhaleAccounts({ signal }),
    requires: "any",
    refetchMs: sec * 1000,
    keepPrevious: true,
  });
}

/** Trader classification and edge stats per wallet (Pro, 10-min poll). */
export function useTraderProfiles() {
  return useCdaQuery({
    key: ["hyperliquid/trader-profiles"],
    fn: (signal) => getTraderProfiles({ signal }),
    requires: "pro",
    refetchMs: 10 * 60_000,
    keepPrevious: true,
  });
}
