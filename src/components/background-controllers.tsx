"use client";

import { useEffect } from "react";
import { useAccess } from "@/hooks/use-access";
import { streamManager } from "@/lib/cda/stream";
import { describeEvent, eventTone, exceedsThreshold, matchesFeed, parseSymbolFilter } from "@/lib/events";
import { EVENT_LABEL, isEventType } from "@/lib/cda/types";
import { STATIC_SAMPLE } from "@/lib/deploy";
import { fmtUsd } from "@/lib/format";
import { beep, showNotification } from "@/lib/notify";
import { useSettings } from "@/stores/settings";
import { restorePersistedEvents } from "@/stores/stream";

/**
 * Chooses the stream mode from the current access level and keeps the
 * singleton StreamManager in sync with it.
 *   Pro / Pro Plus (or tier still unknown) -> live SSE
 *   free tier, no key, invalid key         -> 30-minute delayed polling
 *   static build (GitHub Pages)            -> sample snapshot + replay
 */
export function StreamController() {
  const access = useAccess();
  const apiKey = useSettings((s) => s.apiKey);
  const demoMode = useSettings((s) => s.demoMode);
  const gate = access.gate("pro");
  // Sample source (no key anywhere, or Demo mode) replays the snapshot instead of
  // hitting the real stream, which would fail without a key or spend the server key.
  const mode =
    STATIC_SAMPLE || access.source === "sample" ? "sample" : gate === "loading" ? null : gate === "ok" ? "live" : "delayed";
  const key = STATIC_SAMPLE || demoMode ? "" : apiKey;

  useEffect(() => {
    restorePersistedEvents();
    return () => streamManager.stop();
  }, []);

  useEffect(() => {
    if (!mode) return;
    streamManager.start({ mode, key });
  }, [mode, key]);

  return null;
}

const SOUND_GAP_MS = 1500;
const NOTIFY_GAP_MS = 8000;
const MAX_EVENT_AGE_MS = 5 * 60_000;

/** Plays a beep / shows a browser notification for live events above threshold. */
export function AlertNotifier() {
  useEffect(() => {
    let lastSound = 0;
    let lastNotify = 0;
    return streamManager.onLiveEvents((events) => {
      const s = useSettings.getState();
      if (!s.feed.sound && !s.feed.notifications) return;
      const now = Date.now();
      const symbols = parseSymbolFilter(s.feed.symbols);
      const hits = events.filter(
        (e) =>
          now - e.ts < MAX_EVENT_AGE_MS &&
          matchesFeed(e, { types: s.feed.types, minUsd: 0 }, symbols) &&
          exceedsThreshold(e, s.thresholds),
      );
      if (!hits.length) return;
      const top = hits.reduce((a, b) => ((b.usd ?? 0) > (a.usd ?? 0) ? b : a), hits[0]);
      if (s.feed.sound && now - lastSound > SOUND_GAP_MS) {
        lastSound = now;
        const tone = eventTone(top);
        beep(tone === "long" ? "up" : tone === "short" ? "down" : "neutral");
      }
      if (s.feed.notifications && now - lastNotify > NOTIFY_GAP_MS) {
        lastNotify = now;
        const { headline, detail } = describeEvent(top);
        const label = isEventType(top.type) ? EVENT_LABEL[top.type] : top.type;
        const usd = typeof top.usd === "number" ? ` ${fmtUsd(Math.abs(top.usd))}` : "";
        const more = hits.length > 1 ? ` (+${hits.length - 1} more)` : "";
        showNotification(`${top.symbol} ${label}${usd}`, `${headline}${detail ? ` · ${detail}` : ""}${more}`, `cwd-${top.type}`);
      }
    });
  }, []);
  return null;
}

/** Persists the latest /auth/keys/me result so the tier badge is instant on reload. */
export function KeyInfoSync() {
  const access = useAccess();
  const stored = useSettings((s) => s.keyInfo);
  const setKeyInfo = useSettings((s) => s.setKeyInfo);
  const fresh = access.source === "user" ? access.keyInfo : null;

  useEffect(() => {
    if (fresh && fresh !== stored) setKeyInfo(fresh);
  }, [fresh, stored, setKeyInfo]);

  return null;
}
