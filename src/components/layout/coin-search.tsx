"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { CoinLogo } from "@/components/deck/coin-logo";
import { SearchIcon } from "@/components/deck/icons";
import { useCoinSearch } from "@/hooks/use-cda-data";
import { fmtPct, fmtPrice } from "@/lib/format";
import { DECK } from "@/lib/palette";
import { cn } from "@/lib/utils";

type Option = { symbol: string; name: string | null; price: number | null; change: number | null; rank: number | null };

/** Sidebar coin search: /coins/search with debounce, keyboard navigation, Enter to open, ⌘K / Ctrl+K to focus. */
export function CoinSearch({ className, onNavigate }: { className?: string; onNavigate?: () => void }) {
  const router = useRouter();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        const el = inputRef.current;
        // Only the visible instance (desktop sidebar or open mobile drawer) takes focus.
        if (!el || el.getClientRects().length === 0) return;
        e.preventDefault();
        el.focus();
        el.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
    inputRef.current?.blur();
    onNavigate?.();
    router.push(`/coin/${encodeURIComponent(symbol)}`);
  };

  return (
    <div className={cn("relative", className)}>
      <div className="flex items-center gap-2 rounded-[10px] border border-iris/16 bg-field px-3 py-[9px] focus-within:border-long/40">
        <SearchIcon size={14} stroke={DECK.muted} />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={open && options.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeIdx >= 0 ? `${listId}-${activeIdx}` : undefined}
          aria-label="Search coins"
          placeholder="Search coin"
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
          className="min-w-0 flex-1 border-0 bg-transparent font-sans text-[13px] text-ink outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {search.isFetching ? (
          <span className="size-3 shrink-0 animate-spin rounded-full border-2 border-iris/30 border-t-long" aria-hidden />
        ) : (
          <span className="rounded-[5px] border border-iris/20 px-1.5 py-0.5 font-mono text-[10px] text-ink-dim" aria-hidden>
            ⌘K
          </span>
        )}
      </div>
      {open && options.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute top-full left-0 z-50 mt-1.5 max-h-80 w-[min(22rem,calc(100vw-2rem))] overflow-auto rounded-[12px] border border-iris/16 bg-[#0b0d1a]/95 p-1.5 shadow-[0_18px_40px_rgba(0,0,0,.55)] backdrop-blur-md"
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
                "flex cursor-pointer items-center gap-2.5 rounded-[8px] px-2 py-1.5 text-[13px]",
                i === activeIdx ? "bg-iris/12 text-ink-bright" : "text-ink",
              )}
            >
              <CoinLogo symbol={o.symbol} size={20} />
              <span className="w-14 shrink-0 font-display text-[13px] font-semibold">{o.symbol}</span>
              <span className="min-w-0 flex-1 truncate text-[12px] text-ink-muted">{o.name ?? "Open chart"}</span>
              {o.price !== null && <span className="font-mono text-[11.5px]">{fmtPrice(o.price)}</span>}
              {o.change !== null && (
                <span className="w-14 text-right font-mono text-[11.5px]" style={{ color: o.change >= 0 ? DECK.long : DECK.short }}>
                  {fmtPct(o.change, { sign: true })}
                </span>
              )}
            </li>
          ))}
          {search.isError && <li className="px-2 py-1.5 text-[12px] text-ink-muted">Search needs an API key. Press Enter to open the symbol directly.</li>}
        </ul>
      )}
    </div>
  );
}
