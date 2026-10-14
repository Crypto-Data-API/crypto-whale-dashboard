"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Eye, EyeOff, KeyRound, LoaderCircle, RefreshCw, Trash, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useAccess } from "@/hooks/use-access";
import { useSettingsHydrated } from "@/hooks/use-hydrated";
import { isCdaError } from "@/lib/cda/client";
import { getKeyInfo } from "@/lib/cda/endpoints";
import { CHART_INTERVALS, EVENT_LABEL, EVENT_TYPES, TIER_LABEL, type ChartInterval, type EventType, type KeyInfo } from "@/lib/cda/types";
import { fmtInt } from "@/lib/format";
import { requestNotificationPermission, unlockAudio } from "@/lib/notify";
import { MIN_REFRESH, exportSettings, useSettings, type RefreshSettings } from "@/stores/settings";
import { useRateLimit } from "@/stores/rate-limit";

function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 12) return "••••••••";
  return `${key.slice(0, 10)}••••${key.slice(-4)}`;
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
    <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-3">
      {rows.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{k}</dt>
          <dd className="tabular truncate font-medium">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function ApiKeyCard() {
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-4" aria-hidden /> CryptoDataApi key
        </CardTitle>
        <CardDescription>
          Stored only in this browser (localStorage) and sent to this app&apos;s own server proxy, which forwards it to the API. A free key works
          for charts and the delayed feed; Pro unlocks whale positioning, the live stream and trade flow.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="api-key">{apiKey ? "Replace key" : "API key"}</Label>
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-0 flex-1 basis-64">
              <Input
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
                className="pr-9 font-mono"
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={show ? "Hide key" : "Show key"}
              >
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <Button onClick={() => candidate && test.mutate(candidate)} disabled={!candidate || test.isPending}>
              {test.isPending ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
              {draft.trim() ? "Test & Save" : "Re-test saved key"}
            </Button>
            {apiKey && (
              <Button
                variant="destructive"
                onClick={() => {
                  clearKey();
                  resetRate();
                  setResult(null);
                  qc.removeQueries({ queryKey: ["cda"] });
                  toast("API key cleared");
                }}
              >
                <Trash /> Clear key
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            No key yet? Get a free one at{" "}
            <a className="underline underline-offset-2" href="https://cryptodataapi.com/api" target="_blank" rel="noreferrer">
              cryptodataapi.com
            </a>
            .
          </p>
        </div>

        {result && !result.ok && <p className="rounded-md border border-short/40 bg-short/10 px-3 py-2 text-sm">{result.message}</p>}

        {apiKey && (
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/20 p-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">Saved key</span>
              <code className="font-mono text-xs">{maskKey(apiKey)}</code>
              {access.authError?.isAuth ? (
                <Badge variant="destructive">Rejected</Badge>
              ) : shownInfo ? (
                <Badge variant="secondary">{TIER_LABEL[shownInfo.tier]}</Badge>
              ) : null}
            </div>
            {shownInfo && <KeyInfoGrid info={shownInfo} />}
          </div>
        )}
        {!apiKey && access.source === "server" && (
          <p className="text-sm text-muted-foreground">This deployment has a server-side demo key, so data loads without your own key.</p>
        )}
      </CardContent>
    </Card>
  );
}

function ModeCard() {
  const demoMode = useSettings((s) => s.demoMode);
  const setDemoMode = useSettings((s) => s.setDemoMode);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Demo mode</CardTitle>
        <CardDescription>
          Stop sending your key: the radar shows sample rows and the alerts feed uses the free 30-minute delayed stream. Useful for screenshots
          or saving rate limit.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3">
          <Switch id="demo-mode" checked={demoMode} onCheckedChange={setDemoMode} />
          <Label htmlFor="demo-mode">{demoMode ? "Demo mode on" : "Demo mode off"}</Label>
        </div>
      </CardContent>
    </Card>
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

function AlertsCard() {
  const thresholds = useSettings((s) => s.thresholds);
  const setThreshold = useSettings((s) => s.setThreshold);
  const feed = useSettings((s) => s.feed);
  const setFeed = useSettings((s) => s.setFeed);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Alert thresholds</CardTitle>
        <CardDescription>
          Live events at or above these sizes trigger the sound and browser notification (when enabled). The feed itself is filtered on the
          Alerts page.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {EVENT_TYPES.map((type) => {
            const meta = THRESHOLD_META[type];
            return (
              <div key={type} className="flex flex-col gap-1">
                <Label htmlFor={`th-${type}`}>{EVENT_LABEL[type]}</Label>
                <div className="flex items-center gap-2">
                  <Input
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
                    className="tabular"
                  />
                  <span className="w-10 shrink-0 text-xs text-muted-foreground">{meta.unit}</span>
                </div>
                <span className="text-[11px] text-muted-foreground">{meta.hint}</span>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-6">
          <div className="flex items-center gap-3">
            <Switch
              id="sound"
              checked={feed.sound}
              onCheckedChange={(on) => {
                if (on) unlockAudio();
                setFeed({ sound: on });
              }}
            />
            <Label htmlFor="sound">Sound</Label>
          </div>
          <div className="flex items-center gap-3">
            <Switch
              id="notify"
              checked={feed.notifications}
              onCheckedChange={async (on) => {
                if (!on) return setFeed({ notifications: false });
                const perm = await requestNotificationPermission();
                if (perm === "granted") setFeed({ notifications: true });
                else toast.error(perm === "unsupported" ? "This browser does not support notifications." : "Notification permission was not granted.");
              }}
            />
            <Label htmlFor="notify">Browser notifications</Label>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const REFRESH_META: { key: keyof RefreshSettings; label: string; hint: string }[] = [
  { key: "whalesSec", label: "Whale positioning", hint: "/quant/whales (updates ~5 min upstream)" },
  { key: "candlesSec", label: "Candles & trade flow", hint: "Coin page chart" },
  { key: "summariesSec", label: "Summaries", hint: "Funding/OI, quant, spikes, HL open interest" },
];

function ChartRefreshCard() {
  const defaultInterval = useSettings((s) => s.defaultInterval);
  const setDefaultInterval = useSettings((s) => s.setDefaultInterval);
  const refresh = useSettings((s) => s.refresh);
  const setRefresh = useSettings((s) => s.setRefresh);
  // Rough budget for a session with the radar + one coin page open.
  const perDay = Math.round(86400 / refresh.whalesSec + (86400 / refresh.candlesSec) * 2 + (86400 / refresh.summariesSec) * 3);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Chart & refresh</CardTitle>
        <CardDescription>Poll intervals in seconds. Minimums protect your rate limit; the live stream does not count against polling.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>Default chart interval</Label>
          <Select value={defaultInterval} onValueChange={(v) => setDefaultInterval(v as ChartInterval)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CHART_INTERVALS.map((i) => (
                <SelectItem key={i} value={i}>
                  {i}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {REFRESH_META.map((m) => (
            <div key={m.key} className="flex flex-col gap-1">
              <Label htmlFor={`rf-${m.key}`}>{m.label}</Label>
              <Input
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
                className="tabular"
              />
              <span className="text-[11px] text-muted-foreground">
                {m.hint} · min {MIN_REFRESH[m.key]}s
              </span>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Estimated polling budget with the radar and one coin page open all day: about {fmtInt(perDay)} requests.
        </p>
      </CardContent>
    </Card>
  );
}

function ImportExportCard() {
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
    <Card>
      <CardHeader>
        <CardTitle>Import / export</CardTitle>
        <CardDescription>Move your thresholds, intervals and feed filters between browsers.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <Switch id="include-key" checked={includeKey} onCheckedChange={setIncludeKey} />
          <Label htmlFor="include-key">Include API key in export</Label>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={doExport}>
            <Download /> Export JSON
          </Button>
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>
            <Upload /> Import JSON
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              resetPreferences();
              toast("Preferences reset to defaults");
            }}
          >
            Reset preferences
          </Button>
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
      </CardContent>
    </Card>
  );
}

export function SettingsView() {
  const hydrated = useSettingsHydrated();
  if (!hydrated) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }
  return (
    <div className="grid max-w-4xl gap-4">
      <ApiKeyCard />
      <ModeCard />
      <AlertsCard />
      <ChartRefreshCard />
      <ImportExportCard />
    </div>
  );
}
