import type { WhaleCoin } from "./types";

/**
 * Sample rows shown when there is no key or the tier cannot read /quant/whales.
 * Clearly labelled as sample data in the UI; values are illustrative only.
 */
export const DEMO_WHALE_COINS: WhaleCoin[] = [
  {
    symbol: "BTC",
    mark: 83712.5,
    segment: "perp",
    grossUsd: 2_490_617_458,
    longUsd: 1_188_862_442,
    shortUsd: 1_301_755_016,
    netUsd: -112_892_574,
    directionalNetUsd: -23_208_947,
    longPct: 47.7,
    pctile30d: 32.5,
    nAccounts: 1202,
    nLong: 648,
    nShort: 554,
    netBias: "neutral",
    dominantSide: "short",
  },
  {
    symbol: "ETH",
    mark: 2518.4,
    segment: "perp",
    grossUsd: 1_342_118_903,
    longUsd: 781_112_300,
    shortUsd: 561_006_603,
    netUsd: 220_105_697,
    directionalNetUsd: 148_330_120,
    longPct: 58.2,
    pctile30d: 81.0,
    nAccounts: 941,
    nLong: 566,
    nShort: 375,
    netBias: "long",
    dominantSide: "long",
  },
  {
    symbol: "SOL",
    mark: 142.31,
    segment: "perp",
    grossUsd: 512_440_120,
    longUsd: 198_210_330,
    shortUsd: 314_229_790,
    netUsd: -116_019_460,
    directionalNetUsd: -61_402_115,
    longPct: 38.7,
    pctile30d: 12.0,
    nAccounts: 488,
    nLong: 201,
    nShort: 287,
    netBias: "short",
    dominantSide: "short",
  },
];
