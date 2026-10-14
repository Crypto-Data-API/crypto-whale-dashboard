import type { Metadata } from "next";
import { LiveFeed } from "@/components/alerts/live-feed";
import { SpikeAlerts } from "@/components/alerts/spike-alerts";
import { PageHeader } from "@/components/common/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const metadata: Metadata = { title: "Whale Alerts" };

export default function AlertsPage() {
  return (
    <>
      <PageHeader
        title="Whale Alerts"
        description="Whale positions, on-chain transfers, liquidations and market moves as they happen."
      />
      <Tabs defaultValue="feed" className="gap-3">
        <TabsList>
          <TabsTrigger value="feed">Live feed</TabsTrigger>
          <TabsTrigger value="spikes">Exchange flow spikes</TabsTrigger>
        </TabsList>
        <TabsContent value="feed">
          <LiveFeed />
        </TabsContent>
        <TabsContent value="spikes">
          <SpikeAlerts />
        </TabsContent>
      </Tabs>
    </>
  );
}
