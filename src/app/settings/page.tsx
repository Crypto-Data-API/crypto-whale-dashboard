import type { Metadata } from "next";
import { PageHeader } from "@/components/common/page-header";
import { SettingsView } from "@/components/settings/settings-view";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" description="Your API key, alert thresholds, refresh rates and preferences." />
      <SettingsView />
    </>
  );
}
