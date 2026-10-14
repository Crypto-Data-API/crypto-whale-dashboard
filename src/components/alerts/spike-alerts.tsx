"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { DeckSkeleton, ErrorState, GateNotice } from "@/components/common/gate-notice";
import { deckButton } from "@/components/deck/button";
import { CoinLogo } from "@/components/deck/coin-logo";
import { Segmented } from "@/components/deck/segmented";
import { useSpikeAlerts } from "@/hooks/use-cda-data";
import { useNow } from "@/hooks/use-now";
import type { ExchangeFlowSpike } from "@/lib/cda/types";
import { fmtCompact, fmtInt, fmtUsd, relTime } from "@/lib/format";
import { DECK } from "@/lib/palette";

const MIN_AMOUNTS = [1_000_000, 5_000_000, 10_000_000, 25_000_000];
const PAGE = 48;

type Dir = "all" | "inflow" | "outflow";

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function SpikeCard({ s, now, onOpen }: { s: ExchangeFlowSpike; now: number; onOpen: () => void }) {
  const out = s.direction === "outflow";
  const known = s.direction === "outflow" || s.direction === "inflow";
  const color = !known ? DECK.blueSoft : out ? DECK.long : DECK.short;
  const glow = !known ? "rgba(125,155,255,.5)" : out ? "rgba(0,245,212,.5)" : "rgba(255,45,117,.5)";
  const border = !known ? "rgba(120,140,255,.13)" : out ? "rgba(0,245,212,.25)" : "rgba(255,45,117,.25)";
  return (
    <button
      type="button"
      onClick={onOpen}
      className="relative flex cursor-pointer flex-col gap-3.5 overflow-hidden rounded-[16px] border bg-[linear-gradient(180deg,rgba(18,21,40,.9),rgba(9,11,22,.9))] p-[18px] text-left transition-shadow hover:shadow-[0_0_30px_rgba(77,124,255,.2)]"
      style={{ borderColor: border }}
    >
      <div className="pointer-events-none absolute -top-10 -right-10 size-[140px] rounded-full opacity-[.12] blur-[36px]" style={{ background: color }} />
      <div className="relative flex items-center gap-2.5">
        <CoinLogo symbol={s.symbol} size={34} style={{ boxShadow: `0 0 14px ${glow}` }} />
        <div className="flex min-w-0 flex-col">
          <span className="font-display text-[16px] font-bold">{s.symbol}</span>
          <span className="truncate text-[11.5px] text-ink-muted">
            {cap(s.exchange ?? "Exchange")} · {relTime(s.ts, now)}
          </span>
        </div>
        <span
          className="ml-auto shrink-0 rounded-[20px] border px-[9px] py-1 font-display text-[10.5px] font-bold tracking-[.08em]"
          style={{ color, borderColor: color }}
        >
          {known ? s.direction.toUpperCase() : "TRANSFER"}
        </span>
      </div>
      <div className="relative flex flex-wrap items-baseline justify-between gap-2.5">
        <span className="font-display text-[30px] leading-tight font-bold" style={{ color, textShadow: `0 0 16px ${glow}` }}>
          {fmtUsd(s.amountUsd)}
        </span>
        <span className="font-mono text-[13px] text-ink">
          {s.amount !== null ? `${fmtCompact(s.amount, 2)} ${s.unit ?? s.symbol}` : (s.unit ?? s.symbol)}
          {s.chain && <span className="text-ink-dim"> on {s.chain.toUpperCase()}</span>}
        </span>
      </div>
    </button>
  );
}

/** Large CEX wallet transfers from /on-chain/exchange-flows/spike-alerts (~10h window). */
export function SpikeAlerts() {
  const router = useRouter();
  const [minAmount, setMinAmount] = useState(MIN_AMOUNTS[0]);
  const [dir, setDir] = useState<Dir>("all");
  const [symbol, setSymbol] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const q = useSpikeAlerts(minAmount);
  const now = useNow(10_000);

  const rows = useMemo(() => {
    const sym = symbol.trim().toUpperCase();
    return (q.data ?? []).filter((r) => (dir === "all" || r.direction === dir) && (!sym || r.symbol.toUpperCase() === sym));
  }, [q.data, dir, symbol]);

  const totals = useMemo(() => {
    let inflow = 0;
    let outflow = 0;
    for (const r of rows) {
      if (r.direction === "inflow") inflow += r.amountUsd ?? 0;
      else if (r.direction === "outflow") outflow += r.amountUsd ?? 0;
    }
    return { inflow, outflow };
  }, [rows]);

  return (
    <>
      <div className="flex flex-col gap-4 rounded-[18px] border border-iris/13 bg-panel p-4 sm:p-5">
        <div className="flex flex-wrap items-end gap-6">
          <div className="flex flex-col gap-2">
            <span className="text-[12px] text-ink-soft">Min transfer</span>
            <Segmented<number>
              variant="mini"
              ariaLabel="Minimum transfer"
              value={minAmount}
              onChange={(v) => {
                setMinAmount(v);
                setLimit(PAGE);
              }}
              options={MIN_AMOUNTS.map((m) => ({ value: m, label: fmtUsd(m) }))}
            />
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-[12px] text-ink-soft">Direction</span>
            <Segmented<Dir>
              variant="filter"
              ariaLabel="Direction"
              value={dir}
              onChange={setDir}
              options={[
                { value: "all", label: "All", dot: DECK.muted },
                { value: "outflow", label: "Outflow", dot: DECK.long },
                { value: "inflow", label: "Inflow", dot: DECK.short },
              ]}
            />
          </div>
          <label className="flex flex-col gap-2">
            <span className="text-[12px] text-ink-soft">Symbol</span>
            <input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder="All"
              className="w-[120px] rounded-[10px] border border-iris/16 bg-field px-3 py-[9px] font-mono text-[12px] text-ink outline-none focus:border-long/40"
            />
          </label>
          <div className="ml-auto flex flex-wrap gap-x-5 gap-y-1 font-mono text-[12px] text-ink-muted">
            <span className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-long shadow-[0_0_8px_#00f5d4]" /> Outflow <span className="text-ink">{fmtUsd(totals.outflow)}</span>
            </span>
            <span className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-short shadow-[0_0_8px_#ff2d75]" /> Inflow <span className="text-ink">{fmtUsd(totals.inflow)}</span>
            </span>
          </div>
        </div>
      </div>

      <p className="m-0 text-[13px] text-ink-muted">
        Large exchange wallet transfers over roughly the last 10 hours. Inflows often precede selling; outflows to self-custody usually read as accumulation.
      </p>

      {q.gate !== "ok" ? (
        <GateNotice gate={q.gate} requiredTier={q.requiredTier} feature="Exchange flow spike alerts" />
      ) : q.isLoading ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3.5">
          {Array.from({ length: 6 }, (_, i) => (
            <DeckSkeleton key={i} className="h-[150px] rounded-[16px]" />
          ))}
        </div>
      ) : q.error && !q.data ? (
        <ErrorState error={q.error} onRetry={q.refetch} />
      ) : rows.length === 0 ? (
        <div className="rounded-[18px] border border-iris/13 bg-panel px-5 py-[60px] text-center text-[14px] text-ink-muted">No spikes match the filters.</div>
      ) : (
        <>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))] gap-3.5">
            {rows.slice(0, limit).map((r, i) => (
              <SpikeCard key={`${r.ts}-${r.symbol}-${r.exchange}-${i}`} s={r} now={now} onOpen={() => router.push(`/coin/${encodeURIComponent(r.symbol)}`)} />
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4 font-mono text-[12px] text-ink-muted">
            <span>
              Showing {fmtInt(Math.min(limit, rows.length))} of {fmtInt(rows.length)} transfers · refreshed every few minutes
            </span>
            {rows.length > limit && (
              <button type="button" onClick={() => setLimit((l) => l + PAGE)} className={deckButton({ variant: "ghost", size: "sm" })}>
                SHOW MORE
              </button>
            )}
          </div>
        </>
      )}
    </>
  );
}
