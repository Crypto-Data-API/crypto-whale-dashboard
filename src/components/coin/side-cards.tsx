"use client";

import type { ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { ErrorState, GateNotice } from "@/components/common/gate-notice";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { CdaQueryResult } from "@/hooks/use-cda-query";
import { useCoinNews, useFundingOi, useQuantCoin, useWhales } from "@/hooks/use-cda-data";
import { useNow } from "@/hooks/use-now";
import type { ProbBlock } from "@/lib/cda/types";
import { fmtCompact, fmtFrac, fmtPct, fmtPrice, fmtUsd, relTime } from "@/lib/format";
import { cn } from "@/lib/utils";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular text-right">{children}</span>
    </div>
  );
}

/** Shared loading / gate / error handling for a side card body. */
function CardBody<T>({ q, feature, children }: { q: CdaQueryResult<T>; feature: string; children: (data: T) => ReactNode }) {
  if (q.gate !== "ok") return <GateNotice gate={q.gate} requiredTier={q.requiredTier} feature={feature} compact />;
  if (q.isLoading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    );
  }
  if (!q.data) return <ErrorState error={q.error} onRetry={q.refetch} />;
  return <>{children(q.data)}</>;
}

/* ------------------------------------------------------------------ */

export function WhaleSummaryCard({ symbol }: { symbol: string }) {
  const q = useWhales();
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Whale positioning</CardTitle>
        <CardDescription>Hyperliquid whales holding {symbol}</CardDescription>
      </CardHeader>
      <CardContent>
        <CardBody q={q} feature="Whale positioning">
          {(data) => {
            const c = data.coins.find((x) => x.symbol === symbol) ?? data.coins.find((x) => x.symbol.toUpperCase() === symbol.toUpperCase());
            if (!c) return <p className="text-sm text-muted-foreground">{symbol} is not among the coins with tracked whale positions right now.</p>;
            const l = c.longPct ?? 0;
            return (
              <div className="flex flex-col gap-2">
                <div>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="flex items-center gap-1">
                      <span className="size-2 rounded-full bg-long" /> Long {fmtPct(c.longPct)}
                    </span>
                    <span className="flex items-center gap-1">
                      Short {fmtPct(c.longPct === null ? null : 100 - c.longPct)} <span className="size-2 rounded-full bg-short" />
                    </span>
                  </div>
                  <div className="flex h-2 gap-[2px] overflow-hidden rounded-sm" aria-hidden>
                    <div className="rounded-l-sm bg-long" style={{ width: `${l}%` }} />
                    <div className="flex-1 rounded-r-sm bg-short" />
                  </div>
                </div>
                <div>
                  <Row label="Gross notional">{fmtUsd(c.grossUsd)}</Row>
                  <Row label="Long / short">
                    {fmtUsd(c.longUsd)} / {fmtUsd(c.shortUsd)}
                  </Row>
                  <Row label="Net">{fmtUsd(c.netUsd, { sign: true })}</Row>
                  <Row label="Net ex-MM">{fmtUsd(c.directionalNetUsd, { sign: true })}</Row>
                  <Row label="30D percentile">{c.pctile30d === null ? "—" : c.pctile30d.toFixed(1)}</Row>
                  <Row label="Whales long / short">
                    {c.nLong ?? "—"} / {c.nShort ?? "—"}
                  </Row>
                  <Row label="Bias">
                    <span className="capitalize">{c.netBias ?? "—"}</span>
                    {c.dominantSide ? <span className="text-muted-foreground"> · {c.dominantSide} dominant</span> : null}
                  </Row>
                </div>
              </div>
            );
          }}
        </CardBody>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

export function FundingOiCard({ symbol }: { symbol: string }) {
  const q = useFundingOi(symbol);
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Funding & open interest</CardTitle>
        <CardDescription>{q.data?.source === "derivatives/summary" ? "Derivatives summary (fallback)" : "Hyperliquid perp"}</CardDescription>
      </CardHeader>
      <CardContent>
        <CardBody q={q} feature="Funding and open interest">
          {(s) => {
            const f = s.fundingRate;
            const apr = f === null ? null : f * 24 * 365 * 100;
            return (
              <div>
                <Row label="Funding (1h)">
                  {f === null ? "—" : (
                    <>
                      <span className={cn("mr-1 inline-block size-1.5 rounded-full align-middle", f >= 0 ? "bg-long" : "bg-short")} />
                      {(f * 100).toFixed(4)}%
                    </>
                  )}
                </Row>
                <Row label="Funding (annualised)">{fmtPct(apr, { digits: 1, sign: true })}</Row>
                <Row label="Open interest">
                  {fmtUsd(s.openInterestUsd)}
                  {s.openInterest !== null && <span className="text-muted-foreground"> · {fmtCompact(s.openInterest)} {symbol}</span>}
                </Row>
                <Row label="Mark / oracle">
                  {fmtPrice(s.markPrice)} / {fmtPrice(s.oraclePrice)}
                </Row>
                {s.premium !== null && <Row label="Premium">{fmtFrac(s.premium, { digits: 3, sign: true })}</Row>}
                <Row label="24h volume">{fmtUsd(s.dayVolumeUsd)}</Row>
                {s.binance && (
                  <>
                    <div className="mt-2 mb-0.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Binance</div>
                    <Row label="Funding (8h)">{s.binance.fundingRate === null ? "—" : `${(s.binance.fundingRate * 100).toFixed(4)}%`}</Row>
                    <Row label="Accounts long">{fmtPct(s.binance.longPct)}</Row>
                    <Row label="L/S ratio">{s.binance.longShortRatio === null ? "—" : s.binance.longShortRatio.toFixed(2)}</Row>
                  </>
                )}
              </div>
            );
          }}
        </CardBody>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

const DIRECTIONAL: { key: string; label: string; cls: string }[] = [
  { key: "strong_down", label: "Strong down", cls: "bg-short" },
  { key: "mild_down", label: "Mild down", cls: "bg-short/55" },
  { key: "flat", label: "Flat", cls: "bg-muted-foreground/45" },
  { key: "mild_up", label: "Mild up", cls: "bg-long/55" },
  { key: "strong_up", label: "Strong up", cls: "bg-long" },
];

function ProbBars({ block, keys }: { block: ProbBlock | null; keys: string[] }) {
  if (!block) return null;
  return (
    <div className="flex flex-col gap-1">
      {keys
        .filter((k) => typeof block[k] === "number")
        .map((k) => (
          <div key={k} className="grid grid-cols-[6rem_1fr_3rem] items-center gap-2 text-xs">
            <span className="truncate text-muted-foreground capitalize">{k.replace(/_/g, " ")}</span>
            <div className="h-1.5 rounded-full bg-muted">
              <div className="h-full rounded-full bg-transfer" style={{ width: `${Math.round(block[k] * 100)}%` }} />
            </div>
            <span className="tabular text-right">{fmtFrac(block[k], { digits: 0 })}</span>
          </div>
        ))}
    </div>
  );
}

export function QuantCard({ symbol }: { symbol: string }) {
  const q = useQuantCoin(symbol);
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Quant outlook</CardTitle>
        <CardDescription>Regime model probabilities, next {q.data?.horizon ?? "24h"}</CardDescription>
      </CardHeader>
      <CardContent>
        <CardBody q={q} feature="Quant probabilities">
          {(d) => {
            const dir = d.directional;
            const q5 = d.tomorrow?.quantiles.p5;
            const q95 = d.tomorrow?.quantiles.p95;
            return (
              <div className="flex flex-col gap-3">
                {d.regime && (
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium">{d.regime.name ?? d.regime.label}</span>
                    <span className="text-xs text-muted-foreground">{fmtFrac(d.regime.confidence, { digits: 0 })} confidence</span>
                  </div>
                )}
                {dir && (
                  <div>
                    <div className="mb-1 text-xs text-muted-foreground">Direction</div>
                    <div className="flex h-2.5 gap-[2px] overflow-hidden rounded-sm" role="img" aria-label="Directional probabilities">
                      {DIRECTIONAL.map((s) => (
                        <div key={s.key} className={cn("h-full first:rounded-l-sm last:rounded-r-sm", s.cls)} style={{ width: `${(dir[s.key] ?? 0) * 100}%` }} />
                      ))}
                    </div>
                    <div className="mt-1 grid grid-cols-5 text-center text-[10px] text-muted-foreground">
                      {DIRECTIONAL.map((s) => (
                        <span key={s.key} className="tabular">
                          {fmtFrac(dir[s.key] ?? null, { digits: 0 })}
                        </span>
                      ))}
                    </div>
                    <div className="grid grid-cols-5 text-center text-[9px] text-muted-foreground/80">
                      {DIRECTIONAL.map((s) => (
                        <span key={s.key}>{s.label}</span>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <div className="mb-1 text-xs text-muted-foreground">Volatility</div>
                  <ProbBars block={d.volatility} keys={["low", "medium", "high"]} />
                </div>
                {d.tomorrow && (
                  <div>
                    {q5 !== undefined && q95 !== undefined && (
                      <Row label="24h return, 5–95%">
                        {fmtFrac(q5, { digits: 1, sign: true })} to {fmtFrac(q95, { digits: 1, sign: true })}
                      </Row>
                    )}
                    <Row label="P(drawdown > 5%)">{fmtFrac(d.tomorrow.pDrawdownGt5, { digits: 1 })}</Row>
                    <Row label="P(vol spike)">{fmtFrac(d.tomorrow.pVolSpike, { digits: 1 })}</Row>
                  </div>
                )}
              </div>
            );
          }}
        </CardBody>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

export function NewsCard({ symbol }: { symbol: string }) {
  const q = useCoinNews(symbol, 72);
  const now = useNow(60_000);
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>News, last 72h</CardTitle>
        {q.data && (q.data.newsPressure !== null || q.data.newsTilt !== null) && (
          <CardAction className="text-[11px] text-muted-foreground">
            pressure {q.data.newsPressure?.toFixed(2) ?? "—"} · tilt {q.data.newsTilt?.toFixed(2) ?? "—"}
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        <CardBody q={q} feature="Coin news">
          {(d) =>
            d.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">No market-moving stories for {symbol} in the last 72 hours.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {d.items.slice(0, 8).map((n) => (
                  <li key={n.id} className="py-2 first:pt-0 last:pb-0">
                    {n.url ? (
                      <a href={n.url} target="_blank" rel="noreferrer noopener" className="group text-sm leading-snug hover:underline">
                        {n.title}
                        <ExternalLink className="ml-1 inline size-3 text-muted-foreground opacity-0 group-hover:opacity-100" aria-hidden />
                      </a>
                    ) : (
                      <span className="text-sm leading-snug">{n.title}</span>
                    )}
                    <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-muted-foreground">
                      {n.source && <span className="capitalize">{n.source}</span>}
                      <span>{relTime(n.published, now)}</span>
                      {n.category && <span>{n.category}</span>}
                      {n.impactScore !== null && <span>impact {n.impactScore.toFixed(2)}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )
          }
        </CardBody>
      </CardContent>
    </Card>
  );
}
