import type { WhaleCoin } from "@/lib/cda/types";

export interface RadarCoin {
  coin: WhaleCoin;
  symbol: string;
  /** Placement value: 30-day percentile, else the raw long share. */
  pct: number;
  /** True when pctile30d was missing and the long share was used instead. */
  usedFallback: boolean;
  long: boolean;
  gross: number;
}

export function toRadarCoins(coins: WhaleCoin[]): RadarCoin[] {
  const out: RadarCoin[] = [];
  for (const coin of coins) {
    const pct = coin.pctile30d ?? coin.longPct;
    if (pct === null) continue;
    out.push({ coin, symbol: coin.symbol, pct, usedFallback: coin.pctile30d === null, long: pct >= 50, gross: coin.grossUsd ?? 0 });
  }
  return out;
}

export function topByGross(coins: RadarCoin[]): RadarCoin | null {
  let best: RadarCoin | null = null;
  for (const c of coins) if (!best || c.gross > best.gross) best = c;
  return best;
}
