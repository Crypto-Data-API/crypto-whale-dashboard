import type { ComponentProps, CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Standard surface: 18px radius, iris hairline, translucent navy fill. */
export function Panel({ className, children, ...rest }: ComponentProps<"section">) {
  return (
    <section className={cn("flex min-w-0 flex-col rounded-[18px] border border-iris/13 bg-panel p-4 sm:p-[22px]", className)} {...rest}>
      {children}
    </section>
  );
}

/** Section title, Chakra Petch 600 18px. */
export function PanelTitle({ className, children, as: Tag = "h2" }: { className?: string; children: ReactNode; as?: "h2" | "h3" | "div" }) {
  return <Tag className={cn("m-0 font-display text-[18px] font-semibold", className)}>{children}</Tag>;
}

export function PanelSub({ className, children }: { className?: string; children: ReactNode }) {
  return <p className={cn("m-0 text-[13px] text-ink-muted", className)}>{children}</p>;
}

/** Mono uppercase label. */
export function Kicker({ className, children, style }: { className?: string; children: ReactNode; style?: CSSProperties }) {
  return (
    <div className={cn("font-mono text-[10.5px] tracking-[.12em] text-ink-muted uppercase", className)} style={style}>
      {children}
    </div>
  );
}

/** Key / value row with a hairline on top (coin side cards). */
export function KvRow({ k, v, color, className }: { k: ReactNode; v: ReactNode; color?: string; className?: string }) {
  return (
    <div className={cn("flex justify-between gap-2.5 border-t border-iris/7 py-2 text-[13px]", className)}>
      <span className="text-ink-soft">{k}</span>
      <span className="text-right font-mono" style={{ color: color ?? "#e8ecff" }}>
        {v}
      </span>
    </div>
  );
}
