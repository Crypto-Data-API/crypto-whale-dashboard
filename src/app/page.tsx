import { Suspense } from "react";
import { WhaleRadarFromUrl, WhaleRadarView } from "@/components/radar/whale-radar-view";

/**
 * `/?sel=ETH` preselects a coin on the radar (used by the Whale Exposure table).
 * The query is read on the client so the page can also be exported statically.
 */
export default function HomePage() {
  return (
    <Suspense fallback={<WhaleRadarView initialSel={null} />}>
      <WhaleRadarFromUrl />
    </Suspense>
  );
}
