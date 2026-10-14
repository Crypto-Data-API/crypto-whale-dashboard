"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ErrorState, GateNotice } from "@/components/common/gate-notice";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useSpikeAlerts } from "@/hooks/use-cda-data";
import { useNow } from "@/hooks/use-now";
import { fmtClock, fmtCompact, fmtInt, fmtUsd, relTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const MIN_AMOUNTS = [1_000_000, 5_000_000, 10_000_000, 25_000_000];

type Dir = "all" | "inflow" | "outflow";

/** Large CEX wallet transfers from /on-chain/exchange-flows/spike-alerts (~10h window). */
export function SpikeAlerts() {
  const [minAmount, setMinAmount] = useState(MIN_AMOUNTS[0]);
  const [dir, setDir] = useState<Dir>("all");
  const [symbol, setSymbol] = useState("");
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
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3 rounded-xl bg-card p-3 ring-1 ring-foreground/10">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Min transfer</span>
          <Select value={String(minAmount)} onValueChange={(v) => setMinAmount(Number(v))}>
            <SelectTrigger size="sm" className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MIN_AMOUNTS.map((m) => (
                <SelectItem key={m} value={String(m)}>
                  {fmtUsd(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Direction</span>
          <div className="flex rounded-md border border-input p-0.5 text-xs" role="radiogroup" aria-label="Direction">
            {(["all", "inflow", "outflow"] as const).map((d) => (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={dir === d}
                onClick={() => setDir(d)}
                className={cn(
                  "flex items-center gap-1 rounded px-2 py-0.5 capitalize",
                  dir === d ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {d !== "all" && <span className={cn("size-1.5 rounded-full", d === "outflow" ? "bg-long" : "bg-short")} />}
                {d}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="spike-sym" className="text-xs text-muted-foreground">
            Symbol
          </label>
          <input
            id="spike-sym"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            placeholder="All"
            className="h-7 w-24 rounded-md border border-input bg-muted/40 px-2 text-xs outline-none focus-visible:border-ring"
          />
        </div>
        <div className="ml-auto flex gap-4 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-short" aria-hidden /> Inflow {fmtUsd(totals.inflow)}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-long" aria-hidden /> Outflow {fmtUsd(totals.outflow)}
          </span>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Inflows to exchanges often precede selling (coral); outflows to self-custody are usually read as accumulation (green).
      </p>

      {q.gate !== "ok" ? (
        <GateNotice gate={q.gate} requiredTier={q.requiredTier} feature="Exchange flow spike alerts" />
      ) : q.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : q.error && !q.data ? (
        <ErrorState error={q.error} onRetry={q.refetch} />
      ) : (
        <div className="overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  Time
                </th>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  Coin
                </th>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  Exchange
                </th>
                <th scope="col" className="hidden px-3 py-2 text-left font-medium sm:table-cell">
                  Chain
                </th>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  Direction
                </th>
                <th scope="col" className="hidden px-3 py-2 text-right font-medium sm:table-cell">
                  Amount
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  USD
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.ts}-${r.symbol}-${r.exchange}-${i}`} className="border-t border-border">
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    <span className="tabular text-xs">{fmtClock(r.ts)}</span>
                    <span className="ml-1.5 text-[10px] text-muted-foreground">{relTime(r.ts, now)}</span>
                  </td>
                  <td className="px-3 py-1.5">
                    <Link href={`/coin/${encodeURIComponent(r.symbol)}`} className="font-mono text-xs font-semibold hover:underline">
                      {r.symbol}
                    </Link>
                  </td>
                  <td className="px-3 py-1.5 capitalize">{r.exchange ?? "—"}</td>
                  <td className="hidden px-3 py-1.5 text-muted-foreground uppercase sm:table-cell">{r.chain ?? "—"}</td>
                  <td className="px-3 py-1.5">
                    <span className="inline-flex items-center gap-1 rounded border border-border px-1.5 text-[10px] font-semibold tracking-wide uppercase">
                      <span className={cn("size-1.5 rounded-full", r.direction === "outflow" ? "bg-long" : r.direction === "inflow" ? "bg-short" : "bg-muted-foreground")} />
                      {r.direction || "?"}
                    </span>
                  </td>
                  <td className="tabular hidden px-3 py-1.5 text-right sm:table-cell">
                    {fmtCompact(r.amount, 2)} {r.unit ?? r.symbol}
                  </td>
                  <td className="tabular px-3 py-1.5 text-right font-medium">{fmtUsd(r.amountUsd)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-sm text-muted-foreground">
                    No spikes match the filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
            {fmtInt(rows.length)} transfers · refreshed every few minutes
          </p>
        </div>
      )}
    </div>
  );
}
