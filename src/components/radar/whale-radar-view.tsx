"use client";

import Link from "next/link";
import { KeyRound, LoaderCircle, Lock, RefreshCw } from "lucide-react";
import { ErrorState } from "@/components/common/gate-notice";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccess } from "@/hooks/use-access";
import { useWhales } from "@/hooks/use-cda-data";
import { DEMO_WHALE_COINS } from "@/lib/cda/demo";
import { TIER_LABEL } from "@/lib/cda/types";
import { RadarChart, RadarLegend } from "./radar-chart";
import { WhaleHistoryChart } from "./whale-history-chart";
import { WhaleStats } from "./whale-stats";
import { WhaleTable } from "./whale-table";

function DemoPanel({ reason }: { reason: "no-key" | "upgrade" | "invalid-key" | "demo" }) {
  const copy = {
    "no-key": {
      icon: KeyRound,
      title: "Add your CryptoDataApi key to see live whale positioning",
      body: "Below is a sample of what the radar shows. Whale positioning comes from /quant/whales, which needs a Pro key; a free key already unlocks charts and the delayed alerts feed.",
    },
    upgrade: {
      icon: Lock,
      title: "Whale positioning needs a Pro key",
      body: "Your key works, but /quant/whales is a Pro endpoint. Below is sample data; upgrade to see all ~60 coins refreshed every 5 minutes.",
    },
    "invalid-key": {
      icon: KeyRound,
      title: "Your API key was rejected",
      body: "Check the key in Settings. Showing sample data meanwhile.",
    },
    demo: {
      icon: KeyRound,
      title: "Demo mode is on",
      body: "Your key is not being used. Turn demo mode off in Settings to load live data.",
    },
  }[reason];
  const Icon = copy.icon;
  return (
    <Card className="border-none ring-1 ring-liq/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="size-4 text-liq" aria-hidden /> {copy.title}
        </CardTitle>
        <CardDescription>{copy.body}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button asChild>
          <Link href="/settings">Add your CDA key</Link>
        </Button>
        <Button asChild variant="secondary">
          <a href="https://cryptodataapi.com/pricing" target="_blank" rel="noreferrer">
            See plans
          </a>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/alerts">Open the delayed alerts feed</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export function WhaleRadarView() {
  const access = useAccess();
  const whales = useWhales();
  const gate = whales.gate;

  const header = (
    <PageHeader
      title="Whale Radar"
      description="Where Hyperliquid whales lean right now, ranked against each coin's own 30-day history."
      actions={
        gate === "ok" && (
          <Button variant="ghost" size="sm" onClick={whales.refetch} disabled={whales.isFetching}>
            {whales.isFetching ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
            Refresh
          </Button>
        )
      }
    />
  );

  if (gate === "loading" || (gate === "ok" && whales.isLoading && !whales.data)) {
    return (
      <>
        {header}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
          {Array.from({ length: 7 }, (_, i) => (
            <Skeleton key={i} className="h-[72px]" />
          ))}
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          <Skeleton className="aspect-square w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </>
    );
  }

  if (gate !== "ok") {
    const reason = access.demoMode && gate === "no-key" ? "demo" : gate;
    return (
      <>
        {header}
        <div className="flex flex-col gap-4">
          <DemoPanel reason={reason} />
          <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
            <Card size="sm">
              <CardContent className="flex flex-col gap-3">
                <RadarChart coins={DEMO_WHALE_COINS} sample />
                <RadarLegend />
              </CardContent>
            </Card>
            <Card size="sm">
              <CardHeader>
                <CardTitle>Sample rows</CardTitle>
                <CardDescription>Illustrative values, not live data.</CardDescription>
              </CardHeader>
              <CardContent>
                <WhaleTable coins={DEMO_WHALE_COINS} compact />
              </CardContent>
            </Card>
          </div>
        </div>
      </>
    );
  }

  const data = whales.data;
  const isFree = access.tier === "free";

  return (
    <>
      {header}
      <div className="flex flex-col gap-4">
        {whales.error && <ErrorState error={whales.error} onRetry={whales.refetch} />}
        {isFree && (
          <p className="rounded-lg border border-liq/30 bg-liq/5 px-3 py-2 text-sm">
            Free preview: {TIER_LABEL.free} keys see a limited set of coins.{" "}
            <a href="https://cryptodataapi.com/pricing" target="_blank" rel="noreferrer" className="underline underline-offset-2">
              Upgrade to Pro
            </a>{" "}
            for the full universe.
          </p>
        )}
        <WhaleStats data={data} loading={!data} />
        {data && (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
            <Card size="sm" className="self-start">
              <CardHeader>
                <CardTitle>Positioning radar</CardTitle>
                <CardDescription>{data.coins.length} coins · click a blip to open its chart</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <RadarChart coins={data.coins} />
                <RadarLegend />
              </CardContent>
            </Card>
            <Card size="sm" className="min-w-0">
              <CardHeader>
                <CardTitle>Coins by whale exposure</CardTitle>
                <CardDescription>Sort any column; click a row for the chart with whale trades.</CardDescription>
              </CardHeader>
              <CardContent>
                <WhaleTable coins={data.coins} />
              </CardContent>
            </Card>
          </div>
        )}
        <WhaleHistoryChart />
        {data?.note && <p className="text-[11px] text-muted-foreground">{data.note}</p>}
      </div>
    </>
  );
}
