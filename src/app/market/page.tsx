import type { Metadata } from "next";
import { Activity } from "lucide-react";
import { ComingSoon } from "@/components/common/coming-soon";
import { PageHeader } from "@/components/common/page-header";

export const metadata: Metadata = { title: "Market Overview" };

export default function MarketPage() {
  return (
    <>
      <PageHeader title="Market Overview" description="The backdrop for whale activity: health, sentiment, regimes and derivatives." />
      <ComingSoon
        icon={Activity}
        intro="Milestone 6. Market health, fear & greed, regime scores and derivatives context will live here."
        sections={[
          {
            title: "Market health",
            description: "Dual long/short-term score with 11 components and 90-day history.",
            endpoints: [{ path: "GET /market-health" }, { path: "GET /market-health/history?days=90" }],
          },
          {
            title: "Sentiment",
            description: "Fear & greed, stablecoin flows and macro.",
            endpoints: [
              { path: "GET /sentiment/fear-greed" },
              { path: "GET /sentiment/stablecoins" },
              { path: "GET /sentiment/macro" },
            ],
          },
          {
            title: "Regimes",
            description: "Market regime with direction, volatility and liquidity probabilities.",
            endpoints: [{ path: "GET /regimes" }, { path: "GET /quant/market", tier: "Pro" }],
          },
          {
            title: "Regime scores",
            description: "One row of regime gauges across volatility, liquidity, meme, events, security, policy and on-chain.",
            endpoints: [
              { path: "GET /volatility/regime/score" },
              { path: "GET /liquidity/regime/score" },
              { path: "GET /meme/regime/score" },
              { path: "GET /event/regime/score" },
              { path: "GET /security/regime/score" },
              { path: "GET /policy/regime/score" },
              { path: "GET /on-chain/score" },
            ],
          },
          {
            title: "Derivatives",
            description: "Funding, OI and liquidations by exchange.",
            endpoints: [
              { path: "GET /derivatives/summary" },
              { path: "GET /market-intelligence/liquidations/by-exchange" },
            ],
          },
          {
            title: "Flows & premium",
            description: "BTC ETF flows and the Coinbase premium.",
            endpoints: [
              { path: "GET /market-intelligence/etf/btc/flows" },
              { path: "GET /market-intelligence/coinbase-premium" },
            ],
          },
        ]}
      />
    </>
  );
}
