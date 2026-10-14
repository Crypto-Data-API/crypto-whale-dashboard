"use client";

import { StatTile } from "@/components/common/stat-tile";
import { useHlOpenInterest } from "@/hooks/use-cda-data";
import { useNow } from "@/hooks/use-now";
import type { WhalesData } from "@/lib/cda/types";
import { fmtClock, fmtInt, fmtPct, fmtUsd, relTime } from "@/lib/format";

export function WhaleStats({ data, loading }: { data: WhalesData | undefined; loading: boolean }) {
  const oi = useHlOpenInterest();
  const now = useNow(10_000);
  const s = data?.summary;
  const longPct = s?.longPct ?? null;
  const bias = (s?.netBias ?? "").toLowerCase();
  const biasMarker = bias === "long" ? "long" : bias === "short" ? "short" : null;
  const whales = s?.byClass?.whale;
  const mms = s?.byClass?.market_maker;
  const updated = data?.positionsAsOf ?? data?.timestamp ?? null;

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
      <StatTile
        label="Whale long share"
        loading={loading}
        value={fmtPct(longPct)}
        marker={longPct === null ? null : longPct >= 50 ? "long" : "short"}
        sub={s?.longShortRatio != null ? `L/S ratio ${s.longShortRatio.toFixed(2)}` : undefined}
      />
      <StatTile
        label="Net bias"
        loading={loading}
        value={<span className="capitalize">{s?.netBias ?? "—"}</span>}
        marker={biasMarker}
        sub={s?.netUsd != null ? `Net ${fmtUsd(s.netUsd, { sign: true })}` : undefined}
      />
      <StatTile label="Long notional" loading={loading} value={fmtUsd(s?.longUsd)} marker="long" sub="Whale longs, gross" />
      <StatTile label="Short notional" loading={loading} value={fmtUsd(s?.shortUsd)} marker="short" sub="Whale shorts, gross" />
      <StatTile
        label="Accounts tracked"
        loading={loading}
        value={fmtInt(s?.accounts)}
        sub={whales != null || mms != null ? `${fmtInt(whales)} whales · ${fmtInt(mms)} MMs` : undefined}
      />
      <StatTile
        label="HL open interest"
        loading={oi.isLoading}
        value={oi.data ? fmtUsd(oi.data.totalOiUsd) : oi.gate !== "ok" ? "—" : fmtUsd(null)}
        sub={oi.data ? `${Object.keys(oi.data.byCoin).length} perps` : oi.gate === "ok" ? undefined : "Needs a key"}
      />
      <StatTile
        label="Positions as of"
        loading={loading}
        value={relTime(updated, now)}
        sub={updated ? fmtClock(updated) : undefined}
      />
    </div>
  );
}
