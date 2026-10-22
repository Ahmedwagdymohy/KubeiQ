import type { Metadata } from "next";

import { AppHeader } from "@/components/app-header";
import { SettingsView } from "@/components/settings/settings-view";

export const metadata: Metadata = { title: "Settings · KubeiQ" };

export default function SettingsPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <SettingsView />
    </div>
  );
}
