"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Toggle chip: cyan outline when on, quiet iris outline when off. */
export function Chip({
  active,
  onClick,
  children,
  count,
  className,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  count?: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      title={title}
      onClick={onClick}
      className={cn(
        "inline-flex cursor-pointer items-center gap-1.5 rounded-[9px] border px-3 py-[7px] font-sans text-[12px] font-semibold whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-long/40",
        active ? "border-long/45 bg-long/10 text-long" : "border-iris/16 bg-transparent text-ink-soft hover:border-iris/30 hover:text-ink",
        className,
      )}
    >
      {children}
      {count !== undefined && <span className="font-mono text-ink-muted">{count}</span>}
    </button>
  );
}
