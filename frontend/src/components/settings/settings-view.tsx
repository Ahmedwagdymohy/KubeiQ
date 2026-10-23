"use client";

import { useSyncExternalStore } from "react";

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
  ["ai", "AI Model", AISection],
  ["clusters", "Clusters", ClustersSection],
  ["changes", "Cluster Changes", ChangesSection],
  ["users", "Users", UsersSection],
  ["projects", "Projects", ProjectsSection],
  ["activity", "Activity", ActivitySection],
  ["account", "Account", AccountSection],
  ["about", "About", AboutSection],
] as const;

function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

/** Each area is its own view; the hash names it so links like /settings#ai keep working. */
function useHash() {
  return useSyncExternalStore(
    subscribe,
    () => window.location.hash.slice(1),
    () => "",
  );
}

export function SettingsView() {
  const me = useMe();
  const hash = useHash();
  const admin = me.data?.role === "admin";
  const nav = admin ? ADMIN_NAV : ADMIN_NAV.filter(([id]) => id === "account");
  const current = nav.find(([id]) => id === hash) ?? nav[0];
  const View = current[2];

  return (
    <main className="mx-auto grid w-full max-w-[1680px] flex-1 grid-cols-[minmax(0,1fr)] lg:grid-cols-[240px_minmax(0,1fr)]">
      <nav className="hidden flex-col gap-0.5 border-r border-border p-6 lg:flex">
        <p className="mb-3 px-3 text-sm font-medium text-muted">Settings</p>
        {nav.map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            aria-current={id === current[0] ? "page" : undefined}
            className={`rounded-md px-3 py-2 text-sm transition-colors ${
              id === current[0]
                ? "text-fg shadow-[inset_1px_0_0_var(--accent)]"
                : "text-muted hover:bg-surface hover:text-fg"
            }`}
          >
            {label}
          </a>
        ))}
      </nav>
      <div className="flex min-w-0 flex-col">
        <div className="flex gap-1 overflow-x-auto border-b border-border px-4 lg:hidden">
          {nav.map(([id, label]) => (
            <a
              key={id}
              href={`#${id}`}
              className={`shrink-0 px-3 py-3 text-sm ${
                id === current[0] ? "text-fg shadow-[inset_0_-1px_0_var(--accent)]" : "text-muted"
              }`}
            >
              {label}
            </a>
          ))}
        </div>
        <View />
      </div>
    </main>
  );
}
