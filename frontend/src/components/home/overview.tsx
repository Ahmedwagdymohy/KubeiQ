"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { AINotice } from "@/components/home/ai-notice";
import { ShipsLog } from "@/components/home/ships-log";
import { Bearing } from "@/components/home/bearing";
import { RecentInvestigations } from "@/components/home/recent-investigations";
import { SystemStatus } from "@/components/system-status";
import { Dot } from "@/components/ui";
import { api } from "@/lib/api";
import { byNamespace, clusterName, countBy, investigateHref, managerHref, workloadsFromMap } from "@/lib/fleet";

const panel = "rounded-lg border border-border bg-panel";
const control =
  "h-8 rounded-md border border-border bg-panel px-2.5 text-sm text-fg outline-none focus:border-accent";
const LIST_CAP = 6;

const TONE = { error: "critical", warning: "warning", healthy: "healthy" } as const;

function time(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Home: is anything broken right now, and what do I do about it? */
export function Overview() {
  const clusters = useQuery({ queryKey: ["clusters"], queryFn: api.clusters });
  const [chosen, setChosen] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const cluster =
    chosen ?? clusters.data?.find((c) => c.is_default)?.id ?? clusters.data?.[0]?.id ?? null;

  const map = useQuery({
    queryKey: ["map", cluster, null],
    queryFn: () => api.map(cluster!, null),
    enabled: Boolean(cluster),
    refetchInterval: 30_000,
  });

  const workloads = map.data ? workloadsFromMap(map.data) : [];
  const failing = workloads.filter((w) => w.status !== "healthy");
  const counts = countBy(workloads);
  const namespaces = byNamespace(workloads);
  const name = cluster ? clusterName(cluster) : "";
  const shown = showAll ? failing : failing.slice(0, LIST_CAP);

  const finding = !cluster
    ? clusters.isPending
      ? "Loading clusters"
      : "Add a cluster in Settings to see its health here"
    : map.isPending
      ? `Reading ${name}`
      : map.isError
        ? `Could not read ${name}`
        : failing.length
          ? `${failing.length} of ${workloads.length} workloads are failing in ${name}. Start with ${failing[0].name}`
          : `All ${workloads.length} workloads in ${name} are running`;

  return (
    <main className="flex w-full flex-1 flex-col gap-6 px-4 py-6 sm:px-8 sm:py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
          <p className="text-base text-muted">{finding}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SystemStatus />
          {clusters.data && clusters.data.length > 1 && (
            <select aria-label="Cluster" className={control} value={cluster ?? ""} onChange={(e) => setChosen(e.target.value)}>
              {clusters.data.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          {map.data && (
            <button
              type="button"
              onClick={() => map.refetch()}
              className="h-8 rounded-md px-2.5 text-sm text-muted transition-colors hover:bg-surface hover:text-fg"
              title="Refresh"
            >
              Updated {time(map.data.collected_at)}
            </button>
          )}
        </div>
      </div>

      <AINotice />

      {/* The answer: the bearing beside the list of what is failing */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <section className={`${panel} flex flex-col gap-5 p-5`}>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-base font-semibold">Workload Health</h2>
            <span className="text-sm text-muted">{name}</span>
          </div>
          {map.isError ? (
            <p className="text-sm text-muted">
              Could not read this cluster.{" "}
              <button type="button" onClick={() => map.refetch()} className="font-medium text-fg underline underline-offset-4">
                Retry
              </button>
            </p>
          ) : (
            <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-8 lg:flex-col xl:flex-row">
              {map.data ? (
                <Bearing cluster={cluster!} workloads={workloads} />
              ) : (
                <div className="aspect-square w-full max-w-[300px] rounded-full bg-surface" />
              )}
              <dl className="grid w-full grid-cols-3 gap-4 sm:grid-cols-1 lg:grid-cols-3 xl:grid-cols-1">
                {(
                  [
                    ["Failing", counts.error, "critical"],
                    ["Warning", counts.warning, "warning"],
                    ["Running", counts.healthy, "healthy"],
                  ] as const
                ).map(([label, value, tone]) => (
                  <div key={label} className="flex flex-col gap-1">
                    <dt className="flex items-center gap-2 text-sm text-muted">
                      <Dot tone={tone} /> {label}
                    </dt>
                    <dd className={`text-2xl tabular-nums ${value === 0 ? "text-subtle" : "text-fg"}`}>
                      {map.data ? value : "-"}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
          <div className="-mx-5 mt-auto flex flex-col">
            <div className="flex items-baseline justify-between gap-3 border-t border-border px-5 pb-1 pt-4">
              <h3 className="text-sm font-semibold">Namespaces</h3>
              <Link href={cluster ? `/map?cluster=${encodeURIComponent(cluster)}` : "/map"} className="text-sm text-muted transition-colors hover:text-fg">
                Open the map
              </Link>
            </div>
            <ul className="flex flex-col">
              {namespaces.map((ns) => {
                const total = ns.workloads.length;
                return (
                  <li key={ns.namespace} className="flex flex-col gap-1.5 px-5 py-2">
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <Link
                        href={`/map?cluster=${encodeURIComponent(cluster!)}&namespace=${encodeURIComponent(ns.namespace)}`}
                        className="truncate font-medium hover:underline"
                      >
                        {ns.namespace}
                      </Link>
                      <span className="shrink-0 tabular-nums text-muted">
                        <span className={ns.failing ? "font-semibold text-danger" : ""}>{ns.failing}</span> of {total} failing
                      </span>
                    </div>
                    <div className="flex h-1 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                      <span className="bg-danger" style={{ width: `${(ns.failing / total) * 100}%` }} />
                      <span className="bg-accent" style={{ width: `${((total - ns.failing) / total) * 100}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <section className={`${panel} flex flex-col`}>
          <div className="flex items-baseline justify-between gap-3 px-5 pb-3 pt-5">
            <h2 className="text-base font-semibold">Needs Attention</h2>
            {failing.length > 0 && (
              <span className="text-sm text-muted tabular-nums">
                {failing.length} workload{failing.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
          {map.data && failing.length === 0 && (
            <p className="mx-5 mb-5 rounded-md border border-dashed border-border px-4 py-3 text-sm text-muted">
              Nothing is failing. Checked {workloads.length} workloads in {namespaces.length} namespaces
            </p>
          )}
          {!map.data && !map.isError && (
            <ul className="flex flex-col">
              {Array.from({ length: 4 }, (_, i) => (
                <li key={i} className="flex flex-col gap-2 border-t border-border px-5 py-3.5">
                  <span className="h-4 w-40 rounded bg-surface" />
                  <span className="h-3.5 w-64 rounded bg-surface" />
                </li>
              ))}
            </ul>
          )}
          <ul className="flex flex-col">
            {shown.map((w) => (
              <li key={w.ref} className="flex items-center gap-4 border-t border-border px-5 py-3">
                <Dot tone={TONE[w.status]} />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-semibold">{w.name}</span>
                    <span className="text-sm text-muted">
                      {w.kind} in {w.namespace}
                    </span>
                  </span>
                  {w.reason && <span className="truncate text-sm text-muted">{w.reason}</span>}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Link
                    href={managerHref(cluster!, w)}
                    className="hidden rounded-md px-2.5 py-1.5 text-sm text-muted transition-colors hover:bg-surface hover:text-fg sm:inline-flex"
                  >
                    Open
                  </Link>
                  <Link
                    href={investigateHref(cluster!, w)}
                    className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-ink transition-opacity hover:opacity-85"
                  >
                    Investigate
                  </Link>
                </div>
              </li>
            ))}
          </ul>
          {failing.length > LIST_CAP && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="mt-auto border-t border-border px-5 py-3 text-left text-sm font-medium text-muted transition-colors hover:text-fg"
            >
              {showAll ? "Show fewer" : `View all ${failing.length}`}
            </button>
          )}
        </section>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <section className={`${panel} flex flex-col`}>
          <div className="flex items-baseline justify-between gap-3 px-5 pb-2 pt-5">
            <h2 className="text-base font-semibold">Recent Investigations</h2>
            <Link href="/doctor" className="text-sm text-muted transition-colors hover:text-fg">
              Open Cluster Doctor
            </Link>
          </div>
          <RecentInvestigations />
        </section>

        <ShipsLog />
      </div>
    </main>
  );
}
