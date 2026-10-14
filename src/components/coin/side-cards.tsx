"use client";

import type { ReactNode } from "react";
import { DeckSkeleton, ErrorState, GateNotice } from "@/components/common/gate-notice";
import { LsBar } from "@/components/deck/bars";
import { ExternalIcon } from "@/components/deck/icons";
import { KvRow } from "@/components/deck/panel";
import type { CdaQueryResult } from "@/hooks/use-cda-query";
import { useCoinNews, useFundingOi, useQuantCoin, useWhales } from "@/hooks/use-cda-data";
import { useNow } from "@/hooks/use-now";
import type { WhaleCoin } from "@/lib/cda/types";
import { fmtCompact, fmtFrac, fmtPct, fmtPrice, fmtUsd, relTime } from "@/lib/format";
import { DECK, leanTone } from "@/lib/palette";

function signColor(v: number | null | undefined): string {
  return v === null || v === undefined ? DECK.text : v >= 0 ? DECK.long : DECK.short;
}

/** Shared loading / gate / error handling for a side card body. */
function CardBody<T>({ q, feature, children }: { q: CdaQueryResult<T>; feature: string; children: (data: T) => ReactNode }) {
  if (q.gate !== "ok") return <GateNotice gate={q.gate} requiredTier={q.requiredTier} feature={feature} compact />;
  if (q.isLoading) {
    return (
      <div className="flex flex-col gap-2">
        <DeckSkeleton className="h-4 w-full" />
        <DeckSkeleton className="h-4 w-3/4" />
        <DeckSkeleton className="h-4 w-5/6" />
      </div>
    );
  }
  if (!q.data) return <ErrorState error={q.error} onRetry={q.refetch} />;
  return <>{children(q.data)}</>;
}

function SideCard({ title, sub, right, children }: { title: string; sub?: ReactNode; right?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5 rounded-[18px] border border-iris/13 bg-panel p-5">
      <div className="flex items-baseline justify-between gap-2.5">
        <div className="flex flex-col gap-[3px]">
          <div className="font-display text-[16px] font-semibold">{title}</div>
          {sub && <div className="text-[12px] text-ink-muted">{sub}</div>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

/** Finds a coin in the whale snapshot, case-insensitively. */
export function findWhaleCoin(coins: WhaleCoin[] | undefined, symbol: string): WhaleCoin | null {
  if (!coins) return null;
  return coins.find((x) => x.symbol === symbol) ?? coins.find((x) => x.symbol.toUpperCase() === symbol.toUpperCase()) ?? null;
}

/* ------------------------------------------------------------------ */

export function WhaleSummaryCard({ symbol }: { symbol: string }) {
  const q = useWhales();
  const c = findWhaleCoin(q.data?.coins, symbol);
  if (q.gate !== "ok" || q.isLoading || !q.data || !c) {
    return (
      <SideCard title="Whale positioning">
        {q.gate === "ok" && q.data && !c ? (
          <p className="m-0 text-[13px] leading-normal text-ink-muted">{symbol} is not among the coins with tracked whale positions right now.</p>
        ) : (
          <CardBody q={q} feature="Whale positioning">
            {() => null}
          </CardBody>
        )}
      </SideCard>
    );
  }
  const p = c.pctile30d ?? c.longPct;
  const tone = leanTone(p === null ? null : p >= 50);
  const ls = c.longPct;
  const bias = ls === null ? "—" : Math.abs(ls - 50) < 3 ? "Neutral" : ls > 50 ? "Long dominant" : "Short dominant";
  return (
    <div
      className="flex flex-col gap-3.5 rounded-[18px] border bg-[linear-gradient(180deg,rgba(18,21,40,.92),rgba(9,11,22,.92))] p-5"
      style={{ borderColor: tone.border, boxShadow: `0 0 36px ${tone.glowSoft}` }}
    >
      <div className="flex items-center justify-between gap-2.5">
        <div className="font-display text-[16px] font-semibold">Whale positioning</div>
        <span
          className="rounded-[20px] border px-[9px] py-1 font-display text-[10.5px] font-bold tracking-[.08em]"
          style={{ color: tone.color, borderColor: tone.color }}
        >
          {tone.label}
        </span>
      </div>
      {ls !== null && (
        <>
          <div className="flex justify-between font-mono text-[12px]">
            <span className="text-long">LONG {fmtPct(ls)}</span>
            <span className="text-short">{fmtPct(100 - ls)} SHORT</span>
          </div>
          <LsBar longPct={ls} variant="glow" className="h-[9px] bg-transparent" />
        </>
      )}
      <div className="flex flex-col">
        <KvRow k="Gross notional" v={fmtUsd(c.grossUsd)} />
        <KvRow k="Long / short" v={`${fmtUsd(c.longUsd)} / ${fmtUsd(c.shortUsd)}`} />
        <KvRow k="Net" v={fmtUsd(c.netUsd, { sign: true })} color={signColor(c.netUsd)} />
        <KvRow k="Net ex-MM" v={fmtUsd(c.directionalNetUsd, { sign: true })} color={signColor(c.directionalNetUsd)} />
        <KvRow k="30D percentile" v={c.pctile30d === null ? "—" : c.pctile30d.toFixed(1)} color={c.pctile30d === null ? undefined : tone.color} />
        <KvRow k="Whales long / short" v={`${c.nLong ?? "—"} / ${c.nShort ?? "—"}`} />
        <KvRow k="Bias" v={bias} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function FundingOiCard({ symbol }: { symbol: string }) {
  const q = useFundingOi(symbol);
  return (
    <SideCard title="Funding & open interest" right={q.data?.source === "derivatives/summary" ? <span className="font-mono text-[10.5px] text-ink-dim">derivatives summary</span> : undefined}>
      <CardBody q={q} feature="Funding and open interest">
        {(s) => {
          const f = s.fundingRate;
          const apr = f === null ? null : f * 24 * 365 * 100;
          return (
            <div className="flex flex-col">
              <KvRow k="Funding (1h)" v={f === null ? "—" : fmtPct(f * 100, { digits: 4, sign: true })} color={f === null ? undefined : signColor(f)} />
              <KvRow k="Funding (annualised)" v={fmtPct(apr, { digits: 1, sign: true })} />
              <KvRow
                k="Open interest"
                v={
                  <>
                    {fmtUsd(s.openInterestUsd)}
                    {s.openInterest !== null && s.openInterestUsd === null && ` · ${fmtCompact(s.openInterest)} ${symbol}`}
                  </>
                }
              />
              <KvRow k="Mark / oracle" v={`${fmtPrice(s.markPrice)} / ${fmtPrice(s.oraclePrice)}`} />
              <KvRow k="24h volume" v={fmtUsd(s.dayVolumeUsd)} />
              {s.binance && (
                <>
                  <div className="pt-2.5 pb-1 font-mono text-[10px] tracking-[.14em] text-ink-muted">BINANCE</div>
                  <KvRow k="Funding (8h)" v={s.binance.fundingRate === null ? "—" : fmtPct(s.binance.fundingRate * 100, { digits: 4, sign: true })} />
                  <KvRow k="Accounts long" v={fmtPct(s.binance.longPct)} />
                  <KvRow k="L/S ratio" v={s.binance.longShortRatio === null ? "—" : s.binance.longShortRatio.toFixed(2)} />
                </>
              )}
            </div>
          );
        }}
      </CardBody>
    </SideCard>
  );
}

/* ------------------------------------------------------------------ */

const DIRECTION: { key: string; label: string; color: string; glow: string }[] = [
  { key: "strong_down", label: "Strong down", color: "#ff2d75", glow: "#ff2d75" },
  { key: "mild_down", label: "Mild down", color: "rgba(255,45,117,.55)", glow: "rgba(255,45,117,.55)" },
  { key: "flat", label: "Flat", color: "#3a3f63", glow: "transparent" },
  { key: "mild_up", label: "Mild up", color: "rgba(0,245,212,.55)", glow: "rgba(0,245,212,.55)" },
  { key: "strong_up", label: "Strong up", color: "#00f5d4", glow: "#00f5d4" },
];

const VOL: { key: string; label: string }[] = [
  { key: "low", label: "Low" },
  { key: "medium", label: "Medium" },
  { key: "high", label: "High" },
];

function regimeName(s: string): string {
  return s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function QuantCard({ symbol }: { symbol: string }) {
  const q = useQuantCoin(symbol);
  return (
    <div className="flex flex-col gap-3.5 rounded-[18px] border border-iris/13 bg-panel p-5">
      <div className="flex flex-col gap-[3px]">
        <div className="font-display text-[16px] font-semibold">Quant outlook</div>
        <div className="text-[12px] text-ink-muted">Regime model probabilities, next {q.data?.horizon ?? "24h"}</div>
      </div>
      <CardBody q={q} feature="Quant probabilities">
        {(d) => {
          const dir = d.directional;
          const vol = d.volatility;
          const q5 = d.tomorrow?.quantiles.p5;
          const q95 = d.tomorrow?.quantiles.p95;
          const regime = d.regime?.name ?? d.regime?.label ?? null;
          return (
            <>
              {regime && (
                <div className="flex items-baseline justify-between gap-2.5">
                  <span className="font-display text-[20px] font-bold text-azure-soft [text-shadow:0_0_14px_rgba(77,124,255,.6)]">{regimeName(regime)}</span>
                  {d.regime?.confidence != null && <span className="font-mono text-[11.5px] text-ink-muted">{fmtFrac(d.regime.confidence, { digits: 0 })} confidence</span>}
                </div>
              )}
              {dir && (
                <div className="flex flex-col gap-2">
                  <div className="font-mono text-[10px] tracking-[.14em] text-ink-muted">DIRECTION</div>
                  <div className="flex h-2.5 gap-[3px]" role="img" aria-label="Directional probabilities">
                    {DIRECTION.map((s) => (
                      <div
                        key={s.key}
                        className="rounded-[3px]"
                        style={{ flex: Math.max(0.0001, dir[s.key] ?? 0), background: s.color, boxShadow: `0 0 8px ${s.glow}` }}
                      />
                    ))}
                  </div>
                  <div className="grid grid-cols-5 gap-[3px]">
                    {DIRECTION.map((s) => (
                      <div key={s.key} className="flex flex-col items-center gap-px">
                        <span className="font-mono text-[12px] text-ink">{fmtFrac(dir[s.key] ?? null, { digits: 0 })}</span>
                        <span className="text-center text-[10px] text-ink-dim">{s.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {vol && (
                <div className="flex flex-col gap-2">
                  <div className="font-mono text-[10px] tracking-[.14em] text-ink-muted">VOLATILITY</div>
                  {VOL.filter((v) => typeof vol[v.key] === "number").map((v) => (
                    <div key={v.key} className="grid grid-cols-[64px_minmax(0,1fr)_40px] items-center gap-2.5 text-[12.5px]">
                      <span className="text-ink-soft">{v.label}</span>
                      <div className="h-[5px] overflow-hidden rounded-[5px] bg-iris/12">
                        <div className="h-full bg-azure shadow-[0_0_8px_#4d7cff]" style={{ width: `${Math.round(vol[v.key] * 100)}%` }} />
                      </div>
                      <span className="text-right font-mono">{fmtFrac(vol[v.key], { digits: 0 })}</span>
                    </div>
                  ))}
                </div>
              )}
              {d.tomorrow && (
                <div className="flex flex-col">
                  {q5 !== undefined && q95 !== undefined && (
                    <KvRow k="24h return, 5–95%" v={`${fmtFrac(q5, { digits: 1, sign: true })} to ${fmtFrac(q95, { digits: 1, sign: true })}`} />
                  )}
                  <KvRow k="P(drawdown > 5%)" v={fmtFrac(d.tomorrow.pDrawdownGt5, { digits: 1 })} />
                  <KvRow k="P(vol spike)" v={fmtFrac(d.tomorrow.pVolSpike, { digits: 1 })} />
                </div>
              )}
            </>
          );
        }}
      </CardBody>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function NewsCard({ symbol }: { symbol: string }) {
  const q = useCoinNews(symbol, 72);
  const now = useNow(60_000);
  const d = q.data;
  return (
    <SideCard
      title="News, last 72h"
      right={
        d && (d.newsPressure !== null || d.newsTilt !== null) ? (
          <span className="font-mono text-[10.5px] whitespace-nowrap text-ink-dim">
            pressure {d.newsPressure?.toFixed(2) ?? "—"} · tilt {d.newsTilt?.toFixed(2) ?? "—"}
          </span>
        ) : undefined
      }
    >
      <CardBody q={q} feature="Coin news">
        {(n) =>
          n.items.length === 0 ? (
            <p className="m-0 text-[13px] leading-normal text-ink-muted">No market-moving stories for {symbol} in the last 72 hours.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col p-0">
              {n.items.slice(0, 8).map((item) => (
                <li key={item.id} className="border-t border-iris/7 py-2.5 first:border-t-0 first:pt-0">
                  {item.url ? (
                    <a href={item.url} target="_blank" rel="noreferrer noopener" className="group text-[13px] leading-snug text-ink hover:text-long">
                      {item.title}
                      <ExternalIcon size={11} className="ml-1 inline align-baseline text-ink-dim opacity-0 group-hover:opacity-100" />
                    </a>
                  ) : (
                    <span className="text-[13px] leading-snug">{item.title}</span>
                  )}
                  <div className="mt-1 flex flex-wrap gap-x-2 font-mono text-[10.5px] text-ink-dim">
                    {item.source && <span>{item.source}</span>}
                    <span>{relTime(item.published, now)}</span>
                    {item.category && <span>{item.category}</span>}
                    {item.impactScore !== null && <span>impact {item.impactScore.toFixed(2)}</span>}
                  </div>
                </li>
              ))}
            </ul>
          )
        }
      </CardBody>
    </SideCard>
  );
}
