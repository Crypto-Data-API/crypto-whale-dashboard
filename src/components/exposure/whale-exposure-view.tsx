"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { DeckSkeleton, ErrorState } from "@/components/common/gate-notice";
import { LsBar, PctileTrack } from "@/components/deck/bars";
import { CoinLogo } from "@/components/deck/coin-logo";
import { RadarIcon, SearchIcon } from "@/components/deck/icons";
import { PageHead, RefreshButton, UpdatedAgo } from "@/components/deck/page-head";
import { PanelSub, PanelTitle } from "@/components/deck/panel";
import { Segmented } from "@/components/deck/segmented";
import { DemoBanner, type DemoReason } from "@/components/radar/demo-banner";
import { useAccess } from "@/hooks/use-access";
import { useWhales } from "@/hooks/use-cda-data";
import { DEMO_WHALE_COINS } from "@/lib/cda/demo";
import type { WhaleCoin } from "@/lib/cda/types";
import { fmtPct, fmtPrice, fmtUsd } from "@/lib/format";
import { DECK } from "@/lib/palette";
import { cn } from "@/lib/utils";

/**
 * Column grid from the design minus its 24h column: there is no per-coin
 * 24h change in the whale or open-interest data the app loads.
 */
const GRID = "minmax(170px,1.5fr) 1fr .8fr minmax(210px,2fr) .9fr .9fr minmax(150px,1.2fr) .9fr";

type SortKey = "coin" | "mark" | "gross" | "ls" | "net" | "netExMm" | "pctile" | "accounts";
type Lean = "all" | "long" | "short";

const COLS: { key: SortKey; label: string; justify: "flex-start" | "flex-end" }[] = [
  { key: "coin", label: "Coin", justify: "flex-start" },
  { key: "mark", label: "Mark", justify: "flex-end" },
  { key: "gross", label: "Gross", justify: "flex-end" },
  { key: "ls", label: "Long / Short", justify: "flex-start" },
  { key: "net", label: "Net", justify: "flex-end" },
  { key: "netExMm", label: "Net ex-MM", justify: "flex-end" },
  { key: "pctile", label: "30D pctile", justify: "flex-end" },
  { key: "accounts", label: "#L / #S", justify: "flex-end" },
];

function leanOf(c: WhaleCoin): number | null {
  return c.pctile30d ?? c.longPct;
}

function sortValue(c: WhaleCoin, key: SortKey): number | string | null {
  switch (key) {
    case "coin":
      return c.symbol;
    case "mark":
      return c.mark;
    case "gross":
      return c.grossUsd;
    case "ls":
      return c.longPct;
    case "net":
      return c.netUsd;
    case "netExMm":
      return c.directionalNetUsd;
    case "pctile":
      return c.pctile30d;
    case "accounts":
      return (c.nLong ?? 0) + (c.nShort ?? 0);
  }
}

function signColor(v: number | null): string {
  return v === null ? DECK.dim : v >= 0 ? DECK.long : DECK.short;
}

function ExposureTable({ coins }: { coins: WhaleCoin[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [lean, setLean] = useState<Lean>("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "gross", dir: -1 });

  const rows = useMemo(() => {
    const q = query.trim().toUpperCase();
    const out = coins.filter((c) => {
      if (q && !c.symbol.toUpperCase().includes(q)) return false;
      const p = leanOf(c);
      if (lean === "long" && !(p !== null && p >= 50)) return false;
      if (lean === "short" && !(p !== null && p < 50)) return false;
      return true;
    });
    out.sort((a, b) => {
      const av = sortValue(a, sort.key);
      const bv = sortValue(b, sort.key);
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      if (typeof av === "string" || typeof bv === "string") return String(av).localeCompare(String(bv)) * sort.dir;
      return (av - bv) * sort.dir;
    });
    return out;
  }, [coins, query, lean, sort]);

  const onSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === "coin" ? 1 : -1 }));
  const open = (symbol: string) => router.push(`/coin/${encodeURIComponent(symbol)}`);

  return (
    <section className="flex flex-col gap-4 rounded-[18px] border border-iris/13 bg-panel p-4 sm:p-[22px]">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <PanelTitle>Coins by whale exposure</PanelTitle>
          <PanelSub>Sort any column · click a row to open its chart · the radar button finds it on the radar</PanelSub>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2.5">
          <div className="flex w-[200px] items-center gap-2 rounded-[10px] border border-iris/16 bg-field px-3 py-2 focus-within:border-long/40">
            <SearchIcon size={13} stroke={DECK.muted} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter coins"
              aria-label="Filter coins"
              className="min-w-0 flex-1 border-0 bg-transparent font-sans text-[12.5px] text-ink outline-none"
            />
          </div>
          <Segmented<Lean>
            variant="filter"
            ariaLabel="Lean filter"
            value={lean}
            onChange={setLean}
            options={[
              { value: "all", label: "All", dot: DECK.muted },
              { value: "long", label: "Long", dot: DECK.long },
              { value: "short", label: "Short", dot: DECK.short },
            ]}
          />
          <span className="font-mono text-[12px] text-ink-muted">
            {rows.length} of {coins.length}
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="flex min-w-[980px] flex-col" role="table" aria-label="Coins by whale exposure">
          <div className="grid gap-3.5 border-b border-iris/14 px-3.5 py-2.5" style={{ gridTemplateColumns: GRID }} role="row">
            {COLS.map((c) => {
              const active = sort.key === c.key;
              return (
                <button
                  key={c.key}
                  type="button"
                  role="columnheader"
                  aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
                  onClick={() => onSort(c.key)}
                  className="flex cursor-pointer items-center gap-[5px] border-0 bg-transparent p-0 font-mono text-[10.5px] tracking-[.1em] uppercase select-none hover:text-ink"
                  style={{ justifyContent: c.justify, color: active ? DECK.long : DECK.muted }}
                >
                  {c.label}
                  <span className="text-[10px]">{active ? (sort.dir < 0 ? "↓" : "↑") : "↕"}</span>
                </button>
              );
            })}
          </div>
          {rows.map((c) => {
            const p = leanOf(c);
            const long = p === null ? null : p >= 50;
            const leanColor = long === null ? DECK.dim : long ? DECK.long : DECK.short;
            const leanGlow = long === null ? "transparent" : long ? "rgba(0,245,212,.25)" : "rgba(255,45,117,.25)";
            return (
              <div
                key={c.symbol}
                role="row"
                tabIndex={0}
                onClick={() => open(c.symbol)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") open(c.symbol);
                }}
                className="grid cursor-pointer items-center gap-3.5 border-b border-iris/7 px-3.5 py-[11px] transition-colors outline-none hover:bg-azure/8 focus-visible:bg-azure/8"
                style={{ gridTemplateColumns: GRID }}
              >
                <div className="flex min-w-0 items-center gap-[11px]" role="cell">
                  <CoinLogo symbol={c.symbol} size={30} style={{ boxShadow: `0 0 0 1px rgba(255,255,255,.08), 0 0 12px ${leanGlow}` }} />
                  <span className="truncate font-display text-[14px] font-bold">{c.symbol}</span>
                  <Link
                    href={`/?sel=${encodeURIComponent(c.symbol)}`}
                    onClick={(e) => e.stopPropagation()}
                    title={`Show ${c.symbol} on the radar`}
                    aria-label={`Show ${c.symbol} on the radar`}
                    className="mr-1 ml-auto grid size-[26px] shrink-0 place-items-center rounded-[8px] border border-iris/16 text-ink-dim transition-colors hover:border-long/40 hover:text-long"
                  >
                    <RadarIcon size={14} />
                  </Link>
                </div>
                <div className="text-right font-mono text-[13px]" role="cell">
                  {fmtPrice(c.mark)}
                </div>
                <div className="text-right font-mono text-[13px] font-semibold" role="cell">
                  {fmtUsd(c.grossUsd)}
                </div>
                <div className="flex items-center gap-2.5" role="cell">
                  {c.longPct === null ? (
                    <span className="font-mono text-[12px] text-ink-dim">—</span>
                  ) : (
                    <>
                      <LsBar longPct={c.longPct} />
                      <span className="w-11 text-right font-mono text-[12px] text-ink-soft">{fmtPct(c.longPct)}</span>
                    </>
                  )}
                </div>
                <div className="text-right font-mono text-[13px]" style={{ color: signColor(c.netUsd) }} role="cell">
                  {fmtUsd(c.netUsd, { sign: true })}
                </div>
                <div className="text-right font-mono text-[13px]" style={{ color: signColor(c.directionalNetUsd) }} role="cell">
                  {fmtUsd(c.directionalNetUsd, { sign: true })}
                </div>
                <div className="flex items-center justify-end gap-2.5" role="cell">
                  {c.pctile30d === null ? (
                    <span className="font-mono text-[12px] text-ink-dim">—</span>
                  ) : (
                    <>
                      <PctileTrack value={c.pctile30d} />
                      <span className="w-[26px] text-right font-display text-[15px] font-bold" style={{ color: leanColor }}>
                        {Math.round(c.pctile30d)}
                      </span>
                    </>
                  )}
                </div>
                <div className="text-right font-mono text-[13px]" role="cell">
                  <span className="text-long">{c.nLong ?? "—"}</span>
                  <span className="text-ink-dim"> / </span>
                  <span className="text-short">{c.nShort ?? "—"}</span>
                </div>
              </div>
            );
          })}
          {rows.length === 0 && <div className="px-5 py-12 text-center text-[14px] text-ink-muted">No coins match the filter.</div>}
        </div>
      </div>
      <p className={cn("m-0 text-[11.5px] text-ink-dim")}>Net ex-MM excludes market-maker books. 30D pctile ranks today&apos;s long share against the coin&apos;s last 30 days.</p>
    </section>
  );
}

export function WhaleExposureView() {
  const access = useAccess();
  const whales = useWhales();
  const gate = whales.gate;
  const data = whales.data;

  const header = (
    <PageHead
      title="Whale Exposure"
      right={
        gate === "ok" && (
          <>
            <UpdatedAgo ts={data?.positionsAsOf ?? data?.timestamp ?? (whales.dataUpdatedAt || null)} />
            <RefreshButton onClick={whales.refetch} busy={whales.isFetching} />
          </>
        )
      }
    />
  );

  if (gate === "loading" || (gate === "ok" && whales.isLoading && !data)) {
    return (
      <>
        {header}
        <section className="flex flex-col gap-2 rounded-[18px] border border-iris/13 bg-panel p-[22px]">
          {Array.from({ length: 10 }, (_, i) => (
            <DeckSkeleton key={i} className="h-11" />
          ))}
        </section>
      </>
    );
  }

  if (gate !== "ok") {
    const reason: DemoReason = access.demoMode && gate === "no-key" ? "demo" : gate;
    return (
      <>
        {header}
        <DemoBanner reason={reason} />
        <ExposureTable coins={DEMO_WHALE_COINS} />
      </>
    );
  }

  return (
    <>
      {header}
      {whales.error && <ErrorState error={whales.error} onRetry={whales.refetch} />}
      {data && <ExposureTable coins={data.coins} />}
    </>
  );
}
