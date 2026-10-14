"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SegOption<T extends string | number> {
  value: T;
  label: ReactNode;
  /** Optional coloured dot before the label. */
  dot?: string;
  title?: string;
}

/**
 * Visual variants from the design:
 *  - tabs:   page-level tabs (Chakra Petch 13px, 9px 16px)
 *  - mode:   coin chart Candles / Line (Manrope 600 12px, 7px 14px)
 *  - tf:     timeframes (mono 500 12px, 7px 12px)
 *  - filter: neutral-iris active state (Manrope 600 12px, 6px 12px)
 *  - mini:   small mono pills, active = cyan fill without ring (min size, PnL window)
 */
type Variant = "tabs" | "mode" | "tf" | "filter" | "mini";

const WRAP: Record<Variant, string> = {
  tabs: "gap-1 p-1 rounded-[12px]",
  mode: "gap-1 p-1 rounded-[10px]",
  tf: "gap-1 p-1 rounded-[10px]",
  filter: "gap-1 p-1 rounded-[10px]",
  mini: "gap-[3px] p-[3px] rounded-[9px]",
};

const ITEM: Record<Variant, string> = {
  tabs: "px-4 py-[9px] rounded-[9px] font-display font-semibold text-[13px] tracking-[.04em]",
  mode: "px-3.5 py-[7px] rounded-[7px] font-sans font-semibold text-[12px]",
  tf: "px-3 py-[7px] rounded-[7px] font-mono font-medium text-[12px]",
  filter: "px-3 py-1.5 rounded-[7px] font-sans font-semibold text-[12px]",
  mini: "px-[9px] py-[5px] rounded-[6px] font-mono text-[11px]",
};

const ON_CYAN = "bg-long/14 text-long shadow-[inset_0_0_0_1px_rgba(0,245,212,.4)]";
const ON_CYAN_FLAT = "bg-long/14 text-long";
const ON_IRIS = "bg-iris/18 text-ink-bright shadow-[inset_0_0_0_1px_rgba(120,140,255,.35)]";
const OFF = "bg-transparent text-ink-soft hover:text-ink";

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  variant = "mode",
  ariaLabel,
  className,
  itemClassName,
}: {
  options: SegOption<T>[];
  value: T;
  onChange: (v: T) => void;
  variant?: Variant;
  ariaLabel: string;
  className?: string;
  itemClassName?: string;
}) {
  const on = variant === "filter" ? ON_IRIS : variant === "mini" ? ON_CYAN_FLAT : ON_CYAN;
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn("flex w-fit shrink-0 border border-iris/16 bg-field", WRAP[variant], className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex cursor-pointer items-center gap-1.5 border-0 whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-long/40",
              ITEM[variant],
              active ? on : OFF,
              itemClassName,
            )}
          >
            {o.dot && <span className="size-1.5 shrink-0 rounded-full" style={{ background: o.dot }} aria-hidden />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
