import type { Metadata } from "next";
import { AlertsView } from "@/components/alerts/alerts-view";

export const metadata: Metadata = { title: "Whale Alerts" };

export default function AlertsPage() {
  return <AlertsView />;
}
