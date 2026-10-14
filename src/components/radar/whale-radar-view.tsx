"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { DeckSkeleton, ErrorState } from "@/components/common/gate-notice";
import { GetKeyPrompt, useGetKeyBanner } from "@/components/deck/get-key-prompt";
import { PageHead, RefreshButton, UpdatedAgo } from "@/components/deck/page-head";
import { useAccess } from "@/hooks/use-access";
import { CoinSearch } from "@/components/layout/coin-search";
import { useWhales } from "@/hooks/use-cda-data";
import { DEMO_WHALE_COINS } from "@/lib/cda/demo";
import { TIER_LABEL } from "@/lib/cda/types";
import { DemoBanner, type DemoReason } from "./demo-banner";
import { RadarLegend, RadarScope } from "./radar-scope";
import { toRadarCoins, topByGross, type RadarCoin } from "./radar-model";
import { ExtremesPanel, SelectedCoinCard } from "./selected-coin-card";
import { WhaleHistoryChart } from "./whale-history-chart";
import { WhaleKpis } from "./whale-kpis";

/** Radar panel + right column (KPIs, selected coin, extremes). */
function RadarSection({
  coins,
  initialSel,
  kpis,
  sample = false,
}: {
  coins: RadarCoin[];
  initialSel: string | null;
  kpis: ReactNode;
  sample?: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(initialSel);
  const current = useMemo(() => {
    const want = selected?.toUpperCase();
    return coins.find((c) => c.symbol === selected) ?? coins.find((c) => c.symbol.toUpperCase() === want) ?? topByGross(coins);
  }, [coins, selected]);

  return (
    <section className="flex flex-wrap gap-[22px]">
      <div className="relative flex min-w-0 flex-[3_1_560px] flex-col gap-1.5 overflow-hidden rounded-[18px] border border-iris/13 bg-panel p-3.5">
        <CoinSearch className="absolute top-3.5 left-3.5 z-[60] w-[220px]" />
        <RadarScope coins={coins} selected={current?.symbol ?? null} onSelect={setSelected} sample={sample} />
        <RadarLegend />
      </div>
      <div className="flex min-w-0 flex-[1_1_340px] flex-col gap-4">
        {kpis}
        {current ? (
          <SelectedCoinCard rc={current} onOpen={() => router.push(`/coin/${encodeURIComponent(current.symbol)}`)} />
        ) : (
          <div className="rounded-[18px] border border-iris/13 bg-panel p-[22px] text-[13px] text-ink-muted">No coins with whale positioning yet.</div>
        )}
        <ExtremesPanel coins={coins} onSelect={setSelected} />
      </div>
    </section>
  );
}

/** Radar for the current URL: `/?sel=ETH` preselects a coin (Whale Exposure table, coin page "back"). */
export function WhaleRadarFromUrl() {
  const raw = useSearchParams().get("sel");
  const initialSel = raw ? raw.trim().slice(0, 32) || null : null;
  return <WhaleRadarView key={initialSel ?? ""} initialSel={initialSel} />;
}

/** Sample-data call to action above the radar (hidden in Demo mode and once dismissed). */
function SampleBanner() {
  const access = useAccess();
  const banner = useGetKeyBanner();
  if (access.source !== "sample" || access.demoMode || !banner.show) return null;
  return <GetKeyPrompt variant="banner" onDismiss={banner.dismiss} />;
}

export function WhaleRadarView({ initialSel }: { initialSel: string | null }) {
  const access = useAccess();
  const whales = useWhales();
  const gate = whales.gate;
  const data = whales.data;
  const coins = useMemo(() => toRadarCoins(data?.coins ?? []), [data]);
  const demoCoins = useMemo(() => toRadarCoins(DEMO_WHALE_COINS), []);

  const header = (
    <PageHead
      title="Crypto Whale Radar"
      right={
        gate === "ok" && (
          <>
            <UpdatedAgo ts={data?.positionsAsOf ?? data?.timestamp ?? (whales.dataUpdatedAt || null)} />
            <RefreshButton onClick={whales.refetch} busy={whales.isFetching} />
          </>
        )
      }
    />
  );

  if (gate === "loading" || (gate === "ok" && whales.isLoading && !data)) {
    return (
      <>
        {header}
        <section className="flex flex-wrap gap-[22px]">
          <div className="flex min-w-0 flex-[3_1_560px] items-center justify-center rounded-[18px] border border-iris/13 bg-panel p-3.5">
            <DeckSkeleton className="aspect-square w-[min(100%,max(560px,calc(100vh-190px)))] rounded-full" />
          </div>
          <div className="flex min-w-0 flex-[1_1_340px] flex-col gap-4">
            <div className="grid grid-cols-2 gap-2">
              {Array.from({ length: 6 }, (_, i) => (
                <DeckSkeleton key={i} className="h-[58px]" />
              ))}
            </div>
            <DeckSkeleton className="h-[420px] rounded-[18px]" />
          </div>
        </section>
      </>
    );
  }

  if (gate !== "ok") {
    const reason: DemoReason = access.demoMode && gate === "no-key" ? "demo" : gate;
    return (
      <>
        {header}
        <DemoBanner reason={reason} />
        <RadarSection coins={demoCoins} initialSel={initialSel} sample kpis={null} />
      </>
    );
  }

  return (
    <>
      {header}
      <SampleBanner />
      {whales.error && <ErrorState error={whales.error} onRetry={whales.refetch} />}
      {access.tier === "free" && (
        <p className="m-0 rounded-[14px] border border-gold/30 bg-gold/5 px-4 py-2.5 text-[13px] text-ink-soft">
          Free preview: {TIER_LABEL.free} keys see a limited set of coins.{" "}
          <a href="https://cryptodataapi.com/pricing" target="_blank" rel="noreferrer" className="text-long hover:text-long-hover">
            Upgrade to Pro
          </a>{" "}
          for the full universe.
        </p>
      )}
      {data && <RadarSection coins={coins} initialSel={initialSel} kpis={<WhaleKpis data={data} loading={false} />} />}
      <WhaleHistoryChart />
      {data?.note && <p className="m-0 text-[11.5px] leading-relaxed text-ink-dim">{data.note}</p>}
    </>
  );
}
