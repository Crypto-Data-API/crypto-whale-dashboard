"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { DeckSkeleton } from "@/components/common/gate-notice";
import { deckButton } from "@/components/deck/button";
import { KeyIcon } from "@/components/deck/icons";
import { PageHead } from "@/components/deck/page-head";
import { Kicker, PanelSub, PanelTitle } from "@/components/deck/panel";
import { Segmented } from "@/components/deck/segmented";
import { Switch } from "@/components/ui/switch";
import { useAccess } from "@/hooks/use-access";
import { useSettingsHydrated } from "@/hooks/use-hydrated";
import { isCdaError } from "@/lib/cda/client";
import { getKeyInfo } from "@/lib/cda/endpoints";
import { CHART_INTERVALS, EVENT_LABEL, EVENT_TYPES, TIER_LABEL, type ChartInterval, type EventType, type KeyInfo } from "@/lib/cda/types";
import { fmtInt } from "@/lib/format";
import { requestNotificationPermission, unlockAudio } from "@/lib/notify";
import { cn } from "@/lib/utils";
import { useRateLimit } from "@/stores/rate-limit";
import { MIN_REFRESH, exportSettings, useSettings, type ChartStyle, type RefreshSettings } from "@/stores/settings";

const FIELD =
  "w-full min-w-0 rounded-[10px] border border-iris/16 bg-field px-3 py-[9px] font-mono text-[12.5px] text-ink outline-none transition-colors focus:border-long/45 focus:shadow-[0_0_0_3px_rgba(0,245,212,.08)]";

function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 12) return "••••••••";
  return `${key.slice(0, 10)}••••${key.slice(-4)}`;
}

function SettingsPanel({ title, sub, children, className }: { title: ReactNode; sub?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("flex flex-col gap-4 rounded-[18px] border border-iris/13 bg-panel p-4 sm:p-[22px]", className)}>
      <div className="flex flex-col gap-1">
        <PanelTitle>{title}</PanelTitle>
        {sub && <PanelSub className="leading-relaxed">{sub}</PanelSub>}
      </div>
      {children}
    </section>
  );
}

function TierTag({ children, tone = "cyan" }: { children: ReactNode; tone?: "cyan" | "pink" | "gold" }) {
  const cls =
    tone === "pink" ? "border-short/50 bg-short/10 text-short" : tone === "gold" ? "border-gold/50 bg-gold/10 text-gold" : "border-long/50 bg-long/10 text-long";
  return <span className={cn("rounded-full border px-[9px] py-[3px] font-display text-[10.5px] font-bold tracking-[.06em] uppercase", cls)}>{children}</span>;
}

function KeyInfoGrid({ info }: { info: KeyInfo }) {
  const rows: [string, string][] = [
    ["Tier", TIER_LABEL[info.tier]],
    ["Key prefix", info.keyPrefix ? `${info.keyPrefix}…` : "—"],
    ["Daily limit", fmtInt(info.dailyLimit)],
    ["Per-minute limit", fmtInt(info.perMinuteLimit)],
    ["Requests today", fmtInt(info.requestsToday)],
    ["Email verified", info.emailVerified === null ? "—" : info.emailVerified ? "Yes" : "No"],
    ["Expires", info.expiresAt ? new Date(info.expiresAt).toLocaleDateString() : "Never"],
  ];
  return (
    <dl className="m-0 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
      {rows.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt>
            <Kicker className="text-[10px]">{k}</Kicker>
          </dt>
          <dd className="m-0 mt-1 truncate font-mono text-[13px] text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function ApiKeyPanel() {
  const qc = useQueryClient();
  const access = useAccess();
  const apiKey = useSettings((s) => s.apiKey);
  const keyInfo = useSettings((s) => s.keyInfo);
  const setApiKey = useSettings((s) => s.setApiKey);
  const clearKey = useSettings((s) => s.clearKey);
  const resetRate = useRateLimit((s) => s.reset);
  const [draft, setDraft] = useState("");
  const [show, setShow] = useState(false);
  const [result, setResult] = useState<{ ok: true; info: KeyInfo } | { ok: false; message: string } | null>(null);

  const test = useMutation({
    mutationFn: (key: string) => getKeyInfo({ keyOverride: key }),
    onSuccess: (info, key) => {
      setResult({ ok: true, info });
      if (key !== apiKey) resetRate();
      setApiKey(key, info);
      setDraft("");
      void qc.invalidateQueries();
      toast.success(`Key saved: ${TIER_LABEL[info.tier]} tier`);
    },
    onError: (err) => {
      const message = isCdaError(err) ? (err.isAuth ? "Invalid or inactive API key." : err.message) : "Could not reach the API.";
      setResult({ ok: false, message });
      toast.error(message);
    },
  });

  const candidate = draft.trim() || apiKey;
  const shownInfo = result?.ok ? result.info : keyInfo;

  return (
    <SettingsPanel
      title={
        <span className="flex items-center gap-2.5">
          <span className="grid size-7 place-items-center rounded-[8px] bg-long/10 text-long">
            <KeyIcon size={15} />
          </span>
          CryptoDataApi key
        </span>
      }
      sub="Stored only in this browser (localStorage) and sent to this app's own server proxy, which forwards it to the API. A free key works for charts and the delayed feed; Pro unlocks whale positioning, the live stream and trade flow."
    >
      <div className="flex flex-col gap-2">
        <label htmlFor="api-key" className="text-[12px] text-ink-soft">
          {apiKey ? "Replace key" : "API key"}
        </label>
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-0 flex-1 basis-64">
            <input
              id="api-key"
              type={show ? "text" : "password"}
              autoComplete="off"
              spellCheck={false}
              placeholder={apiKey ? maskKey(apiKey) : "cdk_live_…"}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && draft.trim()) test.mutate(draft.trim());
              }}
              className={cn(FIELD, "pr-16")}
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer rounded-[6px] border-0 bg-transparent px-2 py-1 font-mono text-[10.5px] tracking-[.08em] text-ink-dim hover:text-long"
              aria-label={show ? "Hide key" : "Show key"}
            >
              {show ? "HIDE" : "SHOW"}
            </button>
          </div>
          <button type="button" onClick={() => candidate && test.mutate(candidate)} disabled={!candidate || test.isPending} className={deckButton({ variant: "solid" })}>
            {test.isPending && <span className="size-3 animate-spin rounded-full border-2 border-deck/30 border-t-deck" aria-hidden />}
            {draft.trim() || !apiKey ? "TEST & SAVE" : "RE-TEST SAVED KEY"}
          </button>
          {apiKey && (
            <button
              type="button"
              className={deckButton({ variant: "danger" })}
              onClick={() => {
                clearKey();
                resetRate();
                setResult(null);
                qc.removeQueries({ queryKey: ["cda"] });
                toast("API key cleared");
              }}
            >
              CLEAR KEY
            </button>
          )}
        </div>
        <p className="m-0 text-[12px] text-ink-muted">
          No key yet? Get a free one at{" "}
          <a className="text-long hover:text-long-hover" href="https://cryptodataapi.com/api" target="_blank" rel="noreferrer">
            cryptodataapi.com
          </a>
          .
        </p>
      </div>

      {result && !result.ok && <p className="m-0 rounded-[10px] border border-short/40 bg-short/10 px-3 py-2 text-[13px] text-short-soft">{result.message}</p>}

      {apiKey && (
        <div className="flex flex-col gap-3.5 rounded-[14px] border border-iris/12 bg-well p-4">
          <div className="flex flex-wrap items-center gap-2.5 text-[13px]">
            <span className="text-ink-muted">Saved key</span>
            <code className="font-mono text-[12px] text-ink">{maskKey(apiKey)}</code>
            {access.authError?.isAuth ? <TierTag tone="pink">Rejected</TierTag> : shownInfo ? <TierTag>{TIER_LABEL[shownInfo.tier]}</TierTag> : null}
          </div>
          {shownInfo && <KeyInfoGrid info={shownInfo} />}
        </div>
      )}
      {access.source === "server" && (
        <div className="flex flex-col gap-3.5 rounded-[14px] border border-azure/30 bg-azure/5 p-4">
          <div className="flex flex-wrap items-center gap-2.5 text-[13px]">
            <span className="font-display text-[14px] font-semibold">Using server key</span>
            {access.authError?.isAuth ? <TierTag tone="pink">Rejected</TierTag> : access.tier ? <TierTag>{TIER_LABEL[access.tier]}</TierTag> : null}
          </div>
          <p className="m-0 text-[13px] leading-relaxed text-ink-muted">
            This server has <code className="font-mono text-[12px] text-ink">CDA_API_KEY</code> configured, so data loads without a key of your own. The server key is
            used for read-only requests; a key saved here takes priority.
          </p>
          {access.keyInfo && <KeyInfoGrid info={access.keyInfo} />}
        </div>
      )}
      {access.source === "sample" && (
        <div className="flex flex-col gap-2 rounded-[14px] border border-gold/30 bg-gold/5 p-4">
          <div className="flex flex-wrap items-center gap-2.5 text-[13px]">
            <span className="font-display text-[14px] font-semibold">Showing sample data</span>
            <TierTag tone="gold">Snapshot</TierTag>
          </div>
          <p className="m-0 text-[13px] leading-relaxed text-ink-muted">
            {access.demoMode
              ? "Demo mode is on, so every page uses the bundled snapshot of CryptoDataApi responses."
              : "No API key is configured, so every page uses a bundled snapshot of CryptoDataApi responses (whales, wallets, DOGE / BTC / ETH / SOL charts with three days of trade flow). Save a key above and live data replaces it immediately."}
          </p>
        </div>
      )}
      {access.source === "user" && access.hasServerKey && (
        <p className="m-0 text-[12px] text-ink-muted">Your key takes priority over the server key configured on this deployment.</p>
      )}
    </SettingsPanel>
  );
}

function ToggleRow({ id, checked, onChange, label }: { id: string; checked: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
      <label htmlFor={id} className="cursor-pointer text-[13px] text-ink">
        {label}
      </label>
    </div>
  );
}

function ModePanel() {
  const demoMode = useSettings((s) => s.demoMode);
  const setDemoMode = useSettings((s) => s.setDemoMode);
  const access = useAccess();
  return (
    <SettingsPanel
      title="Demo mode"
      sub={
        access.hasSampleData
          ? "Stop sending any key (yours or the server's) and show the bundled sample snapshot everywhere, with the free 30-minute delayed alerts feed. Useful for screenshots or saving rate limit."
          : access.hasServerKey
            ? "Stop sending your own key. This server has a key configured, so data keeps loading through the server key."
            : "Stop sending your key: the radar shows sample rows and the alerts feed uses the free 30-minute delayed stream. Useful for screenshots or saving rate limit."
      }
    >
      <ToggleRow id="demo-mode" checked={demoMode} onChange={setDemoMode} label={demoMode ? "Demo mode on" : "Demo mode off"} />
    </SettingsPanel>
  );
}

const THRESHOLD_META: Record<EventType, { unit: string; step: number; hint: string }> = {
  whale_position: { unit: "USD", step: 50_000, hint: "Position change size" },
  whale_transfer: { unit: "USD", step: 500_000, hint: "On-chain transfer size" },
  liquidation: { unit: "USD", step: 50_000, hint: "Liquidated notional" },
  oi_delta: { unit: "USD", step: 1_000_000, hint: "Open interest change" },
  price_move: { unit: "%", step: 0.5, hint: "Absolute price move" },
  funding: { unit: "%/h", step: 0.01, hint: "Absolute hourly funding rate" },
};

function AlertsPanel() {
  const thresholds = useSettings((s) => s.thresholds);
  const setThreshold = useSettings((s) => s.setThreshold);
  const feed = useSettings((s) => s.feed);
  const setFeed = useSettings((s) => s.setFeed);
  return (
    <SettingsPanel
      title="Alert thresholds"
      sub="Live events at or above these sizes trigger the sound and browser notification (when enabled). The feed itself is filtered on the Alerts page."
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {EVENT_TYPES.map((type) => {
          const meta = THRESHOLD_META[type];
          return (
            <div key={type} className="flex flex-col gap-1.5">
              <label htmlFor={`th-${type}`}>
                <Kicker>{EVENT_LABEL[type]}</Kicker>
              </label>
              <div className="flex items-center gap-2">
                <input
                  id={`th-${type}`}
                  key={thresholds[type]}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={meta.step}
                  defaultValue={thresholds[type]}
                  onBlur={(e) => setThreshold(type, Number(e.target.value))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") setThreshold(type, Number((e.target as HTMLInputElement).value));
                  }}
                  className={FIELD}
                />
                <span className="w-10 shrink-0 font-mono text-[11px] text-ink-dim">{meta.unit}</span>
              </div>
              <span className="text-[11.5px] text-ink-dim">{meta.hint}</span>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-6 border-t border-iris/7 pt-4">
        <ToggleRow
          id="sound"
          checked={feed.sound}
          onChange={(on) => {
            if (on) unlockAudio();
            setFeed({ sound: on });
          }}
          label="Sound"
        />
        <ToggleRow
          id="notify"
          checked={feed.notifications}
          onChange={async (on) => {
            if (!on) return setFeed({ notifications: false });
            const perm = await requestNotificationPermission();
            if (perm === "granted") setFeed({ notifications: true });
            else toast.error(perm === "unsupported" ? "This browser does not support notifications." : "Notification permission was not granted.");
          }}
          label="Browser notifications"
        />
      </div>
    </SettingsPanel>
  );
}

const REFRESH_META: { key: keyof RefreshSettings; label: string; hint: string }[] = [
  { key: "whalesSec", label: "Whale positioning", hint: "/quant/whales (updates ~5 min upstream)" },
  { key: "candlesSec", label: "Candles & trade flow", hint: "Coin page chart" },
  { key: "summariesSec", label: "Summaries", hint: "Funding/OI, quant, spikes, HL open interest" },
];

function ChartRefreshPanel() {
  const defaultInterval = useSettings((s) => s.defaultInterval);
  const setDefaultInterval = useSettings((s) => s.setDefaultInterval);
  const chartStyle = useSettings((s) => s.chartStyle);
  const setChartStyle = useSettings((s) => s.setChartStyle);
  const refresh = useSettings((s) => s.refresh);
  const setRefresh = useSettings((s) => s.setRefresh);
  // Rough budget for a session with the radar + one coin page open.
  const perDay = Math.round(86400 / refresh.whalesSec + (86400 / refresh.candlesSec) * 2 + (86400 / refresh.summariesSec) * 3);
  return (
    <SettingsPanel title="Chart & refresh" sub="Poll intervals in seconds. Minimums protect your rate limit; the live stream does not count against polling.">
      <div className="flex flex-wrap gap-x-8 gap-y-4">
        <div className="flex flex-col gap-2">
          <Kicker>Chart style</Kicker>
          <Segmented<ChartStyle>
            variant="mode"
            ariaLabel="Chart style"
            value={chartStyle}
            onChange={setChartStyle}
            options={[
              { value: "candles", label: "Candles" },
              { value: "line", label: "Line" },
            ]}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Kicker>Default chart interval</Kicker>
          <Segmented<ChartInterval> variant="tf" ariaLabel="Default chart interval" value={defaultInterval} onChange={setDefaultInterval} options={CHART_INTERVALS.map((i) => ({ value: i, label: i }))} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {REFRESH_META.map((m) => (
          <div key={m.key} className="flex flex-col gap-1.5">
            <label htmlFor={`rf-${m.key}`}>
              <Kicker>{m.label}</Kicker>
            </label>
            <input
              id={`rf-${m.key}`}
              key={refresh[m.key]}
              type="number"
              min={MIN_REFRESH[m.key]}
              step={5}
              defaultValue={refresh[m.key]}
              onBlur={(e) => setRefresh({ [m.key]: Number(e.target.value) })}
              onKeyDown={(e) => {
                if (e.key === "Enter") setRefresh({ [m.key]: Number((e.target as HTMLInputElement).value) });
              }}
              className={FIELD}
            />
            <span className="text-[11.5px] text-ink-dim">
              {m.hint} · min {MIN_REFRESH[m.key]}s
            </span>
          </div>
        ))}
      </div>
      <p className="m-0 font-mono text-[11.5px] text-ink-muted">
        Estimated polling budget with the radar and one coin page open all day: about <span className="text-ink">{fmtInt(perDay)}</span> requests.
      </p>
    </SettingsPanel>
  );
}

function ImportExportPanel() {
  const importSettings = useSettings((s) => s.importSettings);
  const resetPreferences = useSettings((s) => s.resetPreferences);
  const [includeKey, setIncludeKey] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const doExport = () => {
    const data = exportSettings(includeKey);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "whale-dashboard-settings.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const doImport = async (file: File) => {
    try {
      const text = await file.text();
      const res = importSettings(JSON.parse(text));
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
    } catch {
      toast.error("Could not read that file as JSON.");
    }
  };

  return (
    <SettingsPanel title="Import / export" sub="Move your thresholds, intervals and feed filters between browsers.">
      <ToggleRow id="include-key" checked={includeKey} onChange={setIncludeKey} label="Include API key in export" />
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={doExport} className={deckButton()}>
          EXPORT JSON
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} className={deckButton({ variant: "ghost" })}>
          IMPORT JSON
        </button>
        <button
          type="button"
          className={deckButton({ variant: "danger" })}
          onClick={() => {
            resetPreferences();
            toast("Preferences reset to defaults");
          }}
        >
          RESET PREFERENCES
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void doImport(f);
            e.target.value = "";
          }}
        />
      </div>
    </SettingsPanel>
  );
}

export function SettingsView() {
  const hydrated = useSettingsHydrated();
  return (
    <>
      <PageHead title="Settings" />
      {!hydrated ? (
        <div className="flex max-w-[980px] flex-col gap-[22px]">
          <DeckSkeleton className="h-56 rounded-[18px]" />
          <DeckSkeleton className="h-32 rounded-[18px]" />
        </div>
      ) : (
        <div className="flex max-w-[980px] flex-col gap-[22px]">
          <ApiKeyPanel />
          <ModePanel />
          <AlertsPanel />
          <ChartRefreshPanel />
          <ImportExportPanel />
        </div>
      )}
    </>
  );
}
