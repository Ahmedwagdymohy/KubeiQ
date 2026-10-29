"use client";

import type { ReactNode } from "react";

import { AboutSection } from "@/components/settings/about-section";
import { AccountSection } from "@/components/settings/account-section";
import { ActivitySection } from "@/components/settings/activity-section";
import { AISection } from "@/components/settings/ai-section";
import { ChangesSection } from "@/components/settings/changes-section";
import { ClustersSection } from "@/components/settings/clusters-section";
import { ProjectsSection } from "@/components/settings/projects-section";
import { SignInSection } from "@/components/settings/signin-section";
import { UsersSection } from "@/components/settings/users-section";
import { useHash } from "@/hooks/use-hash";
import { useMe } from "@/hooks/use-me";
import { areaFromHash, settingsAreas, type SettingsArea } from "@/lib/settings-nav";

const VIEWS: Record<SettingsArea, () => ReactNode> = {
  ai: () => <AISection />,
  clusters: () => <ClustersSection />,
  changes: () => <ChangesSection />,
  users: () => <UsersSection />,
  signin: () => <SignInSection />,
  projects: () => <ProjectsSection />,
  activity: () => <ActivitySection />,
  account: () => <AccountSection />,
  about: () => <AboutSection />,
};

/** Settings: one view per area, chosen by the URL hash (/settings#ai, #clusters, ...). */
export function SettingsView() {
  const me = useMe();
  const hash = useHash();
  const admin = me.data?.role === "admin";
  const areas = settingsAreas(admin);
  const active = areaFromHash(hash, admin);

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <nav
        aria-label="Settings"
        className="shrink-0 border-b border-border lg:w-[208px] lg:border-b-0 lg:border-r lg:p-3"
      >
        <p className="hidden px-2.5 pb-2 pt-1 text-xs text-subtle lg:block">Settings</p>
        <ul className="flex gap-5 overflow-x-auto px-4 lg:flex-col lg:gap-0.5 lg:px-0">
          {areas.map(({ id, label }) => (
            <li key={id} className="shrink-0">
              <a
                href={`#${id}`}
                aria-current={id === active ? "page" : undefined}
                className={`flex h-11 items-center whitespace-nowrap border-b-2 text-sm transition-colors lg:h-8 lg:rounded-lg lg:border-b-0 lg:px-2.5 ${
                  id === active
                    ? "border-accent font-semibold text-fg lg:bg-surface-2"
                    : "border-transparent font-medium text-muted hover:text-fg lg:hover:bg-surface"
                }`}
              >
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:py-8">
        <div className="mx-auto max-w-[1152px]">{VIEWS[active]()}</div>
      </div>
    </div>
  );
}
