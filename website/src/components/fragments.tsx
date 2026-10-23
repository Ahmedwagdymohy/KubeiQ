import type { ReactNode } from "react";

import { DIAGNOSES, NAMESPACE } from "@/lib/demo";

/** Small, true pieces of the KubeiQ app, built in HTML at real size (data-ui). */

function Tray({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl bg-surface p-2 ${className}`}>
      <div data-ui className="flex h-full flex-col gap-4 rounded-xl bg-bg p-5 sm:p-6">
        {children}
      </div>
    </div>
  );
}

/** What leaves the cluster on its way to a model: the evidence, with secret values masked. */
export function Redaction() {
  return (
    <Tray>
      <p className="flex items-baseline justify-between text-sm">
        <span className="font-medium">Sent to the model</span>
        <span className="text-muted">payment, 5 lines</span>
      </p>
      <code className="block rounded-lg bg-terminal px-4 py-3 font-mono text-[13px] leading-6 text-terminal-fg">
        pod payment-6858dfbd56-bv8fn CrashLoopBackOff
        <br />
        log FATAL: required environment variable DATABASE_URL is not set
        <br />
        revision 1 DATABASE_URL=<span className="text-terminal-warn">••••</span>
        <br />
        env DB_PASSWORD=<span className="text-terminal-warn">••••</span>
        <br />
        header Authorization: Bearer <span className="text-terminal-warn">••••</span>
      </code>
      <p className="text-sm text-muted">
        Passwords, tokens, keys and connection strings are masked before anything reaches a model.
        Secret values are never read at all, only their names
      </p>
    </Tray>
  );
}

/** Cluster Map with Problems only switched on: each broken app and its one-line reason. */
export function MapProblems() {
  return (
    <Tray>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <code className="rounded-md bg-surface-2 px-2.5 py-1 font-mono text-[13px]">{NAMESPACE}</code>
        <span className="rounded-md px-2.5 py-1 ring-1 ring-control">Problems only</span>
        <span className="ml-auto flex items-center gap-1.5 text-muted">
          <span className="h-2 w-2 rounded-full bg-danger" /> 26 problems
        </span>
      </div>
      <ul className="flex flex-col gap-1">
        {DIAGNOSES.slice(0, 6).map((d) => (
          <li key={d.name} className="flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-surface">
            <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-sm bg-danger" />
            <span className="flex min-w-0 flex-col">
              <span className="text-[15px] font-medium">
                {d.name} <span className="font-normal text-muted">{d.kind}</span>
              </span>
              <span className="truncate text-sm text-muted">{d.cause}</span>
            </span>
          </li>
        ))}
      </ul>
    </Tray>
  );
}

/** The confirmation every change goes through, once an admin has turned changes on. */
export function RestartDialog() {
  return (
    <Tray>
      <p className="text-lg font-semibold">Delete pod payment-6858dfbd56-bv8fn?</p>
      <p className="text-[15px] text-muted">
        Its Deployment starts a new pod in its place. Type the name to confirm
      </p>
      <div className="rounded-lg px-3 py-2.5 ring-1 ring-control">
        <code className="font-mono text-[13px]">payment-6858dfbd56-bv8fn</code>
      </div>
      <div className="flex justify-end gap-2 text-[15px]">
        <span className="rounded-md px-4 py-2 ring-1 ring-control">Cancel</span>
        <span className="rounded-md bg-danger px-4 py-2 font-medium text-bg">Delete Pod</span>
      </div>
      <p className="text-sm text-muted">
        Recorded in Activity: admin, delete, Pod {NAMESPACE}/payment-6858dfbd56-bv8fn
      </p>
    </Tray>
  );
}

/** Settings, Users: the free plan's three seats. */
export function UsersPanel() {
  const users: [string, string, string][] = [
    ["admin", "Admin", "Signs in with the master key"],
    ["sara", "User", "Editor in payments"],
    ["omar", "User", "Viewer in payments, billing"],
  ];
  return (
    <Tray>
      <p className="flex items-baseline justify-between">
        <span className="text-[17px] font-semibold">Users</span>
        <span className="tnum text-sm text-muted">3 of 3 on the free plan</span>
      </p>
      <ul className="flex flex-col">
        {users.map(([name, role, note]) => (
          <li key={name} className="flex items-center gap-3 py-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-sm font-semibold uppercase">
              {name[0]}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[15px] font-medium">{name}</span>
              <span className="text-sm text-muted">{note}</span>
            </span>
            <span className="text-sm text-muted">{role}</span>
          </li>
        ))}
      </ul>
    </Tray>
  );
}

/** Settings, AI Model: any provider through one form. */
export function AIModelPanel() {
  return (
    <Tray>
      <p className="flex items-center gap-2 text-sm">
        <span className="h-2 w-2 rounded-full bg-healthy" />
        In use: <code className="font-mono text-[13px]">openai/gpt-4.1</code>
      </p>
      <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        {["OpenAI", "Anthropic", "OpenRouter", "Ollama"].map((p, i) => (
          <span
            key={p}
            className={`rounded-md px-3 py-2 ${i === 0 ? "font-medium ring-2 ring-fg" : "text-muted ring-1 ring-control"}`}
          >
            {p}
          </span>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-muted">Model</span>
          <code className="rounded-md px-3 py-2 font-mono text-[13px] ring-1 ring-control">openai/gpt-4.1</code>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-muted">API key</span>
          <code className="rounded-md bg-surface-2 px-3 py-2 font-mono text-[13px] text-muted">•••• 9f2c</code>
        </div>
      </div>
      <p className="text-sm text-muted">Your key is encrypted and never shown again</p>
    </Tray>
  );
}

/** What a ready machine looks like before you run the installer. */
export function RequirementsCheck() {
  return (
    <Tray>
      <p className="text-sm font-medium">Before you install</p>
      <code className="block rounded-lg bg-terminal px-4 py-3 font-mono text-[13px] leading-6 text-terminal-fg">
        <span className="text-accent">$</span> docker compose version
        <br />
        Docker Compose version v2.29.1
        <br />
        <span className="text-accent">$</span> git --version
        <br />
        git version 2.46.0
        <br />
        <span className="text-accent">$</span> kubectl config get-contexts -o name
        <br />
        kind-kubeiq-dev
      </code>
      <p className="text-sm text-muted">KubeiQ reads the contexts in ~/.kube/config. Read access is enough</p>
    </Tray>
  );
}
