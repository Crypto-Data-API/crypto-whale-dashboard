"use client";

import type { CSSProperties, ReactNode } from "react";
import { LsBar, PctileGauge } from "@/components/deck/bars";
import { CoinLogo } from "@/components/deck/coin-logo";
import { useCandles } from "@/hooks/use-cda-data";
import { fmtPct, fmtPrice, fmtUsd } from "@/lib/format";
import { DECK, leanTone } from "@/lib/palette";
import { useSettings } from "@/stores/settings";
import type { RadarCoin } from "./radar-model";

function MiniStat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-[12px] border border-iris/10 bg-iris/6 p-3">
      <span className="text-[11px] text-ink-muted">{label}</span>
      <span className="truncate font-mono text-[16px]">{children}</span>
    </div>
  );
}

function signColor(v: number | null): string {
  return v === null ? DECK.text : v >= 0 ? DECK.long : DECK.short;
}

/**
 * 24h change from candles at the user's default chart interval (the same
 * query the coin page opens with, so its chart is warm when the user clicks through).
 */
function use24hChange(symbol: string): number | null {
  const interval = useSettings((st) => st.defaultInterval);
  const q = useCandles(symbol, interval);
  const bars = q.data?.bars;
  if (!bars?.length) return null;
  const last = bars[bars.length - 1];
  const target = last.time - 86400;
  for (let i = bars.length - 1; i >= 0; i--) {
    if (bars[i].time <= target) return bars[i].close ? ((last.close - bars[i].close) / bars[i].close) * 100 : null;
  }
  return null;
}

/** Right-hand card for the radar's selected coin. */
export function SelectedCoinCard({ rc, onOpen }: { rc: RadarCoin; onOpen: () => void }) {
  const c = rc.coin;
  const tone = leanTone(rc.long);
  const chg = use24hChange(rc.symbol);
  const longPct = c.longPct ?? rc.pct;
  return (
    <div
      className="relative flex flex-col gap-[18px] overflow-hidden rounded-[18px] border bg-[linear-gradient(180deg,rgba(18,21,40,.92),rgba(9,11,22,.92))] p-[22px]"
      style={{ borderColor: tone.border, boxShadow: `0 0 40px ${tone.shadow}` }}
    >
      <div className="pointer-events-none absolute -top-[60px] -right-[60px] size-[220px] rounded-full opacity-[.12] blur-[50px]" style={{ background: tone.color }} />

      <div className="relative flex items-center gap-3.5">
        <span
          className="grid size-[54px] shrink-0 place-items-center rounded-full"
          style={{ border: `2px solid ${tone.color}`, boxShadow: `0 0 22px ${tone.shadow}`, background: DECK.logoBg }}
        >
          <CoinLogo symbol={rc.symbol} size={46} />
        </span>
        <div className="flex min-w-0 flex-col gap-[3px]">
          <div className="flex items-baseline gap-2.5">
            <span className="font-display text-[24px] font-bold">{rc.symbol}</span>
          </div>
          <div className="flex flex-wrap items-baseline gap-x-2.5 font-mono">
            <span className="text-[17px] text-ink">{fmtPrice(c.mark)}</span>
            {chg !== null && (
              <span className="text-[12px] whitespace-nowrap" style={{ color: chg >= 0 ? DECK.long : DECK.short }}>
                {fmtPct(chg, { digits: 2, sign: true })} 24h
              </span>
            )}
          </div>
        </div>
        <div
          className="ml-auto shrink-0 rounded-[20px] border px-2.5 py-[5px] font-display text-[11px] font-bold tracking-[.08em]"
          style={{ color: tone.color, borderColor: tone.color, background: tone.tint }}
        >
          {tone.label}
        </div>
      </div>

      <div className="relative flex flex-col gap-2">
        <div className="flex justify-between font-mono text-[12px]">
          <span className="text-long">LONG {fmtPct(longPct)}</span>
          <span className="text-short">{fmtPct(100 - longPct)} SHORT</span>
        </div>
        <LsBar longPct={longPct} variant="glow" />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-[10.5px] tracking-[.12em] text-ink-muted">30D PERCENTILE</span>
          <span className="font-display text-[26px] font-bold" style={{ color: tone.color, textShadow: `0 0 14px ${tone.color}` }}>
            {c.pctile30d === null ? "—" : Math.round(c.pctile30d)}
          </span>
        </div>
        {c.pctile30d === null ? (
          <div className="h-1.5 rounded-[6px] bg-[linear-gradient(90deg,#ff2d75,#3a3f63_50%,#00f5d4)] opacity-40" />
        ) : (
          <PctileGauge value={c.pctile30d} color={tone.color} />
        )}
        <div className="flex justify-between font-mono text-[10px] text-ink-dim">
          <span>30D LOW</span>
          <span>MEDIAN</span>
          <span>30D HIGH</span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5" />

      <div className="grid grid-cols-2 gap-2.5">
        <MiniStat label="Gross notional">{fmtUsd(c.grossUsd)}</MiniStat>
        <MiniStat label="Net">
          <span style={{ color: signColor(c.netUsd) }}>{fmtUsd(c.netUsd, { sign: true })}</span>
        </MiniStat>
        <MiniStat label="Net ex-MM">
          <span style={{ color: signColor(c.directionalNetUsd) }}>{fmtUsd(c.directionalNetUsd, { sign: true })}</span>
        </MiniStat>
        <MiniStat label="Whales L / S">
          <span className="text-long">{c.nLong ?? "—"}</span> / <span className="text-short">{c.nShort ?? "—"}</span>
        </MiniStat>
      </div>

      <button
        type="button"
        onClick={onOpen}
        className="flex cursor-pointer items-center justify-center gap-2 rounded-[12px] border p-3 font-display text-[13px] font-bold tracking-[.08em] shadow-[0_0_18px_var(--btn-glow)] transition-shadow hover:shadow-[0_0_30px_var(--btn-color)]"
        style={{ borderColor: tone.color, background: tone.tint, color: tone.color, "--btn-glow": tone.shadow, "--btn-color": tone.color } as CSSProperties}
      >
        OPEN {rc.symbol} CHART →
      </button>
    </div>
  );
}

/** "At the extremes": four most long-leaning and four most short-leaning coins by 30-day percentile. */
export function ExtremesPanel({ coins, onSelect }: { coins: RadarCoin[]; onSelect: (symbol: string) => void }) {
  const ranked = coins.filter((c) => !c.usedFallback).sort((a, b) => b.pct - a.pct);
  const topLong = ranked.slice(0, 4);
  const topShort = ranked.slice(-4).reverse();
  const col = (title: string, list: RadarCoin[], long: boolean) => (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="font-mono text-[10px] tracking-[.14em]" style={{ color: long ? DECK.long : DECK.short }}>
        {title}
      </div>
      {list.map((t) => (
        <button
          key={t.symbol}
          type="button"
          onClick={() => onSelect(t.symbol)}
          className={
            long
              ? "flex cursor-pointer items-center gap-2 rounded-[9px] border border-long/14 bg-long/5 px-[9px] py-[7px] text-left transition-colors hover:border-long/40 hover:bg-long/13"
              : "flex cursor-pointer items-center gap-2 rounded-[9px] border border-short/14 bg-short/5 px-[9px] py-[7px] text-left transition-colors hover:border-short/40 hover:bg-short/13"
          }
        >
          <CoinLogo symbol={t.symbol} size={20} />
          <span className="truncate font-display text-[13px] font-semibold">{t.symbol}</span>
          <span className="ml-auto font-mono text-[12px]" style={{ color: long ? DECK.long : DECK.short }}>
            {Math.round(t.pct)}
          </span>
        </button>
      ))}
      {list.length === 0 && <span className="text-[12px] text-ink-dim">No 30-day history yet.</span>}
    </div>
  );
  return (
    <div className="flex flex-col gap-3.5 rounded-[18px] border border-iris/13 bg-panel p-[18px]">
      <div className="font-display text-[15px] font-semibold">At the extremes</div>
      <div className="grid grid-cols-2 gap-2.5">
        {col("MOST LONG", topLong, true)}
        {col("MOST SHORT", topShort, false)}
      </div>
    </div>
  );
}
