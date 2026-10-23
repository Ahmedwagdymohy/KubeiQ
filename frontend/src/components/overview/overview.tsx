"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { headline, timeAgo, tone } from "@/components/doctor/history-list";
import { RefreshIcon } from "@/components/icons";
import { type ClusterHealth, useFleet } from "@/components/overview/use-fleet";
import { primaryButton, secondaryButton } from "@/components/settings/fields";
import { Dot } from "@/components/ui";
import { api, type MapStatus } from "@/lib/api";
import { investigateHref, managerHref, type Workload } from "@/lib/fleet";

const STATUS: Record<MapStatus, { label: string; bar: string; text: string }> = {
  healthy: { label: "Healthy", bar: "bg-healthy", text: "text-fg" },
  warning: { label: "Degraded", bar: "bg-warning", text: "text-warning" },
  error: { label: "Failing", bar: "bg-danger", text: "text-danger" },
};
const ORDER: MapStatus[] = ["healthy", "warning", "error"];
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function Overview() {
  const fleet = useFleet();
  const ready = fleet.health.filter((h) => h.state === "ready");
  const problems = ready.flatMap((h) =>
    h.workloads.filter((w) => w.status !== "healthy").map((w) => ({ cluster: h.cluster.id, w })),
  );
  const failing = problems.filter((p) => p.w.status === "error").length;
  const degraded = problems.length - failing;
  const total = ready.reduce((sum, h) => sum + h.workloads.length, 0);
  const worst = [...ready].sort(
    (a, b) => b.counts.error - a.counts.error || b.counts.warning - a.counts.warning,
  )[0];
  const updated = Math.max(0, ...fleet.health.map((h) => h.updatedAt));

  let finding = "Checking your clusters";
  if (!fleet.loading || ready.length) {
    if (fleet.clusters.data?.length === 0) finding = "No clusters connected yet";
    else if (problems.length === 0 && ready.length)
      finding = `All ${plural(total, "workload")} are healthy across ${plural(ready.length, "cluster")}`;
    else if (problems.length) {
      const where = new Set(problems.map((p) => p.cluster)).size;
      const parts = [failing && `${failing} failing`, degraded && `${degraded} degraded`]
        .filter(Boolean)
        .join(" and ");
      finding = `${parts} of ${plural(total, "workload")} ${
        where === 1 ? `in ${worst?.cluster.name}` : `across ${where} clusters`
      }`;
    }
  }

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <p className="text-[15px] text-muted">
            {problems.length ? <span className="text-fg">{capitalise(finding)}</span> : finding}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-subtle sm:inline">
            {updated ? `Updated ${clock(updated)}` : ""}
          </span>
          <button
            type="button"
            onClick={fleet.refetch}
            aria-label="Refresh"
            title="Refresh"
            className={`${secondaryButton} flex h-9 w-9 items-center justify-center !px-0`}
          >
            <RefreshIcon className={fleet.fetching ? "animate-spin [animation-duration:1.2s]" : ""} />
          </button>
          {worst && (
            <Link href={`/doctor?cluster=${encodeURIComponent(worst.cluster.id)}`} className={primaryButton}>
              Investigate {worst.cluster.name}
            </Link>
          )}
        </div>
      </div>

      <AINotice />

      <Ledger health={fleet.health} loading={fleet.clusters.isPending} />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <FailingWorkloads problems={problems} loading={fleet.loading && !ready.length} />
        <RecentInvestigations />
      </div>
    </div>
  );
}

function capitalise(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function clock(ms: number) {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Shown until an AI model is configured, so users know what they are missing. */
function AINotice() {
  const ai = useQuery({ queryKey: ["settings", "ai"], queryFn: api.aiSettings, retry: false });
  if (!ai.data || ai.data.active_model) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-lg bg-surface px-4 py-3 text-sm">
      <p className="text-muted">
        <span className="font-medium text-fg">AI investigations are off.</span> Known problems still
        get a root cause and a fix command; a model explains the rest
      </p>
      <Link href="/settings#ai" className="font-medium text-accent hover:underline">
        Add a Model
      </Link>
    </div>
  );
}

function Panel({
  title,
  meta,
  action,
  children,
  className = "",
}: {
  title: string;
  meta?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`flex flex-col rounded-lg border border-border ${className}`}>
      <div className="flex min-h-12 flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5">
        <div className="flex items-baseline gap-2">
          <h2 className="text-base font-semibold">{title}</h2>
          {meta && <span className="text-sm text-subtle">{meta}</span>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/* ---------- The cluster ledger: one row per cluster, its workloads as a 100% bar ---------- */

function Legend() {
  return (
    <ul className="flex items-center gap-4 text-xs text-muted">
      {ORDER.map((s) => (
        <li key={s} className="flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-[2px] ${STATUS[s].bar}`} />
          {STATUS[s].label}
        </li>
      ))}
    </ul>
  );
}

function Ledger({ health, loading }: { health: ClusterHealth[]; loading: boolean }) {
  const workloads = health.reduce((sum, h) => sum + h.workloads.length, 0);
  return (
    <Panel
      title="Cluster Ledger"
      meta={
        health.length
          ? `${plural(health.length, "cluster")} · ${plural(workloads, "workload")}`
          : undefined
      }
      action={<Legend />}
    >
      <div
        role="table"
        aria-label="Workload health by cluster"
        className="flex flex-col border-t border-border"
      >
        <div
          role="row"
          className="hidden h-9 items-center gap-5 px-4 text-xs text-subtle lg:grid lg:grid-cols-[minmax(160px,220px)_minmax(0,1fr)_repeat(3,64px)_80px]"
        >
          <span role="columnheader">Cluster and namespaces</span>
          <span role="columnheader">Workload health</span>
          {ORDER.map((s) => (
            <span key={s} role="columnheader" className="text-right">
              {STATUS[s].label}
            </span>
          ))}
          <span role="columnheader" className="sr-only">
            Actions
          </span>
        </div>
        {loading && <LedgerSkeleton />}
        {!loading && health.length === 0 && (
          <p className="px-4 py-6 text-sm text-muted">
            No clusters yet.{" "}
            <Link href="/settings#clusters" className="text-accent hover:underline">
              Add a kubeconfig in Settings
            </Link>
          </p>
        )}
        {health.map((h) => (
          <ClusterRows key={h.cluster.id} health={h} />
        ))}
      </div>
    </Panel>
  );
}

const NAMESPACE_ROWS = 5;

function ClusterRows({ health }: { health: ClusterHealth }) {
  const [all, setAll] = useState(false);
  const { cluster, namespaces, counts, state } = health;
  const shown = all ? namespaces : namespaces.slice(0, NAMESPACE_ROWS);
  const hidden = namespaces.length - shown.length;
  const mapHref = `/map?cluster=${encodeURIComponent(cluster.id)}`;

  return (
    <div role="rowgroup" className="border-t border-border first:border-t-0 lg:first:border-t">
      <LedgerRow
        strong
        name={cluster.name}
        sub={
          state === "ready"
            ? `Kubernetes ${cluster.status?.version ?? ""} · ${plural(health.workloads.length, "workload")}`
            : state === "offline"
              ? "Offline"
              : state === "error"
                ? "Could not read workloads"
                : "Reading workloads"
        }
        counts={state === "ready" ? counts : null}
        state={state}
        error={health.error}
        action={
          <Link href={mapHref} className="text-sm font-medium text-muted transition-colors hover:text-fg">
            Open Map
          </Link>
        }
      />
      {state === "ready" &&
        shown.map((ns) => (
          <LedgerRow
            key={ns.namespace}
            name={ns.namespace}
            sub={plural(ns.workloads.length, "workload")}
            counts={countOf(ns.workloads)}
            state="ready"
            action={
              <Link
                href={`${mapHref}&namespace=${encodeURIComponent(ns.namespace)}`}
                className="text-sm text-subtle transition-colors hover:text-fg"
              >
                Map
              </Link>
            }
          />
        ))}
      {state === "ready" && (hidden > 0 || all) && namespaces.length > NAMESPACE_ROWS && (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          className="w-full px-4 py-2.5 text-left text-sm text-muted transition-colors hover:bg-surface hover:text-fg lg:pl-9"
        >
          {all ? "Show fewer namespaces" : `Show ${plural(hidden, "more namespace")}`}
        </button>
      )}
    </div>
  );
}

function countOf(workloads: Workload[]) {
  const c: Record<MapStatus, number> = { healthy: 0, warning: 0, error: 0 };
  for (const w of workloads) c[w.status]++;
  return c;
}

function LedgerRow({
  name,
  sub,
  counts,
  state,
  error,
  action,
  strong = false,
}: {
  name: string;
  sub: string;
  counts: Record<MapStatus, number> | null;
  state: ClusterHealth["state"];
  error?: string | null;
  action: React.ReactNode;
  strong?: boolean;
}) {
  const total = counts ? counts.healthy + counts.warning + counts.error : 0;
  return (
    <div
      role="row"
      className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-5 gap-y-2 px-4 lg:grid-cols-[minmax(160px,220px)_minmax(0,1fr)_repeat(3,64px)_80px] ${
        strong ? "py-4" : "border-t border-border/70 py-2.5"
      }`}
    >
      <div role="cell" className={`flex min-w-0 flex-col ${strong ? "" : "lg:pl-5"}`}>
        <span
          className={`truncate font-mono ${strong ? "text-[14px] font-medium text-fg" : "text-[13px] text-muted"}`}
        >
          {name}
        </span>
        <span className="truncate text-xs text-subtle">{sub}</span>
      </div>

      <div role="cell" className="order-last col-span-2 min-w-0 lg:order-none lg:col-span-1">
        {counts && total > 0 ? (
          <HealthBar counts={counts} thick={strong} />
        ) : state === "loading" ? (
          <span className={`block w-full rounded-[3px] bg-surface-2 ${strong ? "h-3" : "h-1.5"}`} />
        ) : state === "ready" ? (
          <span className="text-sm text-subtle">No workloads</span>
        ) : (
          <span className="block truncate text-sm text-danger">{error}</span>
        )}
      </div>

      {ORDER.map((s) => (
        <span
          key={s}
          role="cell"
          className={`hidden text-right tabular-nums lg:block ${strong ? "text-[15px] font-medium" : "text-sm"} ${
            !counts ? "text-subtle" : counts[s] === 0 ? "text-subtle" : STATUS[s].text
          }`}
        >
          {counts ? counts[s] : "-"}
        </span>
      ))}

      <div role="cell" className="flex items-center justify-end gap-3">
        {counts && (
          <span className="text-xs tabular-nums text-muted lg:hidden">
            {counts.error > 0 && <span className="text-danger">{counts.error} failing · </span>}
            {counts.warning > 0 && <span className="text-warning">{counts.warning} degraded · </span>}
            {counts.healthy} healthy
          </span>
        )}
        <span className="hidden lg:inline">{action}</span>
      </div>
    </div>
  );
}

/** A 100% stacked bar: healthy, degraded, failing, split by 2px seams. */
function HealthBar({ counts, thick }: { counts: Record<MapStatus, number>; thick: boolean }) {
  const label = ORDER.map((s) => `${counts[s]} ${STATUS[s].label.toLowerCase()}`).join(", ");
  return (
    <div
      role="img"
      aria-label={label}
      title={label}
      className={`flex w-full gap-[2px] overflow-hidden rounded-[3px] ${thick ? "h-3" : "h-1.5"}`}
    >
      {ORDER.filter((s) => counts[s] > 0).map((s) => (
        <span
          key={s}
          className={`${STATUS[s].bar} h-full origin-left transition-[flex-grow] duration-500`}
          style={{ flexGrow: counts[s], flexBasis: 0 }}
        />
      ))}
    </div>
  );
}

function LedgerSkeleton() {
  return (
    <div className="flex flex-col gap-3 border-t border-border px-4 py-4">
      <span className="h-4 w-40 rounded bg-surface-2" />
      <span className="h-3 w-full rounded-[3px] bg-surface-2" />
    </div>
  );
}

/* ---------- What to do: the failing workloads, each with Investigate ---------- */

const FAILING_ROWS = 6;

function FailingWorkloads({
  problems,
  loading,
}: {
  problems: { cluster: string; w: Workload }[];
  loading: boolean;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? problems : problems.slice(0, FAILING_ROWS);
  return (
    <Panel
      title="Failing Workloads"
      meta={problems.length ? problems.length : undefined}
      action={
        problems.length > FAILING_ROWS ? (
          <button
            type="button"
            onClick={() => setAll((v) => !v)}
            className="text-sm font-medium text-muted transition-colors hover:text-fg"
          >
            {all ? "Show fewer" : `View all ${problems.length}`}
          </button>
        ) : undefined
      }
    >
      <ul className="flex flex-col border-t border-border">
        {loading &&
          [0, 1, 2].map((i) => (
            <li key={i} className="flex h-[68px] flex-col justify-center gap-2 px-4">
              <span className="h-3.5 w-48 rounded bg-surface-2" />
              <span className="h-3 w-72 max-w-full rounded bg-surface-2" />
            </li>
          ))}
        {!loading && problems.length === 0 && (
          <li className="px-4 py-6 text-sm text-muted">
            Nothing is failing. Every workload KubeiQ can see is running as expected
          </li>
        )}
        {shown.map(({ cluster, w }) => (
          <li
            key={`${cluster}|${w.ref}`}
            className="group flex min-h-[70px] items-center gap-3 border-t border-border/70 px-4 py-2.5 first:border-t-0"
          >
            <Dot tone={w.status === "error" ? "critical" : "warning"} />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                <span className="truncate font-medium">{w.name}</span>
                <span className="truncate font-mono text-xs text-subtle">
                  {w.kind}/{w.namespace}
                </span>
              </span>
              <span className="line-clamp-2 text-sm text-muted sm:truncate" title={w.reason ?? undefined}>
                {w.reason ?? "Not ready"}
              </span>
            </div>
            <Link
              href={managerHref(cluster, w)}
              className="hidden shrink-0 text-sm text-subtle transition-colors hover:text-fg sm:inline"
            >
              Open
            </Link>
            <Link href={investigateHref(cluster, w)} className={`${secondaryButton} shrink-0`}>
              Investigate
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function RecentInvestigations() {
  const recent = useQuery({ queryKey: ["investigations", 6], queryFn: () => api.investigations(6) });
  return (
    <Panel
      title="Recent Investigations"
      action={
        <Link href="/doctor" className="text-sm font-medium text-muted transition-colors hover:text-fg">
          View all
        </Link>
      }
    >
      <ul className="flex flex-col border-t border-border">
        {recent.isPending &&
          [0, 1, 2].map((i) => (
            <li key={i} className="flex h-[60px] flex-col justify-center gap-2 px-4">
              <span className="h-3.5 w-32 rounded bg-surface-2" />
              <span className="h-3 w-44 rounded bg-surface-2" />
            </li>
          ))}
        {recent.isError && (
          <li className="px-4 py-6 text-sm text-danger">
            Could not load investigations.{" "}
            <button type="button" onClick={() => recent.refetch()} className="underline">
              Retry
            </button>
          </li>
        )}
        {recent.data?.length === 0 && (
          <li className="px-4 py-6 text-sm text-muted">
            No investigations yet. Investigate a workload to see its root cause here
          </li>
        )}
        {recent.data?.map((item) => (
          <li key={item.id} className="border-t border-border/70 first:border-t-0">
            <Link
              href={`/doctor?id=${item.id}`}
              className="flex min-h-[70px] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface"
            >
              <Dot tone={tone(item)} />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-sm font-medium">{headline(item)}</span>
                <span className="truncate font-mono text-xs text-subtle">
                  {item.cluster_id.split(":").pop()}
                  {item.namespace ? `/${item.namespace}` : ""}
                </span>
              </span>
              <span className="shrink-0 text-xs tabular-nums text-subtle">{timeAgo(item.created_at)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
