import { cn } from "@/lib/utils";

type Variant = "primary" | "ghost" | "danger" | "solid";
type Size = "md" | "sm";

const BASE =
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-[10px] border font-display font-semibold tracking-[.06em] whitespace-nowrap transition-[background,box-shadow,color,border-color] outline-none select-none focus-visible:ring-2 focus-visible:ring-long/50 disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:shrink-0";

const VARIANTS: Record<Variant, string> = {
  /** Cyan outline with glow (REFRESH, primary actions). */
  primary:
    "border-long/40 bg-long/8 text-long shadow-[0_0_18px_rgba(0,245,212,.15)] hover:bg-long/16 hover:shadow-[0_0_26px_rgba(0,245,212,.35)]",
  /** Quiet outline (secondary actions, CLEAR). */
  ghost: "border-iris/16 bg-transparent text-ink-soft hover:border-iris/30 hover:text-ink",
  /** Destructive outline. */
  danger: "border-iris/16 bg-transparent text-ink-soft hover:border-short/50 hover:text-short",
  /** Filled cyan (the main call to action on a form). */
  solid: "border-long bg-long text-deck shadow-[0_0_18px_rgba(0,245,212,.35)] hover:bg-long-hover hover:shadow-[0_0_26px_rgba(0,245,212,.5)]",
};

const SIZES: Record<Size, string> = {
  md: "px-4 py-2.5 text-[13px]",
  sm: "px-3 py-[7px] text-[12px]",
};

/** Class names for WhaleDesk buttons, usable on <button>, <a> and <Link>. */
export function deckButton({ variant = "primary", size = "md", className }: { variant?: Variant; size?: Size; className?: string } = {}): string {
  return cn(BASE, VARIANTS[variant], SIZES[size], className);
}
