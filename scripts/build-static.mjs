#!/usr/bin/env node
/**
 * Static sample build for GitHub Pages (or any static host).
 *
 *   npm run build:static
 *   NEXT_PUBLIC_BASE_PATH=/crypto-whale-dashboard npm run build:static
 *
 * Sets NEXT_PUBLIC_STATIC_SAMPLE=1 and runs `next build` with
 * `output: "export"`, writing the site to out/. Route handlers cannot be
 * exported, so src/app/api is moved to .static-build-api-backup for the
 * duration of the build and always moved back: on success, on failure, and
 * on Ctrl+C / SIGTERM. If a previous run was killed before it could restore
 * the folder, the next run restores it first.
 *
 * Do not run this while `next dev` is serving the same folder: the API routes
 * disappear from the dev server until the build finishes.
 */
import { spawn } from "node:child_process";
import { existsSync, renameSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const API_DIR = path.join(ROOT, "src", "app", "api");
const BACKUP_DIR = path.join(ROOT, ".static-build-api-backup");
const OUT_DIR = path.join(ROOT, "out");

const rel = (p) => path.relative(ROOT, p);

/** renameSync with retries: Windows file watchers can briefly lock a folder. */
function move(from, to) {
  for (let attempt = 1; ; attempt++) {
    try {
      renameSync(from, to);
      return;
    } catch (err) {
      const code = err && typeof err === "object" ? err.code : null;
      if (attempt >= 10 || (code !== "EPERM" && code !== "EBUSY" && code !== "EACCES")) throw err;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200 * attempt);
    }
  }
}

let movedAside = false;

function restore() {
  if (!movedAside) return;
  if (existsSync(API_DIR)) {
    console.error(`[build:static] ${rel(API_DIR)} reappeared during the build; leaving ${rel(BACKUP_DIR)} in place. Merge it back by hand.`);
    movedAside = false;
    return;
  }
  move(BACKUP_DIR, API_DIR);
  movedAside = false;
  console.log(`[build:static] restored ${rel(API_DIR)}`);
}

function recoverPreviousRun() {
  if (!existsSync(BACKUP_DIR)) return;
  if (existsSync(API_DIR)) {
    throw new Error(`Both ${rel(API_DIR)} and ${rel(BACKUP_DIR)} exist. A previous build:static was interrupted; delete the stale backup after checking it.`);
  }
  move(BACKUP_DIR, API_DIR);
  console.log(`[build:static] recovered ${rel(API_DIR)} from an interrupted run`);
}

let child = null;

/** Ctrl+C / SIGTERM: stop the build, then restore (main's finally does it once the child exits). */
function onSignal(signal) {
  console.log(`
[build:static] ${signal}: stopping the build and restoring ${rel(API_DIR)}`);
  if (child && child.exitCode === null && child.signalCode === null) {
    child.kill(signal);
    return;
  }
  restore();
  process.exit(130);
}

function runNextBuild() {
  const require = createRequire(import.meta.url);
  const nextBin = require.resolve("next/dist/bin/next");
  const env = { ...process.env, NEXT_PUBLIC_STATIC_SAMPLE: "1", NEXT_PUBLIC_BASE_PATH: process.env.NEXT_PUBLIC_BASE_PATH ?? "" };
  return new Promise((resolve) => {
    child = spawn(process.execPath, [nextBin, "build"], { cwd: ROOT, env, stdio: "inherit" });
    child.on("error", (err) => {
      console.error(`[build:static] could not start next build: ${err.message}`);
      resolve(1);
    });
    child.on("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
}

async function main() {
  recoverPreviousRun();
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
  // Last resort if the process exits abruptly (uncaught error, process.exit).
  process.on("exit", restore);

  if (existsSync(API_DIR)) {
    move(API_DIR, BACKUP_DIR);
    movedAside = true;
    console.log(`[build:static] moved ${rel(API_DIR)} aside (route handlers cannot be exported)`);
  }

  let code;
  try {
    console.log(`[build:static] next build (NEXT_PUBLIC_STATIC_SAMPLE=1, NEXT_PUBLIC_BASE_PATH="${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}")`);
    code = await runNextBuild();
  } finally {
    restore();
  }

  if (code !== 0) {
    console.error(`[build:static] next build failed (exit ${code})`);
    return code;
  }
  if (!existsSync(path.join(OUT_DIR, "index.html"))) {
    console.error(`[build:static] ${rel(OUT_DIR)}/index.html is missing`);
    return 1;
  }
  // GitHub Pages runs Jekyll by default, which drops the _next/ folder.
  writeFileSync(path.join(OUT_DIR, ".nojekyll"), "");
  console.log(`[build:static] static site ready in ${rel(OUT_DIR)}/`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`[build:static] ${err instanceof Error ? err.message : err}`);
    restore();
    process.exit(1);
  },
);
