import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";
import { CoinView } from "@/components/coin/coin-view";

type Props = { params: Promise<{ symbol: string }> };

// dynamicParams stays at its default (true): a server renders any coin on
// demand, and the static export (which Next 16 builds fine with the default)
// serves the prerendered coins below, with 404.html for anything else.
// It must be a literal, so it cannot be switched on NEXT_PUBLIC_STATIC_SAMPLE.

function normalise(raw: string): string {
  // Keep Hyperliquid casing for k-prefixed coins (kPEPE, kSHIB); upper-case everything else.
  const s = decodeURIComponent(raw).trim().slice(0, 32);
  return /^k[A-Z0-9]+$/.test(s) ? s : s.toUpperCase();
}

type Row = Record<string, unknown>;

async function readSample(name: string): Promise<Row | null> {
  try {
    return JSON.parse(await readFile(path.join(process.cwd(), "public", "sample", name), "utf8")) as Row;
  } catch {
    return null;
  }
}

function rows(v: unknown): Row[] {
  return Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Row[]) : [];
}

/**
 * Every coin the sample snapshot can link to: the coins with full charts
 * (manifest), every radar blip (quant-whales top_coins), coin search results
 * (coins-top), alert rows, exchange-flow spikes and whale wallet positions.
 * Coins without sample candles open the usual "no data" states.
 */
export async function generateStaticParams(): Promise<{ symbol: string }[]> {
  const [manifest, whales, top, recent, spikes, traders] = await Promise.all(
    ["manifest.json", "quant-whales.json", "coins-top.json", "stream-recent.json", "spike-alerts.json", "hl-traders.json"].map(readSample),
  );
  const symbols: unknown[] = [
    ...(Array.isArray(manifest?.coins) ? manifest.coins : []),
    ...rows(whales?.top_coins).map((c) => c.coin ?? c.symbol),
    ...rows(top?.coins).map((c) => c.symbol),
    ...rows(recent?.events).map((e) => e.symbol),
    ...rows(spikes?.alerts).map((a) => a.symbol),
    ...rows(Object.values(traders?.wallet_positions ?? {})).flatMap((w) => rows(w.positions).map((p) => p.coin ?? p.symbol)),
  ];
  // The links use the coin's own spelling (kPEPE); skip case-only duplicates,
  // which would collide on case-insensitive file systems.
  const seen = new Set<string>();
  const out: { symbol: string }[] = [];
  for (const s of symbols) {
    if (typeof s !== "string" || !/^[A-Za-z0-9_]{1,32}$/.test(s) || seen.has(s.toUpperCase())) continue;
    seen.add(s.toUpperCase());
    out.push({ symbol: s });
  }
  return out;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { symbol } = await params;
  return { title: `${normalise(symbol)} whale chart` };
}

export default async function CoinPage({ params }: Props) {
  const { symbol } = await params;
  const sym = normalise(symbol);
  return <CoinView key={sym} symbol={sym} />;
}
