"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronRight, Copy, ExternalLink, LoaderCircle, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { ErrorState, GateNotice } from "@/components/common/gate-notice";
import { PageHeader } from "@/components/common/page-header";
import { StatTile } from "@/components/common/stat-tile";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useTraderProfiles, useWhaleAccounts } from "@/hooks/use-cda-data";
import { useNow } from "@/hooks/use-now";
import type { TraderProfile, WalletPosition, WhaleAccount } from "@/lib/cda/types";
import { fmtClock, fmtInt, fmtPct, fmtPrice, fmtUsd, relTime, shortAddress } from "@/lib/format";
import { cn } from "@/lib/utils";

type Window = "day" | "week" | "month" | "allTime";
const WINDOWS: { id: Window; label: string }[] = [
  { id: "day", label: "24h" },
  { id: "week", label: "7d" },
  { id: "month", label: "30d" },
  { id: "allTime", label: "All" },
];

type SortKey = "score" | "accountValue" | "pnl" | "roi" | "volume" | "exposure" | "positions" | "winRate";
const HIGH_LEVERAGE = 20;

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

type Row = WhaleAccount & { profile: TraderProfile | null; netUsd: number; grossUsd: number };

function Signed({ value, pct = false }: { value: number | null; pct?: boolean }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={cn("tabular", value > 0 ? "text-long" : value < 0 ? "text-short" : "")}>
      {pct ? fmtPct(value * 100, { sign: true }) : fmtUsd(value, { sign: true })}
    </span>
  );
}

function ExposureBar({ longUsd, shortUsd }: { longUsd: number; shortUsd: number }) {
  const gross = longUsd + shortUsd;
  if (gross <= 0) return <span className="text-xs text-muted-foreground">No open positions</span>;
  const l = (longUsd / gross) * 100;
  return (
    <div className="flex min-w-32 items-center gap-2" aria-label={`Long ${l.toFixed(0)}%, short ${(100 - l).toFixed(0)}%`}>
      <div className="flex h-2 flex-1 gap-[2px] overflow-hidden rounded-sm">
        <div className="h-full rounded-l-sm bg-long" style={{ width: `${l}%` }} />
        <div className="h-full flex-1 rounded-r-sm bg-short" />
      </div>
      <span className="tabular w-14 text-right text-xs">{fmtUsd(gross)}</span>
    </div>
  );
}

function PositionsTable({ positions }: { positions: WalletPosition[] }) {
  if (positions.length === 0) return <p className="px-3 py-2 text-xs text-muted-foreground">No open positions right now.</p>;
  const sorted = [...positions].sort((a, b) => (b.notionalUsd ?? 0) - (a.notionalUsd ?? 0));
  return (
    <table className="w-full text-xs">
      <thead className="text-muted-foreground">
        <tr className="[&>th]:px-3 [&>th]:py-1.5 [&>th]:font-medium">
          <th className="text-left">Coin</th>
          <th className="text-left">Side</th>
          <th className="text-right">Notional</th>
          <th className="text-right">Size</th>
          <th className="text-right">Entry</th>
          <th className="text-right">Leverage</th>
          <th className="text-right">Unrealised PnL</th>
          <th className="text-right">Liq. price</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((p, i) => (
          <tr key={`${p.coin}-${i}`} className="border-t border-border/60 [&>td]:px-3 [&>td]:py-1.5">
            <td>
              <Link href={`/coin/${encodeURIComponent(p.coin)}`} className="font-mono font-semibold hover:underline">
                {p.coin}
              </Link>
            </td>
            <td>
              <span className={cn("inline-flex items-center gap-1 uppercase", p.side === "long" ? "text-long" : p.side === "short" ? "text-short" : "")}>
                <span className={cn("size-1.5 rounded-full", p.side === "long" ? "bg-long" : p.side === "short" ? "bg-short" : "bg-muted-foreground")} aria-hidden />
                {p.side}
              </span>
            </td>
            <td className="tabular text-right font-medium">{fmtUsd(p.notionalUsd)}</td>
            <td className="tabular text-right">{p.size === null ? "—" : fmtInt(Math.round(p.size))}</td>
            <td className="tabular text-right">{fmtPrice(p.entryPrice)}</td>
            <td className={cn("tabular text-right", (p.leverage ?? 0) >= HIGH_LEVERAGE && "text-liq")}>{p.leverage === null ? "—" : `${p.leverage}x`}</td>
            <td className="text-right">
              <Signed value={p.unrealizedPnl} />
            </td>
            <td className="tabular text-right">{fmtPrice(p.liquidationPrice)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SortHeader({
  id,
  label,
  sort,
  onSort,
  align = "right",
  className,
}: {
  id: SortKey;
  label: string;
  sort: { key: SortKey; desc: boolean };
  onSort: (k: SortKey) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const active = sort.key === id;
  const Icon = !active ? ArrowUpDown : sort.desc ? ArrowDown : ArrowUp;
  return (
    <th className={cn("px-3 py-2 font-medium", align === "right" ? "text-right" : "text-left", className)}>
      <button type="button" onClick={() => onSort(id)} className={cn("inline-flex items-center gap-1 hover:text-foreground", active && "text-foreground")}>
        {label}
        <Icon className="size-3" aria-hidden />
      </button>
    </th>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-md border px-2 py-1 text-xs",
        active ? "border-foreground/40 bg-accent font-medium text-accent-foreground" : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function WhaleAccountsView() {
  const accounts = useWhaleAccounts();
  const profiles = useTraderProfiles();
  const now = useNow(15_000);

  const [window, setWindow] = useState<Window>("day");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "exposure", desc: true });
  const [types, setTypes] = useState<Set<string>>(new Set());
  const [flags, setFlags] = useState<{ positions: boolean; highLev: boolean; netLong: boolean; netShort: boolean }>({
    positions: false,
    highLev: false,
    netLong: false,
    netShort: false,
  });
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());

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
    return { value, long, short, withPositions };
  }, [rows]);

  const onSort = (k: SortKey) => setSort((s) => (s.key === k ? { key: k, desc: !s.desc } : { key: k, desc: true }));
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
      toast.success("Address copied");
    } catch {
      toast.error("Could not copy");
    }
  };

  const loading = accounts.isLoading && !accounts.data;
  const updated = accounts.data?.updatedAt ?? null;

  return (
    <>
      <PageHeader
        title="Whale Accounts"
        description="Tracked Hyperliquid whale wallets: who they are, how they trade and what they hold right now."
        actions={
          <Button size="sm" variant="outline" onClick={() => accounts.refetch()} disabled={accounts.isFetching}>
            {accounts.isFetching ? <LoaderCircle className="animate-spin" /> : <RefreshCw />} Refresh
          </Button>
        }
      />

      {accounts.gate !== "ok" && accounts.gate !== "loading" ? (
        <GateNotice gate={accounts.gate} requiredTier={accounts.requiredTier} feature="whale accounts" />
      ) : accounts.error ? (
        <ErrorState error={accounts.error} onRetry={() => accounts.refetch()} />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <StatTile label="Wallets tracked" loading={loading} value={fmtInt(rows.length)} sub={accounts.data?.trackedCount != null ? `${fmtInt(accounts.data.trackedCount)} with live positions` : undefined} />
            <StatTile label="Combined account value" loading={loading} value={fmtUsd(totals.value)} />
            <StatTile label="Open long notional" loading={loading} value={fmtUsd(totals.long)} marker="long" />
            <StatTile label="Open short notional" loading={loading} value={fmtUsd(totals.short)} marker="short" />
            <StatTile label="Wallets in a position" loading={loading} value={fmtInt(totals.withPositions)} />
            <StatTile label="Updated" loading={loading} value={relTime(updated, now)} sub={updated ? fmtClock(updated) : undefined} />
          </div>

          <Card size="sm">
            <CardHeader>
              <CardTitle>Wallets</CardTitle>
              <CardDescription>
                Click a row to see its open positions. Trader type comes from each wallet&apos;s 30-day fill history
                {profiles.gate === "upgrade" ? " (needs a Pro key)" : ""}.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Address or coin"
                    className="h-7 w-48 rounded-md border border-input bg-transparent pl-7 pr-2 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
                <span className="text-xs text-muted-foreground">Type:</span>
                {typeOptions.length === 0 ? (
                  <span className="text-xs text-muted-foreground">{profiles.isLoading ? "loading…" : profiles.gate === "upgrade" ? "Pro only" : "n/a"}</span>
                ) : (
                  typeOptions.map(([t, n]) => (
                    <Chip key={t} active={types.has(t)} onClick={() => toggleType(t)}>
                      {typeLabel(t)} <span className="text-muted-foreground">{n}</span>
                    </Chip>
                  ))
                )}
                <span className="mx-1 h-4 w-px bg-border" aria-hidden />
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
                <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                  PnL window
                  <span className="flex rounded-md border border-input p-0.5" role="radiogroup">
                    {WINDOWS.map((w) => (
                      <button
                        key={w.id}
                        type="button"
                        role="radio"
                        aria-checked={window === w.id}
                        onClick={() => setWindow(w.id)}
                        className={cn("rounded px-2 py-0.5", window === w.id ? "bg-accent font-medium text-accent-foreground" : "hover:text-foreground")}
                      >
                        {w.label}
                      </button>
                    ))}
                  </span>
                </span>
              </div>

              {loading ? (
                <div className="flex flex-col gap-2">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-9 w-full" />
                  ))}
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-xs text-muted-foreground">
                      <tr>
                        <th className="w-6" />
                        <th className="px-3 py-2 text-left font-medium">Wallet</th>
                        <th className="px-3 py-2 text-left font-medium">Type</th>
                        <SortHeader id="score" label="Score" sort={sort} onSort={onSort} />
                        <SortHeader id="accountValue" label="Account value" sort={sort} onSort={onSort} />
                        <SortHeader id="exposure" label="Exposure L / S" sort={sort} onSort={onSort} align="left" />
                        <SortHeader id="positions" label="Pos." sort={sort} onSort={onSort} />
                        <SortHeader id="pnl" label={`PnL ${WINDOWS.find((w) => w.id === window)?.label}`} sort={sort} onSort={onSort} />
                        <SortHeader id="roi" label="ROI" sort={sort} onSort={onSort} className="hidden md:table-cell" />
                        <SortHeader id="volume" label="Volume" sort={sort} onSort={onSort} className="hidden lg:table-cell" />
                        <SortHeader id="winRate" label="Win rate" sort={sort} onSort={onSort} className="hidden lg:table-cell" />
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.length === 0 && (
                        <tr>
                          <td colSpan={11} className="px-3 py-6 text-center text-sm text-muted-foreground">
                            No wallets match these filters.
                          </td>
                        </tr>
                      )}
                      {filtered.map((r) => {
                        const isOpen = open.has(r.address);
                        const t = r.profile?.traderType;
                        return (
                          <Fragment key={r.address}>
                            <tr
                              className={cn("cursor-pointer border-t border-border hover:bg-accent/30", isOpen && "bg-accent/20")}
                              onClick={() => toggleOpen(r.address)}
                            >
                              <td className="pl-2 text-muted-foreground">{isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</td>
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono text-xs font-semibold">{r.displayName ?? shortAddress(r.address)}</span>
                                  <button
                                    type="button"
                                    className="text-muted-foreground hover:text-foreground"
                                    aria-label="Copy address"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void copy(r.address);
                                    }}
                                  >
                                    <Copy className="size-3" />
                                  </button>
                                  <a
                                    href={`https://app.hyperliquid.xyz/explorer/address/${r.address}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    aria-label="Open in Hyperliquid explorer"
                                    className="text-muted-foreground hover:text-foreground"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <ExternalLink className="size-3" />
                                  </a>
                                </div>
                                {r.profile?.edges.length ? (
                                  <div className="mt-0.5 truncate text-[10px] text-muted-foreground">{r.profile.edges.map((e) => e.replace(/_/g, " ")).join(" · ")}</div>
                                ) : null}
                              </td>
                              <td className="px-3 py-2 text-xs">
                                {t ? (
                                  <span className="rounded bg-muted px-1.5 py-0.5">{typeLabel(t)}</span>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                                {(r.maxLeverage ?? 0) >= HIGH_LEVERAGE && <span className="ml-1 rounded bg-liq/15 px-1.5 py-0.5 text-liq">{r.maxLeverage}x</span>}
                              </td>
                              <td className="tabular px-3 py-2 text-right">{r.score === null ? "—" : r.score.toFixed(1)}</td>
                              <td className="tabular px-3 py-2 text-right">{fmtUsd(r.accountValue)}</td>
                              <td className="px-3 py-2">
                                <ExposureBar longUsd={r.longUsd} shortUsd={r.shortUsd} />
                              </td>
                              <td className="tabular px-3 py-2 text-right">
                                {r.positions.length ? (
                                  <span>
                                    {r.positions.length}
                                    <span className="ml-1 text-xs text-muted-foreground">{r.positions.slice(0, 3).map((p) => p.coin).join(" ")}</span>
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">0</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-right">
                                <Signed value={r.pnl[window]} />
                              </td>
                              <td className="hidden px-3 py-2 text-right md:table-cell">
                                <Signed value={r.roi[window]} pct />
                              </td>
                              <td className="tabular hidden px-3 py-2 text-right lg:table-cell">{fmtUsd(r.volume[window])}</td>
                              <td className="tabular hidden px-3 py-2 text-right lg:table-cell">
                                {r.profile?.winRate == null ? "—" : fmtPct(r.profile.winRate * 100)}
                                {r.profile?.profitFactor != null && <span className="ml-1 text-xs text-muted-foreground">PF {r.profile.profitFactor > 99 ? "99+" : r.profile.profitFactor.toFixed(1)}</span>}
                              </td>
                            </tr>
                            {isOpen && (
                              <tr className="border-t border-border/60 bg-muted/20">
                                <td colSpan={11} className="p-0">
                                  <PositionsTable positions={r.positions} />
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">
                {fmtInt(filtered.length)} of {fmtInt(rows.length)} wallets. Exposure is size × entry price for each open perp position. Market-maker
                versus directional classification is only published in aggregate by the API, so types here are trading-style labels from fill history.
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
