"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { deckButton } from "@/components/deck/button";
import { ClockIcon } from "@/components/deck/icons";
import { useNow } from "@/hooks/use-now";
import { streamManager } from "@/lib/cda/stream";
import { EVENT_LABEL, EVENT_TYPES, isEventType, type CdaEvent, type EventType } from "@/lib/cda/types";
import { exceedsThreshold, matchesFeed, parseSymbolFilter } from "@/lib/events";
import { fmtClock, fmtInt, fmtUsd } from "@/lib/format";
import { requestNotificationPermission, unlockAudio } from "@/lib/notify";
import { DECK } from "@/lib/palette";
import { useSettings } from "@/stores/settings";
import { useStream, type StreamStatus } from "@/stores/stream";
import { EventRow, TYPE_STYLE } from "./event-row";

const RENDER_CAP = 300;
const MINS = [0, 10_000, 50_000, 100_000, 500_000, 1_000_000];
const MIN_LABELS = ["Any", "$10K", "$50K", "$100K", "$500K", "$1M"];
const FRESH_MS = 4500;

function minIndex(v: number): number {
  let idx = 0;
  MINS.forEach((m, i) => {
    if (v >= m) idx = i;
  });
  return idx;
}

function DelayedBanner() {
  const mode = useStream((s) => s.mode);
  const message = useStream((s) => s.message);
  const windowEnd = useStream((s) => s.delayedWindowEnd);
  if (mode !== "delayed") return null;
  return (
    <div className="flex flex-wrap items-start gap-4 rounded-[18px] border border-gold/35 bg-[linear-gradient(180deg,rgba(255,197,61,.07),rgba(9,11,22,.8))] px-5 py-4">
      <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-gold/12 text-gold">
        <ClockIcon size={17} />
      </span>
      <div className="min-w-0 flex-1 basis-72">
        <p className="m-0 font-display text-[15px] font-semibold text-gold">Delayed (30 min)</p>
        <p className="m-0 mt-1 text-[13px] text-ink-muted">
          {message ? `${message} ` : ""}Without a Pro key the feed polls the free delayed stream every 60s: a 3-minute window that ended 30 minutes ago
          {windowEnd ? ` (latest window ended ${fmtClock(windowEnd)})` : ""}.
        </p>
      </div>
      <Link href="/settings" className={deckButton({ size: "sm" })}>
        ADD A PRO KEY FOR REAL-TIME
      </Link>
    </div>
  );
}

const STREAM_TEXT: Record<StreamStatus, { text: string; color: string }> = {
  live: { text: "Live", color: DECK.long },
  delayed: { text: "Delayed 30m", color: DECK.amber },
  sample: { text: "Sample replay", color: DECK.long },
  connecting: { text: "Connecting…", color: DECK.amber },
  reconnecting: { text: "Reconnecting…", color: DECK.amber },
  error: { text: "Error", color: DECK.short },
  off: { text: "Off", color: DECK.short },
  idle: { text: "Idle", color: DECK.dim },
};

/** Toggle button from the design: coloured border + glow when on. */
function ToggleButton({
  on,
  color,
  glyph,
  label,
  onClick,
  title,
}: {
  on: boolean;
  color: string;
  glyph: string;
  label: string;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      title={title}
      onClick={onClick}
      className="flex cursor-pointer items-center gap-[7px] rounded-[10px] border px-3.5 py-[9px] font-display text-[12.5px] font-semibold tracking-[.05em] transition-colors"
      style={
        on
          ? { color, background: "rgba(0,245,212,.08)", borderColor: color, boxShadow: `0 0 14px ${color}44` }
          : { color: DECK.soft, background: "transparent", borderColor: "rgba(120,140,255,.16)" }
      }
    >
      {glyph} {label}
    </button>
  );
}

/** Ids of live SSE events received in the last few seconds (row highlight). */
function useFreshIds(): ReadonlySet<number> {
  const [fresh, setFresh] = useState<ReadonlySet<number>>(() => new Set());
  useEffect(() => {
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const off = streamManager.onLiveEvents((events) => {
      const ids = events.map((e) => e.id);
      setFresh((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.add(id);
        return next;
      });
      const t = setTimeout(() => {
        timers.delete(t);
        setFresh((prev) => {
          const next = new Set(prev);
          for (const id of ids) next.delete(id);
          return next;
        });
      }, FRESH_MS);
      timers.add(t);
    });
    return () => {
      off();
      for (const t of timers) clearTimeout(t);
    };
  }, []);
  return fresh;
}

export function LiveFeed() {
  const events = useStream((s) => s.events);
  const clear = useStream((s) => s.clear);
  const status = useStream((s) => s.status);
  const streamMessage = useStream((s) => s.message);
  const mode = useStream((s) => s.mode);
  const liveReceived = useStream((s) => s.liveReceived);
  const feed = useSettings((s) => s.feed);
  const thresholds = useSettings((s) => s.thresholds);
  const setFeed = useSettings((s) => s.setFeed);
  const setFeedType = useSettings((s) => s.setFeedType);
  const now = useNow(5000);
  const fresh = useFreshIds();
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
  const minIdx = minIndex(feed.minUsd);
  const minLabel = feed.minUsd === MINS[minIdx] ? MIN_LABELS[minIdx] : `≥ ${fmtUsd(feed.minUsd)}`;
  const stream = frozen ? { text: "Paused", color: DECK.amber } : STREAM_TEXT[status];

  return (
    <>
      <DelayedBanner />

      <div className="flex flex-col gap-[18px] rounded-[18px] border border-iris/13 bg-panel p-4 sm:p-5">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Event types">
          {EVENT_TYPES.map((type: EventType) => {
            const on = feed.types[type];
            const st = TYPE_STYLE[type];
            return (
              <button
                key={type}
                type="button"
                aria-pressed={on}
                onClick={() => setFeedType(type, !on)}
                className="flex cursor-pointer items-center gap-2 rounded-[10px] border px-[13px] py-2 font-sans text-[13px] font-semibold transition-colors"
                style={
                  on
                    ? { color: DECK.text, background: "rgba(120,140,255,.08)", borderColor: "rgba(120,140,255,.3)" }
                    : { color: DECK.dim, background: "transparent", borderColor: "rgba(120,140,255,.12)" }
                }
              >
                <span
                  className="grid size-[22px] place-items-center rounded-[7px] text-[12px]"
                  style={{ color: st.color, background: on ? "rgba(120,140,255,.12)" : "transparent", opacity: on ? 1 : 0.4 }}
                  aria-hidden
                >
                  {st.glyph}
                </span>
                {EVENT_LABEL[type]}
                <span className="font-mono text-[11px] text-ink-muted">{fmtInt(counts[type] ?? 0)}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-end gap-6">
          <label className="flex w-[240px] flex-col gap-2">
            <span className="flex justify-between text-[12px] text-ink-soft">
              <span>Min size</span>
              <span className="font-mono text-long">{minLabel}</span>
            </span>
            <input
              type="range"
              min={0}
              max={MINS.length - 1}
              step={1}
              value={minIdx}
              onChange={(e) => setFeed({ minUsd: MINS[Number(e.target.value)] ?? 0 })}
              aria-label="Minimum USD size"
              className="w-full cursor-pointer accent-long"
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-[12px] text-ink-soft">Symbols</span>
            <input
              value={feed.symbols}
              onChange={(e) => setFeed({ symbols: e.target.value })}
              placeholder="e.g. BTC, ETH (blank = all)"
              className="w-[240px] rounded-[10px] border border-iris/16 bg-field px-3 py-[9px] font-mono text-[12px] text-ink outline-none focus:border-long/40"
            />
          </label>
          <div className="ml-auto flex flex-wrap gap-2">
            <ToggleButton
              on={frozen !== null}
              color={DECK.amber}
              glyph={frozen ? "▶" : "❚❚"}
              label={frozen ? `RESUME${newWhilePaused ? ` (+${newWhilePaused})` : ""}` : "PAUSE"}
              onClick={() => setFrozen(frozen ? null : events)}
            />
            <ToggleButton
              on={feed.sound}
              color={DECK.long}
              glyph="♪"
              label="SOUND"
              title="Beep for live events above your per-type thresholds (Settings)"
              onClick={() => {
                if (!feed.sound) unlockAudio();
                setFeed({ sound: !feed.sound });
              }}
            />
            <ToggleButton
              on={feed.notifications}
              color={DECK.long}
              glyph={feed.notifications ? "●" : "○"}
              label="NOTIFY"
              title="Browser notifications for live events above your per-type thresholds (Settings)"
              onClick={async () => {
                if (feed.notifications) return setFeed({ notifications: false });
                const perm = await requestNotificationPermission();
                if (perm === "granted") setFeed({ notifications: true });
                else toast.error(perm === "unsupported" ? "This browser does not support notifications." : "Notification permission was not granted.");
              }}
            />
            <button type="button" title="Clear feed" onClick={() => clear()} className={deckButton({ variant: "danger", className: "px-3 py-[9px] text-[12.5px] tracking-normal" })}>
              CLEAR
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-[18px] gap-y-2 font-mono text-[12px] text-ink-muted">
        <span className="flex items-center gap-2" title={streamMessage ?? undefined}>
          Stream
          <span className="size-2 rounded-full" style={{ background: stream.color, boxShadow: `0 0 10px ${stream.color}` }} />
          <span style={{ color: stream.color }}>{stream.text}</span>
        </span>
        <span>
          <span className="text-ink">{fmtInt(source.length)}</span> buffered
        </span>
        {mode === "live" && (
          <span>
            <span className="text-ink">{fmtInt(liveReceived)}</span> received live
          </span>
        )}
        <button type="button" onClick={() => streamManager.restart()} className="cursor-pointer border-0 bg-transparent p-0 font-mono text-[12px] text-ink-dim hover:text-long">
          ↻ reconnect
        </button>
        <span className="ml-auto">
          Showing {fmtInt(matched)} of {fmtInt(source.length)}
        </span>
      </div>

      <div className="overflow-hidden rounded-[18px] border border-iris/13 bg-panel">
        <div className="flex flex-col" role="list" aria-label="Whale alert feed">
          {rows.map((e) => (
            <EventRow key={e.id} event={e} now={now} fresh={fresh.has(e.id)} highlight={isEventType(e.type) && exceedsThreshold(e, thresholds)} />
          ))}
          {rows.length === 0 && (
            <div className="px-5 py-[60px] text-center text-[14px] text-ink-muted">
              {source.length === 0 ? "Waiting for events…" : "No events match these filters yet."}
            </div>
          )}
        </div>
        {matched > rows.length && (
          <p className="m-0 border-t border-iris/7 px-4 py-2.5 text-center font-mono text-[11.5px] text-ink-dim">
            Showing the newest {fmtInt(rows.length)} of {fmtInt(matched)} matching events.
          </p>
        )}
      </div>
    </>
  );
}
