import type { Metadata } from "next";
import { ScanSearch } from "lucide-react";
import { ComingSoon } from "@/components/common/coming-soon";
import { PageHeader } from "@/components/common/page-header";

export const metadata: Metadata = { title: "Scanners" };

export default function ScannersPage() {
  return (
    <>
      <PageHeader title="Scanners" description="Screens for unusual activity across the whole universe." />
      <ComingSoon
        icon={ScanSearch}
        intro="Milestone 6. Volume spikes, trend radar, OI divergence, unlocks, news pulse, DEX trending and a follow-vs-fade-the-whales backtest are planned."
        sections={[
          {
            title: "Volume spikes",
            description: "Relative volume vs each coin's 30-day baseline.",
            endpoints: [{ path: "GET /volume/scanner" }],
          },
          {
            title: "Trend radar",
            description: "Signum RGG trend states and the indicator heatmap.",
            endpoints: [{ path: "GET /indicators/signum-rgg" }, { path: "GET /indicators/heatmap" }],
          },
          {
            title: "OI divergence",
            description: "Price and open interest moving in opposite directions.",
            endpoints: [{ path: "GET /liquidity/oi-divergence" }],
          },
          {
            title: "Token unlocks",
            description: "Upcoming vesting cliffs sized against circulating float.",
            endpoints: [{ path: "GET /supply/unlocks" }, { path: "GET /supply/float" }],
          },
          {
            title: "News pulse",
            description: "Per-coin news pressure and tilt, plus market-moving stories.",
            endpoints: [{ path: "GET /news/pulse" }, { path: "GET /news/market-moving" }],
          },
          {
            title: "Follow vs fade the whales",
            description: "Backtest whale positioning snapshots against price.",
            endpoints: [
              { path: "GET /backtesting/snapshots?data_type=whale_activity", tier: "Pro Plus" },
              { path: "GET /backtesting/klines", tier: "Pro Plus" },
            ],
          },
          {
            title: "Squeeze alerts",
            description: "Liquidation-flow tripwire for squeeze setups.",
            endpoints: [{ path: "GET /market-intelligence/squeeze-alerts" }],
          },
          {
            title: "DEX trending",
            description: "Trending DEX pairs with a rug check.",
            endpoints: [{ path: "GET /dex/trending" }, { path: "GET /dex/security/…" }],
          },
        ]}
      />
    </>
  );
}
