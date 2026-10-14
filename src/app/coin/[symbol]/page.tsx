import type { Metadata } from "next";
import { CoinView } from "@/components/coin/coin-view";

type Props = { params: Promise<{ symbol: string }> };

function normalise(raw: string): string {
  // Keep Hyperliquid casing for k-prefixed coins (kPEPE, kSHIB); upper-case everything else.
  const s = decodeURIComponent(raw).trim().slice(0, 32);
  return /^k[A-Z0-9]+$/.test(s) ? s : s.toUpperCase();
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
