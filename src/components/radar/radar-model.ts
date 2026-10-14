import { symbolHash } from "@/components/deck/coin-logo";
import type { WhaleCoin } from "@/lib/cda/types";

/** Coins at or above this gross whale notional get a permanent radar label ("Major"). */
export const MAJOR_GROSS_USD = 90_000_000;

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

/** Stable angle per coin, 12°..168°, from a hash of its symbol. */
export function blipAngle(symbol: string): number {
  return 12 + (symbolHash(symbol) % 15601) / 100;
}

/**
 * Position in percent of the radar box (viewBox -100..100, rim radius 90).
 * Distance from centre = |pct - 50| / 50 * 90; long-leaning coins sit in the top half.
 */
export function blipPosition(pct: number, angleDeg: number): { left: number; top: number } {
  const d = Math.min(90, (Math.abs(pct - 50) / 50) * 90);
  const a = (angleDeg * Math.PI) / 180;
  const x = d * Math.cos(a);
  const y = (pct >= 50 ? -1 : 1) * d * Math.sin(a);
  return { left: (x + 100) / 2, top: (y + 100) / 2 };
}

/** Blip diameter in px: 16 + sqrt(gross / maxGross) * 34. */
export function blipSize(gross: number, maxGross: number): number {
  return Math.round(16 + Math.sqrt(Math.max(0, gross) / Math.max(1, maxGross)) * 34);
}

export function topByGross(coins: RadarCoin[]): RadarCoin | null {
  let best: RadarCoin | null = null;
  for (const c of coins) if (!best || c.gross > best.gross) best = c;
  return best;
}
