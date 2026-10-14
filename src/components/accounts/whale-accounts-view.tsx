"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { DeckSkeleton, ErrorState, GateNotice } from "@/components/common/gate-notice";
import { LsBar } from "@/components/deck/bars";
import { Chip } from "@/components/deck/chip";
import { CoinLogo } from "@/components/deck/coin-logo";
import { ExternalIcon, SearchIcon } from "@/components/deck/icons";
import { KpiTile } from "@/components/deck/kpi-tile";
import { PageHead, RefreshButton } from "@/components/deck/page-head";
import { PanelSub, PanelTitle } from "@/components/deck/panel";
import { Segmented } from "@/components/deck/segmented";
import { useTraderProfiles, useWhaleAccounts } from "@/hooks/use-cda-data";
import { useNow } from "@/hooks/use-now";
import type { TraderProfile, WalletPosition, WhaleAccount } from "@/lib/cda/types";
import { fmtInt, fmtPct, fmtPrice, fmtUsd, relTime, shortAddress } from "@/lib/format";
import { DECK } from "@/lib/palette";
import { useSettings } from "@/stores/settings";

type Window = "day" | "week" | "month" | "allTime";
const WINDOWS: { value: Window; label: string }[] = [
  { value: "day", label: "24h" },
  { value: "week", label: "7d" },
  { value: "month", label: "30d" },
  { value: "allTime", label: "All" },
];

type SortKey = "wallet" | "score" | "accountValue" | "exposure" | "positions" | "pnl" | "roi" | "volume" | "winRate";
const HIGH_LEVERAGE = 20;
const GRID = "22px minmax(230px,2fr) 150px 64px 96px minmax(170px,1.4fr) 150px 96px 76px 86px 110px";
const POS_GRID = "minmax(120px,1.2fr) 80px repeat(5,minmax(80px,1fr))";

/** Trader types the profile endpoint uses, with friendlier labels. */
const TYPE_LABEL: Record<string, string> = {
  market_maker: "Market maker",
  hft: "HFT",
  scalper: "Scalper",
  day_trader: "Day trader",
  swing_trader: "Swing trader",
  position_trader: "Position trader",
  speculator: "Speculator",
};

function typeLabel(t: string): string {
  return TYPE_LABEL[t] ?? t.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/** Type pill colours from the design; other types use the muted style. */
const TYPE_STYLE: Record<string, [string, string, string]> = {
  "Swing trader": ["#7d9bff", "rgba(125,155,255,.1)", "rgba(125,155,255,.35)"],
  "Day trader": ["#b18cff", "rgba(177,140,255,.1)", "rgba(177,140,255,.35)"],
  "Position trader": ["#00f5d4", "rgba(0,245,212,.08)", "rgba(0,245,212,.35)"],
};
const TYPE_MUTED: [string, string, string] = ["#6d7399", "transparent", "rgba(120,140,255,.15)"];

type Row = WhaleAccount & { profile: TraderProfile | null; netUsd: number; grossUsd: number };

function signColor(v: number | null): string {
  return v === null ? DECK.dim : v > 0 ? DECK.long : v < 0 ? DECK.short : DECK.text;
}

/** Mark price implied by entry, unrealised PnL and size (no mark is published per position). */
function impliedMark(p: WalletPosition): number | null {
  if (p.entryPrice === null || p.unrealizedPnl === null || !p.size || p.side === "unknown") return null;
  const dir = p.side === "long" ? 1 : -1;
  const mark = p.entryPrice + (dir * p.unrealizedPnl) / p.size;
  return mark > 0 ? mark : null;
}

function PositionsPanel({ positions }: { positions: WalletPosition[] }) {
  const sorted = [...positions].sort((a, b) => (b.notionalUsd ?? 0) - (a.notionalUsd ?? 0));
  return (
    <div className="mx-3.5 mb-3.5 ml-[50px] rounded-[12px] border border-iris/14 bg-[rgba(5,6,11,.6)] px-3.5 py-1.5">
      <div className="grid gap-3 py-2 font-mono text-[10px] tracking-[.1em] text-ink-dim" style={{ gridTemplateColumns: POS_GRID }}>
        <span>COIN</span>
        <span>SIDE</span>
        <span className="text-right">SIZE</span>
        <span className="text-right">ENTRY</span>
        <span className="text-right">MARK</span>
        <span className="text-right">UPNL</span>
        <span className="text-right">LIQ. PRICE</span>
      </div>
      {sorted.map((p, i) => {
        const color = p.side === "long" ? DECK.long : p.side === "short" ? DECK.short : DECK.muted;
        return (
          <div key={`${p.coin}-${i}`} className="grid items-center gap-3 border-t border-iris/7 py-[9px] font-mono text-[12.5px]" style={{ gridTemplateColumns: POS_GRID }}>
            <Link href={`/coin/${encodeURIComponent(p.coin)}`} className="flex min-w-0 items-center gap-2 text-ink hover:text-long">
              <CoinLogo symbol={p.coin} size={22} />
              <span className="truncate font-display text-[13.5px] font-bold">{p.coin}</span>
              {p.leverage !== null && <span className="text-[11px] text-gold">{p.leverage}x</span>}
            </Link>
            <span className="justify-self-start rounded-[5px] border px-2 py-0.5 text-[10.5px] font-semibold tracking-[.06em]" style={{ color, borderColor: color }}>
              {p.side.toUpperCase()}
            </span>
            <span className="text-right">{fmtUsd(p.notionalUsd)}</span>
            <span className="text-right text-ink-soft">{fmtPrice(p.entryPrice)}</span>
            <span className="text-right">{fmtPrice(impliedMark(p))}</span>
            <span className="text-right" style={{ color: signColor(p.unrealizedPnl) }}>
              {fmtUsd(p.unrealizedPnl, { sign: true })}
            </span>
            <span className="text-right text-ink-soft">{fmtPrice(p.liquidationPrice)}</span>
          </div>
        );
      })}
      {sorted.length === 0 && <div className="py-3 text-[12.5px] text-ink-dim">No open positions right now.</div>}
    </div>
  );
}

function fmtRefresh(sec: number): string {
  return sec % 60 === 0 ? `${sec / 60}m` : `${sec}s`;
}

export function WhaleAccountsView() {
  const accounts = useWhaleAccounts();
  const profiles = useTraderProfiles();
  const whalesSec = useSettings((s) => s.refresh.whalesSec);
  const now = useNow(15_000);

  const [window, setWindow] = useState<Window>("day");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "exposure", desc: true });
  const [types, setTypes] = useState<Set<string>>(new Set());
  const [flags, setFlags] = useState({ positions: false, highLev: false, netLong: false, netShort: false });
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState<string | null>(null);

  const rows = useMemo<Row[]>(() => {
    const list = accounts.data?.accounts ?? [];
    const prof = profiles.data ?? {};
    return list.map((a) => ({ ...a, profile: prof[a.address] ?? null, netUsd: a.longUsd - a.shortUsd, grossUsd: a.longUsd + a.shortUsd }));
  }, [accounts.data, profiles.data]);

  const typeOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) {
      const t = r.profile?.traderType;
      if (t) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = rows.filter((r) => {
      if (types.size && !(r.profile?.traderType && types.has(r.profile.traderType))) return false;
      if (flags.positions && r.positions.length === 0) return false;
      if (flags.highLev && (r.maxLeverage ?? 0) < HIGH_LEVERAGE) return false;
      if (flags.netLong && r.netUsd <= 0) return false;
      if (flags.netShort && r.netUsd >= 0) return false;
      if (q) {
        const coins = r.positions.map((p) => p.coin.toLowerCase());
        if (!r.address.includes(q) && !(r.displayName ?? "").toLowerCase().includes(q) && !coins.some((c) => c === q || c.startsWith(q))) return false;
      }
      return true;
    });
    if (sort.key === "wallet") {
      out.sort((a, b) => (a.displayName ?? a.address).localeCompare(b.displayName ?? b.address) * (sort.desc ? -1 : 1));
      return out;
    }
    const val = (r: Row): number | null => {
      switch (sort.key) {
        case "score":
          return r.score;
        case "accountValue":
          return r.accountValue;
        case "pnl":
          return r.pnl[window];
        case "roi":
          return r.roi[window];
        case "volume":
          return r.volume[window];
        case "exposure":
          return r.grossUsd;
        case "positions":
          return r.positions.length;
        case "winRate":
          return r.profile?.winRate ?? null;
        default:
          return null;
      }
    };
    out.sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return sort.desc ? bv - av : av - bv;
    });
    return out;
  }, [rows, types, flags, query, sort, window]);

  const totals = useMemo(() => {
    let value = 0;
    let long = 0;
    let short = 0;
    let withPositions = 0;
    for (const r of rows) {
      value += r.accountValue ?? 0;
      long += r.longUsd;
      short += r.shortUsd;
      if (r.positions.length) withPositions++;
    }
    return { value, long, short, net: long - short, withPositions };
  }, [rows]);

  const onSort = (k: SortKey) => setSort((s) => (s.key === k ? { key: k, desc: !s.desc } : { key: k, desc: k !== "wallet" }));
  const toggleOpen = (addr: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(addr)) n.delete(addr);
      else n.add(addr);
      return n;
    });
  const toggleType = (t: string) =>
    setTypes((s) => {
      const n = new Set(s);
      if (n.has(t)) n.delete(t);
      else n.add(t);
      return n;
    });
  const copy = async (addr: string) => {
    try {
      await navigator.clipboard.writeText(addr);
      setCopied(addr);
      setTimeout(() => setCopied((c) => (c === addr ? null : c)), 1400);
    } catch {
      toast.error("Could not copy");
    }
  };

  const loading = accounts.isLoading && !accounts.data;
  const updated = accounts.data?.updatedAt ?? (accounts.dataUpdatedAt || null);
  const winLabel = WINDOWS.find((w) => w.value === window)?.label ?? "";

  const cols: { key: SortKey | null; label: string; end: boolean }[] = [
    { key: "wallet", label: "Wallet", end: false },
    { key: null, label: "Type", end: false },
    { key: "score", label: "Score", end: true },
    { key: "accountValue", label: "Account", end: true },
    { key: "exposure", label: "Exposure L / S", end: false },
    { key: "positions", label: "Positions", end: true },
    { key: "pnl", label: `PnL ${winLabel}`, end: true },
    { key: "roi", label: "ROI", end: true },
    { key: "volume", label: "Volume", end: true },
    { key: "winRate", label: "Win rate", end: true },
  ];

  const header = <PageHead title="Whale Accounts" right={<RefreshButton onClick={() => accounts.refetch()} busy={accounts.isFetching} />} />;

  if (accounts.gate !== "ok" && accounts.gate !== "loading") {
    return (
      <>
        {header}
        <GateNotice gate={accounts.gate} requiredTier={accounts.requiredTier} feature="Whale accounts" />
      </>
    );
  }
  if (accounts.error && !accounts.data) {
    return (
      <>
        {header}
        <ErrorState error={accounts.error} onRetry={() => accounts.refetch()} />
      </>
    );
  }

  return (
    <>
      {header}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
        <KpiTile
          variant="top"
          label="Wallets tracked"
          loading={loading}
          value={fmtInt(rows.length)}
          sub={`${fmtInt(accounts.data?.trackedCount ?? totals.withPositions)} with live positions`}
          color={DECK.blue}
        />
        <KpiTile variant="top" label="Combined account value" loading={loading} value={fmtUsd(totals.value)} sub="across all wallets" color={DECK.blue} />
        <KpiTile variant="top" label="Open long notional" loading={loading} value={fmtUsd(totals.long)} sub="gross" color={DECK.long} valColor={DECK.long} />
        <KpiTile variant="top" label="Open short notional" loading={loading} value={fmtUsd(totals.short)} sub="gross" color={DECK.short} valColor={DECK.short} />
        <KpiTile
          variant="top"
          label="Net exposure"
          loading={loading}
          value={fmtUsd(totals.net, { sign: true })}
          sub={totals.net >= 0 ? "net long" : "net short"}
          color={totals.net >= 0 ? DECK.long : DECK.short}
          valColor={totals.net >= 0 ? DECK.long : DECK.short}
        />
        <KpiTile variant="top" label="Updated" loading={loading} value={relTime(updated, now)} sub={`auto-refresh ${fmtRefresh(whalesSec)}`} color={DECK.blue} />
      </div>

      <section className="flex flex-col gap-4 rounded-[18px] border border-iris/13 bg-panel p-4 sm:p-[22px]">
        <div className="flex flex-col gap-1">
          <PanelTitle>Wallets</PanelTitle>
          <PanelSub>
            Click a row to see open positions. Trader type comes from each wallet&apos;s 30-day fill history
            {profiles.gate === "upgrade" ? " (needs a Pro key)" : ""}.
          </PanelSub>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex w-[220px] items-center gap-2 rounded-[10px] border border-iris/16 bg-field px-3 py-2 focus-within:border-long/40">
            <SearchIcon size={13} stroke={DECK.muted} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Address or coin"
              aria-label="Filter by address or coin"
              className="min-w-0 flex-1 border-0 bg-transparent font-sans text-[12.5px] text-ink outline-none"
            />
          </div>
          <span className="ml-1.5 text-[12px] text-ink-muted">Type</span>
          {typeOptions.length === 0 ? (
            <span className="text-[12px] text-ink-dim">{profiles.isLoading ? "loading…" : profiles.gate === "upgrade" ? "Pro only" : "n/a"}</span>
          ) : (
            typeOptions.map(([t, n]) => (
              <Chip key={t} active={types.has(t)} onClick={() => toggleType(t)} count={n}>
                {typeLabel(t)}
              </Chip>
            ))
          )}
          <span className="mx-1.5 h-[22px] w-px bg-iris/18" aria-hidden />
          <Chip active={flags.positions} onClick={() => setFlags((f) => ({ ...f, positions: !f.positions }))}>
            In a position
          </Chip>
          <Chip active={flags.highLev} onClick={() => setFlags((f) => ({ ...f, highLev: !f.highLev }))}>
            High leverage ≥{HIGH_LEVERAGE}x
          </Chip>
          <Chip active={flags.netLong} onClick={() => setFlags((f) => ({ ...f, netLong: !f.netLong, netShort: false }))}>
            Net long
          </Chip>
          <Chip active={flags.netShort} onClick={() => setFlags((f) => ({ ...f, netShort: !f.netShort, netLong: false }))}>
            Net short
          </Chip>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[12px] text-ink-muted">PnL window</span>
            <Segmented<Window> variant="mini" ariaLabel="PnL window" value={window} onChange={setWindow} options={WINDOWS} itemClassName="px-2.5 text-[11.5px]" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="flex min-w-[1240px] flex-col" role="table" aria-label="Whale wallets">
            <div className="grid gap-3.5 border-b border-iris/14 px-3.5 py-2.5" style={{ gridTemplateColumns: GRID }} role="row">
              <span />
              {cols.map((c) => {
                const active = c.key !== null && sort.key === c.key;
                return (
                  <button
                    key={c.label}
                    type="button"
                    role="columnheader"
                    disabled={c.key === null}
                    aria-sort={active ? (sort.desc ? "descending" : "ascending") : undefined}
                    onClick={() => c.key && onSort(c.key)}
                    className="flex items-center gap-[5px] border-0 bg-transparent p-0 font-mono text-[10.5px] tracking-[.1em] uppercase select-none enabled:cursor-pointer enabled:hover:text-ink disabled:cursor-default"
                    style={{ justifyContent: c.end ? "flex-end" : "flex-start", color: active ? DECK.long : DECK.muted }}
                  >
                    {c.label}
                    <span className="text-[10px]">{c.key === null ? "" : active ? (sort.desc ? "↓" : "↑") : "↕"}</span>
                  </button>
                );
              })}
            </div>

            {loading &&
              Array.from({ length: 8 }, (_, i) => (
                <div key={i} className="border-b border-iris/7 px-3.5 py-3">
                  <DeckSkeleton className="h-9" />
                </div>
              ))}

            {!loading &&
              filtered.map((r) => {
                const isOpen = open.has(r.address);
                const t = r.profile?.traderType ? typeLabel(r.profile.traderType) : null;
                const [tc, tb, tbd] = t ? (TYPE_STYLE[t] ?? TYPE_MUTED) : TYPE_MUTED;
                const pnl = r.pnl[window];
                const roi = r.roi[window];
                const pnlColor = signColor(pnl);
                const highLev = (r.maxLeverage ?? 0) >= HIGH_LEVERAGE;
                const stack = [...r.positions].sort((a, b) => (b.notionalUsd ?? 0) - (a.notionalUsd ?? 0)).slice(0, 4);
                const pf = r.profile?.profitFactor ?? null;
                return (
                  <div key={r.address} className="flex flex-col border-b border-iris/7" style={{ background: isOpen ? "rgba(77,124,255,.05)" : "transparent" }}>
                      <div
                        role="row"
                        tabIndex={0}
                        aria-expanded={isOpen}
                        onClick={() => toggleOpen(r.address)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggleOpen(r.address);
                          }
                        }}
                        className="grid cursor-pointer items-center gap-3.5 px-3.5 py-3 transition-colors outline-none hover:bg-azure/7 focus-visible:bg-azure/7"
                        style={{ gridTemplateColumns: GRID }}
                      >
                        <span className="inline-block text-[12px] text-ink-muted transition-transform duration-200" style={{ transform: `rotate(${isOpen ? 90 : 0}deg)` }}>
                          ▶
                        </span>
                        <div className="flex min-w-0 flex-col gap-1">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="truncate font-mono text-[13.5px] font-semibold text-ink-bright">{r.displayName ?? shortAddress(r.address)}</span>
                            <button
                              type="button"
                              title="Copy address"
                              aria-label="Copy address"
                              onClick={(e) => {
                                e.stopPropagation();
                                void copy(r.address);
                              }}
                              className="cursor-pointer border-0 bg-transparent px-1 py-0 text-[12px] text-ink-dim hover:text-long"
                            >
                              {copied === r.address ? "✓" : "⧉"}
                            </button>
                            <a
                              href={`https://app.hyperliquid.xyz/explorer/address/${r.address}`}
                              target="_blank"
                              rel="noreferrer"
                              title="Open in Hyperliquid explorer"
                              aria-label="Open in Hyperliquid explorer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-ink-dim hover:text-long"
                            >
                              <ExternalIcon size={12} />
                            </a>
                          </div>
                          <span className="truncate text-[11px] text-azure-soft">{r.profile?.edges.length ? r.profile.edges.map((e) => e.replace(/_/g, " ")).join(" · ") : " "}</span>
                        </div>
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate rounded-[7px] border px-[9px] py-1 text-[12px] font-semibold" style={{ color: tc, background: tb, borderColor: tbd }}>
                            {t ?? "—"}
                          </span>
                          {highLev && (
                            <span className="shrink-0 rounded-[6px] border border-gold/35 bg-gold/10 px-[7px] py-[3px] font-mono text-[11px] font-semibold text-gold">
                              {r.maxLeverage}x
                            </span>
                          )}
                        </div>
                        <span className="text-right font-display text-[15px] font-bold" style={{ color: r.score !== null && r.score >= 95 ? DECK.long : DECK.text }}>
                          {r.score === null ? "—" : r.score.toFixed(r.score >= 100 ? 0 : 1)}
                        </span>
                        <span className="text-right font-mono text-[13px] font-semibold">{fmtUsd(r.accountValue)}</span>
                        <div className="flex items-center gap-2.5">
                          {r.grossUsd > 0 ? (
                            <>
                              <LsBar longPct={(r.longUsd / r.grossUsd) * 100} />
                              <span className="w-[58px] text-right font-mono text-[12.5px]">{fmtUsd(r.grossUsd)}</span>
                            </>
                          ) : (
                            <span className="text-[12px] text-ink-dim">No open positions</span>
                          )}
                        </div>
                        <div className="flex items-center justify-end gap-2">
                          <div className="flex pl-1.5">
                            {stack.map((p, i) => (
                              <CoinLogo key={`${p.coin}-${i}`} symbol={p.coin} size={22} className="-ml-1.5 border-2 border-[#090b16]" title={p.coin} />
                            ))}
                          </div>
                          <span className="w-5 text-right font-mono text-[13px]">{r.positions.length}</span>
                        </div>
                        <span className="text-right font-mono text-[13px]" style={{ color: pnlColor }}>
                          {fmtUsd(pnl, { sign: true })}
                        </span>
                        <span className="text-right font-mono text-[13px]" style={{ color: pnl === null ? signColor(roi) : pnlColor }}>
                          {roi === null ? "—" : fmtPct(roi * 100, { sign: true })}
                        </span>
                        <span className="text-right font-mono text-[13px]">{fmtUsd(r.volume[window])}</span>
                        <span className="text-right font-mono text-[13px]">
                          {r.profile?.winRate == null ? "—" : fmtPct(r.profile.winRate * 100)}{" "}
                          {pf !== null && <span className="text-[10.5px] text-ink-dim">PF {pf >= 30 ? "99+" : pf.toFixed(1)}</span>}
                        </span>
                      </div>
                      {isOpen && <PositionsPanel positions={r.positions} />}
                  </div>
                );
              })}
            {!loading && filtered.length === 0 && <div className="px-5 py-[50px] text-center text-[14px] text-ink-muted">No wallets match these filters.</div>}
          </div>
        </div>
        <p className="m-0 text-[11.5px] leading-relaxed text-ink-dim">
          {fmtInt(filtered.length)} of {fmtInt(rows.length)} wallets. Exposure is size × entry price for each open perp position; mark is implied from entry and
          unrealised PnL. Market-maker versus directional classification is only published in aggregate, so types here are trading-style labels from fill history.
        </p>
      </section>
    </>
  );
}
