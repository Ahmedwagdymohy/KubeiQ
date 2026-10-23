"use client";

import { AboutSection } from "@/components/settings/about-section";
import { AccountSection } from "@/components/settings/account-section";
import { ActivitySection } from "@/components/settings/activity-section";
import { AISection } from "@/components/settings/ai-section";
import { ChangesSection } from "@/components/settings/changes-section";
import { ClustersSection } from "@/components/settings/clusters-section";
import { ProjectsSection } from "@/components/settings/projects-section";
import { UsersSection } from "@/components/settings/users-section";
import { useMe } from "@/hooks/use-me";

const ADMIN_NAV = [
  ["ai", "AI Model"],
  ["clusters", "Clusters"],
  ["changes", "Cluster Changes"],
  ["users", "Users"],
  ["projects", "Projects"],
  ["activity", "Activity"],
  ["account", "Account"],
  ["about", "About"],
] as const;

export function SettingsView() {
  const me = useMe();
  const admin = me.data?.role === "admin";
  const nav = admin ? ADMIN_NAV : ADMIN_NAV.filter(([id]) => id === "account");

  return (
    <main className="mx-auto grid w-full max-w-[1680px] flex-1 grid-cols-[minmax(0,1fr)] gap-px border-x border-border bg-border lg:grid-cols-[240px_minmax(0,1fr)]">
      <nav className="hidden flex-col gap-1 bg-bg p-6 lg:flex">
        <h1 className="mb-3 text-base font-semibold">Settings</h1>
        {nav.map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            className="rounded-md px-3 py-2 text-sm text-muted transition-colors hover:bg-surface hover:text-fg"
          >
            {label}
          </a>
        ))}
      </nav>
      <div className="flex min-w-0 flex-col gap-px">
        {admin && (
          <>
            <AISection />
            <ClustersSection />
            <ChangesSection />
            <UsersSection />
            <ProjectsSection />
            <ActivitySection />
          </>
        )}
        <AccountSection />
        {admin && <AboutSection />}
        <div className="flex-1 bg-bg" />
      </div>
    </main>
  );
}
