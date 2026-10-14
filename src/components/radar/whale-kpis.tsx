"use client";

import { KpiTile } from "@/components/deck/kpi-tile";
import { useHlOpenInterest } from "@/hooks/use-cda-data";
import type { WhalesData } from "@/lib/cda/types";
import { fmtInt, fmtPct, fmtUsd } from "@/lib/format";
import { DECK } from "@/lib/palette";

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** Six radar KPI tiles in a 2-column grid. */
export function WhaleKpis({ data, loading }: { data: WhalesData | undefined; loading: boolean }) {
  const oi = useHlOpenInterest();
  const s = data?.summary;
  const share = s?.longPct ?? null;
  const net = s?.netUsd ?? null;
  const biasLong = net !== null ? net >= 0 : (s?.netBias ?? "").toLowerCase() === "long";
  const whales = s?.byClass?.whale;
  const mms = s?.byClass?.market_maker;
  return (
    <div className="grid grid-cols-2 gap-2">
      <KpiTile
        label="Whale long share"
        loading={loading}
        value={fmtPct(share)}
        sub={s?.longShortRatio != null ? `L/S ratio ${s.longShortRatio.toFixed(2)}` : undefined}
        color={share === null || share >= 50 ? DECK.long : DECK.short}
      />
      <KpiTile
        label="Net bias"
        loading={loading}
        value={s?.netBias ? cap(s.netBias) : net !== null ? (net >= 0 ? "Long" : "Short") : "—"}
        sub={net !== null ? `Net ${fmtUsd(net, { sign: true })}` : undefined}
        color={biasLong ? DECK.long : DECK.short}
      />
      <KpiTile label="Long notional" loading={loading} value={fmtUsd(s?.longUsd)} sub="gross" color={DECK.long} />
      <KpiTile label="Short notional" loading={loading} value={fmtUsd(s?.shortUsd)} sub="gross" color={DECK.short} />
      <KpiTile
        label="Accounts tracked"
        loading={loading}
        value={fmtInt(s?.accounts)}
        sub={whales != null || mms != null ? `${fmtInt(whales)} whales · ${fmtInt(mms)} MMs` : undefined}
        color={DECK.blue}
      />
      <KpiTile
        label="HL open interest"
        loading={oi.isLoading}
        value={oi.data ? fmtUsd(oi.data.totalOiUsd) : "—"}
        sub={oi.data ? `${Object.keys(oi.data.byCoin).length} perps` : oi.gate === "ok" ? undefined : "needs a key"}
        color={DECK.blue}
      />
    </div>
  );
}
