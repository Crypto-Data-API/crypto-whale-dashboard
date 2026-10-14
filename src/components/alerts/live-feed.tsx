"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Bell, BellOff, Clock, Pause, Play, RotateCw, Trash, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { useNow } from "@/hooks/use-now";
import { streamManager } from "@/lib/cda/stream";
import { EVENT_LABEL, EVENT_TYPES, isEventType, type CdaEvent, type EventType } from "@/lib/cda/types";
import { exceedsThreshold, matchesFeed, parseSymbolFilter } from "@/lib/events";
import { fmtClock, fmtInt, fmtUsd } from "@/lib/format";
import { requestNotificationPermission, unlockAudio } from "@/lib/notify";
import { cn } from "@/lib/utils";
import { useSettings } from "@/stores/settings";
import { useStream } from "@/stores/stream";
import { EventRow, TYPE_META } from "./event-row";

const RENDER_CAP = 300;
const USD_STEPS = [0, 1_000, 10_000, 50_000, 100_000, 250_000, 500_000, 1_000_000, 5_000_000, 10_000_000];

function stepIndex(v: number): number {
  let idx = 0;
  USD_STEPS.forEach((s, i) => {
    if (v >= s) idx = i;
  });
  return idx;
}

function DelayedBanner() {
  const mode = useStream((s) => s.mode);
  const message = useStream((s) => s.message);
  const windowEnd = useStream((s) => s.delayedWindowEnd);
  if (mode !== "delayed") return null;
  return (
    <div className="flex flex-wrap items-start gap-3 rounded-lg border border-liq/40 bg-liq/5 px-3 py-2.5 text-sm">
      <Clock className="mt-0.5 size-4 shrink-0 text-liq" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium">Delayed (30 min)</p>
        <p className="text-muted-foreground">
          {message ? `${message} ` : ""}Without a Pro key the feed polls the free delayed stream every 60s: a 3-minute window that ended 30
          minutes ago{windowEnd ? ` (latest window ended ${fmtClock(windowEnd)})` : ""}.
        </p>
      </div>
      <Button asChild size="sm" variant="secondary">
        <Link href="/settings">Add a Pro key for real-time</Link>
      </Button>
    </div>
  );
}

function StreamBar({ onReconnect }: { onReconnect: () => void }) {
  const status = useStream((s) => s.status);
  const message = useStream((s) => s.message);
  const total = useStream((s) => s.events.length);
  const liveReceived = useStream((s) => s.liveReceived);
  const mode = useStream((s) => s.mode);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span>
        Stream: <span className="font-medium text-foreground capitalize">{status}</span>
        {message && status !== "delayed" ? ` · ${message}` : ""}
      </span>
      <span>{fmtInt(total)} buffered</span>
      {mode === "live" && <span>{fmtInt(liveReceived)} received live</span>}
      <Button size="xs" variant="ghost" onClick={onReconnect} className="-ml-1">
        <RotateCw /> Reconnect
      </Button>
    </div>
  );
}

export function LiveFeed() {
  const events = useStream((s) => s.events);
  const clear = useStream((s) => s.clear);
  const feed = useSettings((s) => s.feed);
  const thresholds = useSettings((s) => s.thresholds);
  const setFeed = useSettings((s) => s.setFeed);
  const setFeedType = useSettings((s) => s.setFeedType);
  const now = useNow(5000);
  const [frozen, setFrozen] = useState<CdaEvent[] | null>(null);

  const source = frozen ?? events;
  const symbols = useMemo(() => parseSymbolFilter(feed.symbols), [feed.symbols]);

  const { rows, matched, counts } = useMemo(() => {
    const counts: Record<string, number> = {};
    const rows: CdaEvent[] = [];
    let matched = 0;
    for (let i = source.length - 1; i >= 0; i--) {
      const e = source[i];
      counts[e.type] = (counts[e.type] ?? 0) + 1;
      if (!matchesFeed(e, feed, symbols)) continue;
      matched++;
      if (rows.length < RENDER_CAP) rows.push(e);
    }
    return { rows, matched, counts };
  }, [source, feed, symbols]);

  let newWhilePaused = 0;
  if (frozen) {
    const lastFrozenId = frozen.length ? frozen[frozen.length - 1].id : 0;
    for (let i = events.length - 1; i >= 0 && events[i].id > lastFrozenId; i--) newWhilePaused++;
  }
  const minIdx = stepIndex(feed.minUsd);

  return (
    <div className="flex flex-col gap-3">
      <DelayedBanner />

      <div className="flex flex-col gap-3 rounded-xl bg-card p-3 ring-1 ring-foreground/10">
        <fieldset className="flex flex-wrap gap-x-4 gap-y-2">
          <legend className="sr-only">Event types</legend>
          {EVENT_TYPES.map((type: EventType) => {
            const Icon = TYPE_META[type].icon;
            return (
              <div key={type} className="flex items-center gap-1.5">
                <Checkbox id={`t-${type}`} checked={feed.types[type]} onCheckedChange={(v) => setFeedType(type, v === true)} />
                <Label htmlFor={`t-${type}`} className="flex items-center gap-1 text-xs font-normal">
                  <Icon className={cn("size-3", TYPE_META[type].chip.split(" ")[1])} aria-hidden />
                  {EVENT_LABEL[type]}
                  <span className="tabular text-muted-foreground">{fmtInt(counts[type] ?? 0)}</span>
                </Label>
              </div>
            );
          })}
        </fieldset>

        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <div className="flex w-full max-w-64 flex-col gap-1.5">
            <Label className="flex justify-between text-xs font-normal">
              <span>Min size</span>
              <span className="tabular font-medium">{feed.minUsd > 0 ? `≥ ${fmtUsd(feed.minUsd)}` : "Any"}</span>
            </Label>
            <Slider
              min={0}
              max={USD_STEPS.length - 1}
              step={1}
              value={[minIdx]}
              onValueChange={(v) => setFeed({ minUsd: USD_STEPS[v[0] ?? 0] })}
              aria-label="Minimum USD size"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sym-filter" className="text-xs font-normal">
              Symbols
            </Label>
            <input
              id="sym-filter"
              value={feed.symbols}
              onChange={(e) => setFeed({ symbols: e.target.value })}
              placeholder="e.g. BTC, ETH (blank = all)"
              className="h-7 w-52 rounded-md border border-input bg-muted/40 px-2 text-xs outline-none focus-visible:border-ring"
            />
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <Button size="sm" variant={frozen ? "default" : "secondary"} onClick={() => setFrozen(frozen ? null : events)}>
              {frozen ? <Play /> : <Pause />}
              {frozen ? `Resume${newWhilePaused ? ` (+${newWhilePaused})` : ""}` : "Pause"}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              aria-pressed={feed.sound}
              onClick={() => {
                if (!feed.sound) unlockAudio();
                setFeed({ sound: !feed.sound });
              }}
            >
              {feed.sound ? <Volume2 /> : <VolumeX />}
              Sound
            </Button>
            <Button
              size="sm"
              variant="secondary"
              aria-pressed={feed.notifications}
              onClick={async () => {
                if (feed.notifications) return setFeed({ notifications: false });
                const perm = await requestNotificationPermission();
                if (perm === "granted") setFeed({ notifications: true });
                else toast.error(perm === "unsupported" ? "This browser does not support notifications." : "Notification permission was not granted.");
              }}
            >
              {feed.notifications ? <Bell /> : <BellOff />}
              Notify
            </Button>
            <Button size="sm" variant="ghost" onClick={() => clear()} aria-label="Clear buffered events">
              <Trash />
            </Button>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Sound and notifications fire for live events above your per-type thresholds (
          <Link href="/settings" className="underline underline-offset-2">
            Settings
          </Link>
          ). Min size applies to events that carry a USD value.
        </p>
      </div>

      <StreamBar onReconnect={() => streamManager.restart()} />

      <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        {rows.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            {events.length === 0 ? "Waiting for events…" : "No events match the current filters."}
          </div>
        ) : (
          <ul aria-label="Whale alert feed">
            {rows.map((e) => (
              <EventRow key={e.id} event={e} now={now} highlight={isEventType(e.type) && exceedsThreshold(e, thresholds)} />
            ))}
          </ul>
        )}
        {matched > rows.length && (
          <p className="border-t border-border px-3 py-2 text-center text-xs text-muted-foreground">
            Showing the newest {fmtInt(rows.length)} of {fmtInt(matched)} matching events.
          </p>
        )}
      </div>
    </div>
  );
}
