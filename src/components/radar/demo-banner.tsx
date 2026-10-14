"use client";

import Link from "next/link";
import { deckButton } from "@/components/deck/button";
import { KeyIcon, LockIcon } from "@/components/deck/icons";

export type DemoReason = "no-key" | "upgrade" | "invalid-key" | "demo";

const DEMO_COPY: Record<DemoReason, { title: string; body: string; lock?: boolean }> = {
  "no-key": {
    title: "Add your CryptoDataApi key to see live whale positioning",
    body: "Below is sample data. Whale positioning comes from /quant/whales, which needs a Pro key; a free key already unlocks charts and the delayed alerts feed.",
  },
  upgrade: {
    title: "Whale positioning needs a Pro key",
    body: "Your key works, but /quant/whales is a Pro endpoint. Below is sample data; upgrade to see all ~60 coins refreshed every 5 minutes.",
    lock: true,
  },
  "invalid-key": { title: "Your API key was rejected", body: "Check the key in Settings. Showing sample data meanwhile." },
  demo: { title: "Demo mode is on", body: "Your key is not being used. Turn demo mode off in Settings to load live data." },
};

export function DemoBanner({ reason }: { reason: DemoReason }) {
  const copy = DEMO_COPY[reason];
  const Icon = copy.lock ? LockIcon : KeyIcon;
  return (
    <div className="flex flex-wrap items-start gap-4 rounded-[18px] border border-gold/30 bg-[linear-gradient(180deg,rgba(255,197,61,.06),rgba(9,11,22,.8))] p-5">
      <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-gold/12 text-gold">
        <Icon size={17} />
      </span>
      <div className="min-w-0 flex-1 basis-72">
        <p className="m-0 font-display text-[16px] font-semibold">{copy.title}</p>
        <p className="m-0 mt-1 text-[13px] text-ink-muted">{copy.body}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href="/settings" className={deckButton({ size: "sm" })}>
          ADD YOUR CDA KEY
        </Link>
        <a href="https://cryptodataapi.com/pricing" target="_blank" rel="noreferrer" className={deckButton({ variant: "ghost", size: "sm" })}>
          SEE PLANS
        </a>
        <Link href="/alerts" className={deckButton({ variant: "ghost", size: "sm" })}>
          DELAYED ALERTS FEED
        </Link>
      </div>
    </div>
  );
}
