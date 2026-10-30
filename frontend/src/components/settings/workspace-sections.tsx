"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useSyncExternalStore } from "react";

import { input, Section, Switch } from "@/components/settings/fields";
import { savedTheme, setTheme } from "@/components/theme-toggle";
import { usePreference } from "@/hooks/use-preferences";
import { useWorkspace } from "@/hooks/use-workspace";
import { api, type WorkspaceSettings } from "@/lib/api";

/** Settings › General: display settings for everyone in the workspace. */
export function GeneralSection() {
  const queryClient = useQueryClient();
  const current = useWorkspace();
  const save = useMutation({
    mutationFn: (body: WorkspaceSettings) => api.saveWorkspace(body),
    onSuccess: (data) => queryClient.setQueryData(["workspace"], data),
  });
  const set = (patch: Partial<WorkspaceSettings>) => save.mutate({ ...current, ...patch });
  const rows: [keyof WorkspaceSettings, string, string][] = [
    ["show_usage", "Show resource usage", "CPU, memory and disk bars from metrics-server in the status bar, cards and tables"],
    ["namespace_badges", "Show namespaces in lists", "The Namespace column when a list shows all namespaces"],
    ["compact_rows", "Compact table rows", "The default for everyone; each person can change it under Appearance"],
    ["confirm_delete", "Type the name to delete", "Deleting an object asks for its name. Always on for production clusters"],
  ];
  return (
    <Section id="general" title="General" description="How KubeiQ shows clusters to everyone in this workspace">
      <div className="flex flex-col gap-5">
        {rows.map(([key, label, hint]) => (
          <div key={key} className="flex flex-col gap-1">
            <Switch checked={current[key]} onChange={(v) => set({ [key]: v })} label={label} />
            <span className="pl-12 text-[13px] text-subtle">{hint}</span>
          </div>
        ))}
        {save.error && <p className="text-sm text-danger">{(save.error as Error).message}</p>}
      </div>
    </Section>
  );
}

function subscribeTheme(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

/** Settings › Appearance: per person. Theme in this browser; density and code font everywhere. */
export function AppearanceSection() {
  const workspace = useWorkspace();
  const theme = useSyncExternalStore(subscribeTheme, savedTheme, () => "system" as const);
  const [, rerender] = useState(0);
  const [compact, setCompact] = usePreference<boolean | null>("table.compact", null);
  const [appearance, setAppearance] = usePreference<{ mono: "jetbrains" | "system" }>("appearance", { mono: "jetbrains" });
  const option = <T extends string>(value: T, current: T, label: string, onPick: (v: T) => void) => (
    <button
      key={value}
      type="button"
      role="radio"
      aria-checked={value === current}
      onClick={() => onPick(value)}
      className={`h-9 rounded-lg border px-3.5 text-sm transition-colors ${value === current ? "border-accent font-medium text-fg" : "border-control text-muted hover:text-fg"}`}
    >
      {label}
    </button>
  );
  return (
    <Section id="appearance" title="Appearance" description="How KubeiQ looks for you. Only you see these">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Theme</span>
          <div role="radiogroup" aria-label="Theme" className="flex flex-wrap gap-2">
            {(["system", "light", "dark"] as const).map((t) =>
              option(t, theme, t === "system" ? "Follow the system" : t === "light" ? "Light" : "Dark", (v) => {
                setTheme(v);
                rerender((n) => n + 1);
              }),
            )}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Table rows</span>
          <div role="radiogroup" aria-label="Table rows" className="flex flex-wrap gap-2">
            {option("comfortable", (compact ?? workspace.compact_rows) ? "compact" : "comfortable", "Comfortable", () => setCompact(false))}
            {option("compact", (compact ?? workspace.compact_rows) ? "compact" : "comfortable", "Compact", () => setCompact(true))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Code font</span>
          <div role="radiogroup" aria-label="Code font" className="flex flex-wrap gap-2">
            {option("jetbrains", appearance.mono, "JetBrains Mono", (mono) => setAppearance({ mono }))}
            {option("system", appearance.mono, "System monospace", (mono) => setAppearance({ mono }))}
          </div>
          <span className="text-[13px] text-subtle">For logs, YAML, the terminal and commands. The rest stays Manrope</span>
        </div>
      </div>
    </Section>
  );
}

const ADDS = [
  "More users, projects and clusters than the Free plan",
  "Generic SSO: OIDC, LDAP and SAML, with group to role mapping",
  "Custom roles beyond viewer and editor",
  "Audit log export and longer retention",
];

/** Settings › License: the plan, its limits and usage. */
export function LicenseSection() {
  const plan = useQuery({ queryKey: ["plan"], queryFn: api.plan });
  const p = plan.data;
  const meter = (label: string, used: number, max: number) => (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between text-sm">
        <span className="text-muted">{label}</span>
        <span className="tabular-nums">
          {used} of {max}
        </span>
      </div>
      <span className="h-1.5 overflow-hidden rounded-full bg-surface-2">
        <span className={`block h-full rounded-full ${used >= max ? "bg-warning" : "bg-accent"}`} style={{ width: `${Math.min(100, (100 * used) / Math.max(1, max))}%` }} />
      </span>
    </div>
  );
  return (
    <Section id="license" title="License" description="Your plan and what it includes">
      {p && (
        <div className="flex flex-col gap-6">
          <div className="flex items-baseline gap-3">
            <span className="text-2xl font-semibold capitalize">{p.plan}</span>
            <span className="text-sm text-muted">plan</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {meter("Users", p.users.used, p.users.max)}
            {meter("Projects", p.projects.used, p.projects.max)}
            {meter("Clusters", p.clusters.used, p.clusters.max)}
          </div>
          <div className="flex flex-col gap-2 border-t border-border pt-5">
            <span className="text-sm font-medium">What a license adds</span>
            <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted">
              {ADDS.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
            <span className="text-[13px] text-subtle">Everything else, including AI investigations and the assistant, is in every plan</span>
          </div>
        </div>
      )}
    </Section>
  );
}

const DANGERS: { action: "clear-activity" | "remove-clusters" | "reset"; title: string; text: string; phrase: string }[] = [
  {
    action: "clear-activity",
    title: "Clear the activity log",
    text: "Deletes every entry in Activity. Clearing it is recorded as the first new entry.",
    phrase: "clear activity",
  },
  {
    action: "remove-clusters",
    title: "Remove all clusters",
    text: "Removes every cluster added in Settings (kubeconfig files, tokens, GKE projects) and takes all clusters out of projects. Nothing changes in the clusters.",
    phrase: "remove clusters",
  },
  {
    action: "reset",
    title: "Reset the workspace",
    text: "Back to a fresh install: clusters, projects, users except the built-in admin, settings, investigations and conversations are deleted. The activity log stays.",
    phrase: "reset workspace",
  },
];

/** Settings › Danger Zone: each action asks for a typed phrase and is recorded. */
export function DangerSection() {
  return (
    <Section id="danger" title="Danger Zone" description="Actions that cannot be undone. Each needs a typed confirmation">
      <div className="flex flex-col gap-4">
        {DANGERS.map((d) => (
          <DangerCard key={d.action} {...d} />
        ))}
      </div>
    </Section>
  );
}

function DangerCard({ action, title, text, phrase }: (typeof DANGERS)[number]) {
  const queryClient = useQueryClient();
  const [typed, setTyped] = useState("");
  const [done, setDone] = useState(false);
  const run = useMutation({
    mutationFn: () => api.danger(action, typed),
    onSuccess: () => {
      setDone(true);
      setTyped("");
      queryClient.invalidateQueries();
    },
  });
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-danger/40 bg-bg p-4">
      <span className="font-medium text-danger">{title}</span>
      <span className="text-sm text-muted">{text}</span>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-muted">
          Type <span className="font-mono text-fg">{phrase}</span> to confirm
        </span>
        <input className={`${input} max-w-80`} value={typed} onChange={(e) => setTyped(e.target.value)} spellCheck={false} autoCapitalize="none" />
      </label>
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={typed.trim().toLowerCase() !== phrase || run.isPending}
          onClick={() => run.mutate()}
          className="h-9 rounded-lg bg-danger px-4 text-sm font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {run.isPending ? "Working" : title}
        </button>
        {done && <span className="text-sm text-accent">Done</span>}
        {run.error && <span className="text-sm text-danger">{(run.error as Error).message}</span>}
      </div>
    </div>
  );
}
