"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  tableFeatures,
  useTable,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowDownRight, ArrowUp, ArrowUpDown, ArrowUpRight, Search } from "lucide-react";
import type { WhaleCoin } from "@/lib/cda/types";
import { fmtPrice, fmtUsd } from "@/lib/format";
import { cn } from "@/lib/utils";

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, basic: sortFn_basic },
});

const helper = createColumnHelper<typeof features, WhaleCoin>();

function Signed({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  const Icon = value >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex items-center justify-end gap-0.5">
      <Icon className={cn("size-3.5 shrink-0", value >= 0 ? "text-long" : "text-short")} aria-hidden />
      {fmtUsd(value, { sign: true })}
    </span>
  );
}

function LongShortBar({ longPct }: { longPct: number | null }) {
  if (longPct === null) return <span className="text-muted-foreground">—</span>;
  const l = Math.max(0, Math.min(100, longPct));
  return (
    <div className="flex min-w-28 items-center gap-2" aria-label={`Long ${l.toFixed(1)}%, short ${(100 - l).toFixed(1)}%`}>
      <div className="flex h-2 flex-1 gap-[2px] overflow-hidden rounded-sm">
        <div className="h-full rounded-l-sm bg-long" style={{ width: `${l}%` }} />
        <div className="h-full flex-1 rounded-r-sm bg-short" />
      </div>
      <span className="tabular w-11 text-right text-xs">{l.toFixed(1)}%</span>
    </div>
  );
}

function PctileCell({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="relative h-1.5 w-14 rounded-full bg-muted" aria-hidden>
        <div className="absolute top-0 left-1/2 h-full w-px bg-muted-foreground/40" />
        <div
          className={cn("absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card", v >= 50 ? "bg-long" : "bg-short")}
          style={{ left: `${v}%` }}
        />
      </div>
      <span className="tabular w-8 text-right">{v.toFixed(0)}</span>
    </div>
  );
}

const columns = helper.columns([
  helper.accessor("symbol", {
    header: "Coin",
    sortFn: "alphanumeric",
    cell: (info) => <span className="font-mono font-semibold">{info.getValue()}</span>,
  }),
  helper.accessor((r) => r.mark ?? undefined, {
    id: "mark",
    header: "Mark",
    sortFn: "basic",
    sortUndefined: "last",
    cell: (info) => fmtPrice(info.getValue() ?? null),
  }),
  helper.accessor((r) => r.grossUsd ?? undefined, {
    id: "gross",
    header: "Gross",
    sortFn: "basic",
    sortUndefined: "last",
    cell: (info) => fmtUsd(info.getValue() ?? null),
  }),
  helper.accessor((r) => r.longPct ?? undefined, {
    id: "ls",
    header: "Long / Short",
    sortFn: "basic",
    sortUndefined: "last",
    cell: (info) => <LongShortBar longPct={info.getValue() ?? null} />,
  }),
  helper.accessor((r) => r.netUsd ?? undefined, {
    id: "net",
    header: "Net",
    sortFn: "basic",
    sortUndefined: "last",
    cell: (info) => <Signed value={info.getValue() ?? null} />,
  }),
  helper.accessor((r) => r.directionalNetUsd ?? undefined, {
    id: "netExMm",
    header: "Net ex-MM",
    sortFn: "basic",
    sortUndefined: "last",
    cell: (info) => <Signed value={info.getValue() ?? null} />,
  }),
  helper.accessor((r) => r.pctile30d ?? undefined, {
    id: "pctile",
    header: "30D pctile",
    sortFn: "basic",
    sortUndefined: "last",
    cell: (info) => <PctileCell value={info.getValue() ?? null} />,
  }),
  helper.accessor((r) => (r.nLong ?? 0) + (r.nShort ?? 0), {
    id: "accounts",
    header: "#L / #S",
    sortFn: "basic",
    cell: (info) => (
      <span className="tabular">
        {info.row.original.nLong ?? "—"}
        <span className="text-muted-foreground"> / </span>
        {info.row.original.nShort ?? "—"}
      </span>
    ),
  }),
]);

const RIGHT = new Set(["mark", "gross", "net", "netExMm", "pctile", "accounts"]);
const HIDE_ON_MOBILE = new Set(["mark", "netExMm", "accounts"]);

type Lean = "all" | "long" | "short";

export function WhaleTable({ coins, compact = false }: { coins: WhaleCoin[]; compact?: boolean }) {
  const router = useRouter();
  const [sorting, setSorting] = useState<SortingState>([{ id: "gross", desc: true }]);
  const [query, setQuery] = useState("");
  const [lean, setLean] = useState<Lean>("all");

  const data = useMemo(() => {
    const q = query.trim().toUpperCase();
    return coins.filter((c) => {
      if (q && !c.symbol.toUpperCase().includes(q)) return false;
      const p = c.pctile30d ?? c.longPct;
      if (lean === "long" && !(p !== null && p >= 50)) return false;
      if (lean === "short" && !(p !== null && p < 50)) return false;
      return true;
    });
  }, [coins, query, lean]);

  const table = useTable({
    features,
    columns,
    data,
    state: { sorting },
    onSortingChange: setSorting,
    enableSortingRemoval: false,
  });

  const open = (symbol: string) => router.push(`/coin/${encodeURIComponent(symbol)}`);

  return (
    <div className="flex flex-col gap-2">
      {!compact && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-40">
            <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter coins"
              aria-label="Filter coins"
              className="h-7 w-full rounded-md border border-input bg-muted/40 pr-2 pl-7 text-xs outline-none focus-visible:border-ring"
            />
          </div>
          <div className="flex rounded-md border border-input p-0.5 text-xs" role="radiogroup" aria-label="Lean filter">
            {(["all", "long", "short"] as const).map((l) => (
              <button
                key={l}
                type="button"
                role="radio"
                aria-checked={lean === l}
                onClick={() => setLean(l)}
                className={cn(
                  "flex items-center gap-1 rounded px-2 py-0.5 capitalize",
                  lean === l ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {l !== "all" && <span className={cn("size-1.5 rounded-full", l === "long" ? "bg-long" : "bg-short")} />}
                {l === "all" ? "All" : `${l}-leaning`}
              </button>
            ))}
          </div>
          <span className="ml-auto text-xs text-muted-foreground">
            {data.length} of {coins.length} coins
          </span>
        </div>
      )}
      <div className="overflow-x-auto rounded-lg ring-1 ring-foreground/10">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  const Icon = sorted === "asc" ? ArrowUp : sorted === "desc" ? ArrowDown : ArrowUpDown;
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none"}
                      className={cn(
                        "px-3 py-2 font-medium whitespace-nowrap",
                        RIGHT.has(header.column.id) ? "text-right" : "text-left",
                        HIDE_ON_MOBILE.has(header.column.id) && "hidden md:table-cell",
                      )}
                    >
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className={cn("inline-flex items-center gap-1 hover:text-foreground", sorted && "text-foreground")}
                      >
                        {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                        <Icon className={cn("size-3", !sorted && "opacity-40")} aria-hidden />
                      </button>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                tabIndex={0}
                onClick={() => open(row.original.symbol)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") open(row.original.symbol);
                }}
                className="cursor-pointer border-t border-border transition-colors hover:bg-accent/50 focus-visible:bg-accent/60 focus-visible:outline-none"
              >
                {row.getAllCells().map((cell) => (
                  <td
                    key={cell.id}
                    className={cn(
                      "tabular px-3 py-1.5 whitespace-nowrap",
                      RIGHT.has(cell.column.id) ? "text-right" : "text-left",
                      HIDE_ON_MOBILE.has(cell.column.id) && "hidden md:table-cell",
                    )}
                  >
                    <table.FlexRender cell={cell} />
                  </td>
                ))}
              </tr>
            ))}
            {data.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No coins match the filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {!compact && <p className="text-[11px] text-muted-foreground">Net ex-MM excludes market-maker books. 30D pctile ranks today&apos;s long share against the last 30 days.</p>}
    </div>
  );
}

