import { WhaleRadarView } from "@/components/radar/whale-radar-view";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** `/?sel=ETH` preselects a coin on the radar (used by the Whale Exposure table). */
export default async function HomePage({ searchParams }: Props) {
  const { sel } = await searchParams;
  const raw = Array.isArray(sel) ? sel[0] : sel;
  const initialSel = raw ? raw.trim().slice(0, 32) || null : null;
  return <WhaleRadarView key={initialSel ?? ""} initialSel={initialSel} />;
}
