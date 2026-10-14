import type { Metadata } from "next";
import { WhaleExposureView } from "@/components/exposure/whale-exposure-view";

export const metadata: Metadata = { title: "Whale Exposure" };

export default function ExposurePage() {
  return <WhaleExposureView />;
}
