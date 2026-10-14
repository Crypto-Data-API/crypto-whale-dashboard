"use client";

import { useState } from "react";
import { PageHead } from "@/components/deck/page-head";
import { Segmented } from "@/components/deck/segmented";
import { LiveFeed } from "./live-feed";
import { SpikeAlerts } from "./spike-alerts";

type Tab = "feed" | "flows";

export function AlertsView() {
  const [tab, setTab] = useState<Tab>("feed");
  return (
    <>
      <PageHead
        title="Whale Alerts"
        right={
          <Segmented<Tab>
            variant="tabs"
            ariaLabel="Alerts view"
            value={tab}
            onChange={setTab}
            options={[
              { value: "feed", label: "Live feed" },
              { value: "flows", label: "Exchange flow spikes" },
            ]}
          />
        }
      />
      {tab === "feed" ? <LiveFeed /> : <SpikeAlerts />}
    </>
  );
}
