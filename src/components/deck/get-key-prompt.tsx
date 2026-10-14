"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { STATIC_SAMPLE } from "@/lib/deploy";
import { cn } from "@/lib/utils";
import { deckButton } from "./button";
import { ExternalIcon, KeyIcon } from "./icons";
import { Kicker } from "./panel";

export const REPO_URL = "https://github.com/Crypto-Data-API/crypto-whale-dashboard";
export const PRICING_URL = "https://cryptodataapi.com/pricing";
export const DOCS_URL = "https://cryptodataapi.com/api/docs";

/** Steps to run the dashboard with live data. Mirrored in README.md. */
const RUN_STEPS: { label: string; code: string }[] = [
  { label: "Clone the repo", code: `git clone ${REPO_URL}\ncd crypto-whale-dashboard` },
  { label: "Install", code: "npm install" },
  { label: "Add your key to .env", code: "CDA_API_KEY=your_cryptodataapi_key" },
  { label: "Start the dev server", code: "npm run dev" },
  { label: "Open", code: "http://localhost:3000" },
];

/** Paste-ready setup prompt for an AI coding agent. Mirrored in README.md. */
export const AGENT_PROMPT = `Set up the Crypto Whale Dashboard locally (needs Node.js 20.9 or newer).
1) git clone ${REPO_URL} and cd into crypto-whale-dashboard.
2) Run npm install.
3) Create a .env file in the project root containing CDA_API_KEY=<my CryptoDataApi key>. I will paste the key; if I haven't, ask me for it or tell me to get one at ${PRICING_URL}. A free key works for candles and the delayed alerts feed; Pro unlocks whale positioning, the live stream and trade flow.
4) Run npm run dev and open http://localhost:3000.
5) Confirm the tier badge in the sidebar shows my plan (FREE, PRO or PRO+, not SAMPLE) and the Whale Radar shows live data.
Optional: deploy to Vercel with CDA_API_KEY set as an environment variable. GitHub Pages can only host the sample demo, because the API does not allow browser (CORS) requests.`;

const DISMISS_KEY = "cwd-get-key-dismissed";

/** The static demo forgets a dismissal when the tab closes; a self-hosted app remembers it. */
function dismissStore(): Storage | null {
  try {
    return STATIC_SAMPLE ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
}

const dismissListeners = new Set<() => void>();
/** Fallback when storage is blocked: dismissal lasts until reload. */
let dismissedInMemory = false;

function subscribeDismiss(cb: () => void) {
  dismissListeners.add(cb);
  return () => {
    dismissListeners.delete(cb);
  };
}

function readDismissed(): boolean {
  if (dismissedInMemory) return true;
  try {
    return dismissStore()?.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/** Banner visibility. Hidden during SSR (no flash), then honours a stored dismissal. */
export function useGetKeyBanner(): { show: boolean; dismiss: () => void } {
  const dismissed = useSyncExternalStore(subscribeDismiss, readDismissed, () => true);
  return {
    show: !dismissed,
    dismiss: () => {
      dismissedInMemory = true;
      try {
        dismissStore()?.setItem(DISMISS_KEY, "1");
      } catch {
        // storage full or blocked: the in-memory flag covers this page view
      }
      for (const fn of dismissListeners) fn();
    },
  };
}

async function copyText(text: string, fallback: HTMLTextAreaElement | null): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API blocked (http, permissions): select the text and use the legacy command.
    if (!fallback) return false;
    fallback.focus();
    fallback.select();
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    }
  }
}

function AgentPrompt() {
  const ref = useRef<HTMLTextAreaElement>(null);
  const id = useId();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  const onCopy = async () => {
    const ok = await copyText(AGENT_PROMPT, ref.current);
    if (ok) {
      setCopied(true);
      toast.success("Prompt copied. Paste it into Claude Code, Cursor or your agent of choice.");
    } else {
      toast.error("Could not copy. Select the text and copy it manually.");
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex min-h-8 items-center justify-between gap-3">
        <label htmlFor={id}>
          <Kicker>Or paste this into an AI coding agent</Kicker>
        </label>
        <button type="button" onClick={onCopy} className={deckButton({ size: "sm", variant: copied ? "solid" : "primary" })} aria-live="polite">
          {copied ? "COPIED" : "COPY"}
        </button>
      </div>
      <textarea
        id={id}
        ref={ref}
        readOnly
        value={AGENT_PROMPT}
        rows={12}
        spellCheck={false}
        onFocus={(e) => e.currentTarget.select()}
        className="min-h-[200px] w-full resize-y rounded-[10px] border border-iris/16 bg-field px-3 py-2.5 font-mono text-[11.5px] leading-relaxed text-ink-soft outline-none focus:border-long/45"
      />
      <p className="m-0 text-[11.5px] text-ink-dim">Works with Claude Code, Cursor, Copilot or any agent that can run shell commands.</p>
    </div>
  );
}

function RunSteps() {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex min-h-8 items-center">
        <Kicker>Run it live in 2 minutes</Kicker>
      </div>
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {RUN_STEPS.map((step, i) => (
          <li key={step.label} className="flex min-w-0 items-start gap-2.5">
            <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border border-long/40 font-mono text-[10.5px] text-long">{i + 1}</span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-[12.5px] text-ink-soft">{step.label}</span>
              <code className="block overflow-x-auto rounded-[8px] border border-iris/12 bg-well px-2.5 py-1.5 font-mono text-[11.5px] whitespace-pre text-ink">{step.code}</code>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * "Get a key / run it live" call to action for visitors on sample data.
 * banner : radar page, collapsible, with a dismiss button.
 * panel  : Settings, always expanded.
 */
export function GetKeyPrompt({ variant = "panel", onDismiss, className }: { variant?: "banner" | "panel"; onDismiss?: () => void; className?: string }) {
  const banner = variant === "banner";
  const [open, setOpen] = useState(!banner);
  const detailsId = useId();
  return (
    <section
      aria-label="Get a CryptoDataApi key"
      className={cn(
        "@container flex flex-col gap-4 rounded-[18px] border border-gold/30 bg-[linear-gradient(180deg,rgba(255,197,61,.06),rgba(9,11,22,.8))] p-4 sm:p-5",
        className,
      )}
    >
      <div className="flex flex-wrap items-start gap-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-gold/12 text-gold">
          <KeyIcon size={17} />
        </span>
        <div className="min-w-0 flex-1 basis-72">
          <p className="m-0 font-display text-[16px] font-semibold">You&apos;re looking at a sample snapshot</p>
          <p className="m-0 mt-1 text-[13px] leading-relaxed text-ink-muted">
            Live whale data needs a free or Pro CryptoDataApi key. A free key unlocks charts and the delayed alerts feed; Pro adds whale positioning, the live
            stream and trade flow.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={PRICING_URL} target="_blank" rel="noopener noreferrer" className={deckButton({ variant: "solid", size: "sm" })}>
            GET A KEY →
          </a>
          <a href={DOCS_URL} target="_blank" rel="noopener noreferrer" className={deckButton({ variant: "ghost", size: "sm" })}>
            API DOCS <ExternalIcon size={11} />
          </a>
          {banner && (
            <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls={detailsId} className={deckButton({ size: "sm" })}>
              {open ? "HIDE SETUP" : "RUN IT LIVE"}
            </button>
          )}
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss"
              title={STATIC_SAMPLE ? "Hide for this visit" : "Hide this banner"}
              className={deckButton({ variant: "ghost", size: "sm", className: "px-2.5 text-[16px] leading-none" })}
            >
              ×
            </button>
          )}
        </div>
      </div>
      {open && (
        <div id={detailsId} className="grid gap-5 border-t border-iris/10 pt-4 @5xl:grid-cols-2">
          <RunSteps />
          <AgentPrompt />
        </div>
      )}
    </section>
  );
}
