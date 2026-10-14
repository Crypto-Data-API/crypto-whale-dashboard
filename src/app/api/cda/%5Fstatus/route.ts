import { statusResponse } from "@/lib/cda/server";

/**
 * GET /api/cda/_status -> { hasServerKey: boolean }
 * (The folder is named %5Fstatus because `_`-prefixed folders are private in the App Router.)
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return statusResponse();
}
