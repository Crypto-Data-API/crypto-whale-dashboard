import { asArr, asObj, isObj, num, pickNum, pickStr, str, toMs } from "./parse";
import type { PnlWindows, TraderProfile, WalletPosition, WhaleAccount, WhaleAccountsData } from "./types";

function windows(v: unknown): PnlWindows {
  const o = asObj(v);
  return { day: num(o.day), week: num(o.week), month: num(o.month), allTime: pickNum(o, "all_time", "allTime", "all") };
}

function parsePosition(raw: unknown): WalletPosition | null {
  if (!isObj(raw)) return null;
  const coin = pickStr(raw, "coin", "symbol");
  if (!coin) return null;
  const rawSzi = pickNum(raw, "raw_szi", "szi");
  let side = (pickStr(raw, "side") ?? "").toLowerCase();
  if (side !== "long" && side !== "short") side = rawSzi === null ? "unknown" : rawSzi >= 0 ? "long" : "short";
  const size = pickNum(raw, "size", "sz");
  const entry = pickNum(raw, "entry_price", "entryPx", "entry");
  const absSize = size === null ? (rawSzi === null ? null : Math.abs(rawSzi)) : Math.abs(size);
  const notional =
    pickNum(raw, "notional_usd", "position_value", "positionValue") ?? (absSize !== null && entry !== null ? absSize * entry : null);
  return {
    coin: coin.toUpperCase(),
    side: side as WalletPosition["side"],
    size: absSize,
    entryPrice: entry,
    unrealizedPnl: pickNum(raw, "unrealized_pnl", "unrealizedPnl", "upnl"),
    leverage: pickNum(raw, "leverage"),
    liquidationPrice: pickNum(raw, "liquidation_price", "liquidationPx"),
    marginUsed: pickNum(raw, "margin_used", "marginUsed"),
    notionalUsd: notional,
  };
}

/** GET /daily/hl-traders: leaderboard merged with each tracked wallet's open positions. */
export function parseWhaleAccounts(raw: unknown): WhaleAccountsData {
  const o = asObj(raw);
  const positionsByAddr = asObj(o.wallet_positions);
  const accounts: WhaleAccount[] = [];
  const seen = new Set<string>();

  const addAccount = (t: unknown) => {
    const r = asObj(t);
    const address = (pickStr(r, "address", "user", "wallet") ?? "").toLowerCase();
    if (!address || seen.has(address)) return;
    seen.add(address);
    const wp = asObj(positionsByAddr[address] ?? positionsByAddr[pickStr(r, "address") ?? ""]);
    const positions = asArr(wp.positions)
      .map(parsePosition)
      .filter((p): p is WalletPosition => p !== null);
    let longUsd = 0;
    let shortUsd = 0;
    let maxLeverage: number | null = null;
    for (const p of positions) {
      if (p.notionalUsd) {
        if (p.side === "short") shortUsd += p.notionalUsd;
        else longUsd += p.notionalUsd;
      }
      if (p.leverage !== null) maxLeverage = Math.max(maxLeverage ?? 0, p.leverage);
    }
    const liveValue = num(wp.account_value);
    accounts.push({
      address,
      displayName: pickStr(r, "display_name", "displayName"),
      accountValue: liveValue && liveValue > 0 ? liveValue : pickNum(r, "account_value", "accountValue"),
      score: pickNum(r, "score"),
      pnl: windows(r.pnl),
      roi: windows(r.roi),
      volume: windows(r.volume),
      profitableTimeframes: pickNum(r, "profitable_timeframes"),
      positions,
      longUsd,
      shortUsd,
      maxLeverage,
    });
  };

  for (const t of asArr(o.top_traders ?? o.traders)) addAccount(t);
  // Wallets that are tracked (have positions) but are not on the leaderboard.
  for (const addr of Object.keys(positionsByAddr)) addAccount({ address: addr });

  return {
    accounts,
    trackedCount: pickNum(o, "tracked_count"),
    updatedAt: toMs(o.updated_at),
  };
}

function parseProfile(raw: unknown, fallbackAddress: string): TraderProfile | null {
  if (!isObj(raw)) return null;
  const address = (pickStr(raw, "address") ?? fallbackAddress).toLowerCase();
  if (!address) return null;
  return {
    address,
    traderType: pickStr(raw, "trader_type", "traderType"),
    totalTrades: pickNum(raw, "total_trades"),
    winRate: pickNum(raw, "win_rate"),
    profitFactor: pickNum(raw, "profit_factor"),
    totalPnl: pickNum(raw, "total_pnl"),
    avgDurationHours: pickNum(raw, "avg_duration_hours"),
    approxSharpe: pickNum(raw, "approx_sharpe"),
    edges: asArr(raw.edges)
      .map(str)
      .filter((s): s is string => !!s),
    periodDays: pickNum(raw, "period_days"),
  };
}

/** GET /hyperliquid/trader-profiles: map of address to profile. */
export function parseTraderProfiles(raw: unknown): Record<string, TraderProfile> {
  const o = asObj(raw);
  const out: Record<string, TraderProfile> = {};
  const profiles = o.profiles;
  if (isObj(profiles)) {
    for (const [addr, p] of Object.entries(profiles)) {
      const parsed = parseProfile(p, addr);
      if (parsed) out[parsed.address] = parsed;
    }
  } else {
    for (const p of asArr(profiles)) {
      const parsed = parseProfile(p, "");
      if (parsed) out[parsed.address] = parsed;
    }
  }
  return out;
}
