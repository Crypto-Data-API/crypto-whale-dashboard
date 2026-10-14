"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { LoaderCircle, Search } from "lucide-react";
import { useCoinSearch } from "@/hooks/use-cda-data";
import { fmtPct, fmtPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

type Option = { symbol: string; name: string | null; price: number | null; change: number | null; rank: number | null };

/** Header search box: /coins/search with debounce, keyboard navigation, Enter to open. */
export function CoinSearch({ className }: { className?: string }) {
  const router = useRouter();
  const listId = useId();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const search = useCoinSearch(debounced);
  const term = q.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

  const options: Option[] = [];
  const seen = new Set<string>();
  for (const r of search.data ?? []) {
    if (seen.has(r.symbol)) continue;
    seen.add(r.symbol);
    options.push({ symbol: r.symbol, name: r.name, price: r.price, change: r.change24h, rank: r.rank });
    if (options.length >= 8) break;
  }
  if (term && !seen.has(term)) options.push({ symbol: term, name: null, price: null, change: null, rank: null });
  const activeIdx = options.length ? Math.min(active, options.length - 1) : -1;

  const go = (symbol: string) => {
    setOpen(false);
    setQ("");
    setDebounced("");
    router.push(`/coin/${encodeURIComponent(symbol)}`);
  };

  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <input
        type="search"
        role="combobox"
        aria-expanded={open && options.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeIdx >= 0 ? `${listId}-${activeIdx}` : undefined}
        aria-label="Search coins"
        placeholder="Search coin (BTC, ETH…)"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          blurTimer.current = setTimeout(() => setOpen(false), 150);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(a + 1, Math.max(0, options.length - 1)));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            const opt = activeIdx >= 0 ? options[activeIdx] : null;
            if (opt) go(opt.symbol);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        className="h-8 w-full rounded-md border border-input bg-muted/40 pr-8 pl-8 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
      />
      {search.isFetching && (
        <LoaderCircle className="absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden />
      )}
      {open && options.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute top-full right-0 left-0 z-50 mt-1 max-h-80 overflow-auto rounded-md border border-border bg-popover p-1 shadow-xl"
          onMouseDown={() => {
            if (blurTimer.current) clearTimeout(blurTimer.current);
          }}
        >
          {options.map((o, i) => (
            <li
              key={`${o.symbol}-${i}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === activeIdx}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(o.symbol)}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm",
                i === activeIdx ? "bg-accent text-accent-foreground" : "text-popover-foreground",
              )}
            >
              <span className="w-14 shrink-0 font-mono text-xs font-semibold">{o.symbol}</span>
              <span className="flex-1 truncate text-xs text-muted-foreground">{o.name ?? "Open chart"}</span>
              {o.price !== null && <span className="tabular text-xs">{fmtPrice(o.price)}</span>}
              {o.change !== null && (
                <span className={cn("tabular w-14 text-right text-xs", o.change >= 0 ? "text-long" : "text-short")}>
                  {fmtPct(o.change, { sign: true })}
                </span>
              )}
            </li>
          ))}
          {search.isError && (
            <li className="px-2 py-1.5 text-xs text-muted-foreground">Search needs an API key. Press Enter to open the symbol directly.</li>
          )}
        </ul>
      )}
    </div>
  );
}
