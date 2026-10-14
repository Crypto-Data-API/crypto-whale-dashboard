import type { Metadata } from "next";
import { Users } from "lucide-react";
import { ComingSoon } from "@/components/common/coming-soon";
import { PageHeader } from "@/components/common/page-header";

export const metadata: Metadata = { title: "Whale Traders" };

export default function TradersPage() {
  return (
    <>
      <PageHeader title="Whale Traders" description="Hyperliquid wallets worth following: leaderboard, profiles, watchlists and webhooks." />
      <ComingSoon
        icon={Users}
        intro="Milestone 5. The leaderboard, wallet search, trader profiles (with trades plotted on the coin chart), a synced watchlist and webhook alerts are planned for this page."
        sections={[
          {
            title: "Leaderboard",
            description: "Top Hyperliquid traders by PnL, win rate and profit factor.",
            endpoints: [{ path: "GET /hyperliquid/top-traders" }, { path: "GET /hyperliquid/trader-profiles" }],
          },
          {
            title: "Wallet search",
            description: "Filter wallets by score, win rate and profit factor.",
            endpoints: [{ path: "GET /hyperliquid/wallets/search" }],
          },
          {
            title: "Copy signals",
            description: "Entries and exits from high-scoring wallets.",
            endpoints: [{ path: "GET /hyperliquid/copy-signals", tier: "Pro" }, { path: "GET /hyperliquid/wallet-signals" }],
          },
          {
            title: "Trader profile",
            description: "Open positions and trade history for a single address.",
            endpoints: [
              { path: "GET /hyperliquid/trader-profile/{address}" },
              { path: "GET /hyperliquid/wallet-positions" },
              { path: "GET /hyperliquid/wallet-trades/{address}" },
            ],
          },
          {
            title: "Watchlist",
            description: "Track wallets and auto-suggest new ones.",
            endpoints: [
              { path: "GET/POST/DELETE /hyperliquid/watchlist", tier: "Pro" },
              { path: "GET /hyperliquid/watchlist/auto", tier: "Pro" },
            ],
          },
          {
            title: "Webhooks",
            description: "Push ENTRY / EXIT / INCREASE / DECREASE for watched wallets to your URL.",
            endpoints: [{ path: "POST /webhooks", tier: "Pro" }],
          },
        ]}
      />
    </>
  );
}
