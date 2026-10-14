"use client";

import { useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

/** Logo URLs that failed to load this session, so remounts go straight to the monogram. */
const failed = new Set<string>();

/** Hyperliquid prefixes 1000x contracts with "k" (kPEPE); the logo uses the plain ticker. */
export function logoSymbol(symbol: string): string {
  return symbol.replace(/^k(?=[A-Z0-9])/, "");
}

export function coinLogoUrl(symbol: string): string {
  return `https://app.hyperliquid.xyz/coins/${encodeURIComponent(logoSymbol(symbol))}.svg`;
}

/** FNV-1a hash of a symbol (stable colours). */
export function symbolHash(s: string): number {
  let h = 2166136261;
  for (const c of s) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function monogram(symbol: string): string {
  return symbol.replace(/^k/, "").slice(0, symbol.length > 4 ? 3 : 4);
}

export function monogramBg(symbol: string): string {
  const h = symbolHash(symbol);
  return `linear-gradient(135deg,hsl(${h % 360} 70% 42%),hsl(${(h >>> 8) % 360} 75% 28%))`;
}

/**
 * Round coin logo from Hyperliquid's CDN on a dark disc, falling back to a
 * gradient monogram when the image is missing.
 */
export function CoinLogo({
  symbol,
  size,
  className,
  style,
  title,
}: {
  symbol: string;
  size: number;
  className?: string;
  style?: CSSProperties;
  title?: string;
}) {
  const url = coinLogoUrl(symbol);
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  const broken = brokenUrl === url || failed.has(url);
  return (
    <span
      title={title}
      className={cn("relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-logo font-display font-bold text-white select-none", className)}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(7, Math.round(size * 0.32)),
        lineHeight: 1,
        ...(broken ? { background: monogramBg(symbol) } : null),
        ...style,
      }}
      aria-hidden={title ? undefined : true}
    >
      {broken ? (
        monogram(symbol)
      ) : (
        // Plain <img>: remote SVGs need no optimisation, and onError drives the monogram fallback.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          draggable={false}
          referrerPolicy="no-referrer"
          className="pointer-events-none size-full object-cover"
          onError={() => {
            failed.add(url);
            setBrokenUrl(url);
          }}
        />
      )}
    </span>
  );
}
