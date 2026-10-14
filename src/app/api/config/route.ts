import { serverDemoKey } from "@/lib/cda/server";

/** Tells the client whether the server has a fallback demo key (never the key itself). */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  return Response.json({ demoKey: serverDemoKey().length > 0 }, { headers: { "cache-control": "no-store" } });
}
