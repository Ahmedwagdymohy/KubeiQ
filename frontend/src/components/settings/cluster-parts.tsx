"use client";

import type { ReactNode } from "react";

import { Dot, Terminal } from "@/components/ui";
import { apiOrigin, type Cluster } from "@/lib/api";

/** connect.sh as KubeiQ serves it: always the version that matches this server (ADR 0014). */
export const connectUrl = () => `${apiOrigin()}/api/v1/connect.sh`;

/** One source of clusters: a kubeconfig file or a Google Cloud project. */
export function SourceCard({
  title,
  kind,
  mono = false,
  removing = false,
  onRemove,
  children,
}: {
  title: string;
  kind: string;
  mono?: boolean;
  removing?: boolean;
  onRemove?: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-bg px-4 py-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col">
          <span className="text-sm font-medium">{title}</span>
          <span className={`truncate text-xs text-subtle ${mono ? "font-mono" : ""}`}>{kind}</span>
        </div>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            disabled={removing}
            className="shrink-0 text-sm text-subtle transition-colors hover:text-danger"
          >
            {removing ? "Removing" : "Remove"}
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

/** Connected clusters with their health. `fix` gives the commands that repair a broken one. */
export function ClusterRows({
  clusters,
  failed,
  loading = false,
  empty,
  fix,
}: {
  clusters: Cluster[];
  failed: boolean;
  loading?: boolean;
  empty: string;
  fix?: (cluster: Cluster) => string[] | null;
}) {
  if (clusters.length === 0)
    return (
      <p className="text-[13px] text-subtle">
        {loading ? "Checking the clusters" : failed ? "Could not load clusters" : empty}
      </p>
    );
  return (
    <ul className="flex flex-col gap-2.5">
      {clusters.map((cluster) => {
        const { id, name, status } = cluster;
        const broken = status && (!status.reachable || status.can_read === false);
        const commands = broken ? fix?.(cluster) : null;
        return (
          <li key={id} className="flex min-w-0 flex-col gap-1.5">
            <div className="flex min-w-0 items-center gap-2 text-sm">
              <Dot
                tone={
                  !status
                    ? failed ? "critical" : "info"
                    : !status.reachable ? "critical" : status.can_read === false ? "warning" : "healthy"
                }
              />
              <span className="truncate">{name}</span>
              {!broken && (
                <span className="shrink-0 text-xs text-subtle">
                  {!status ? (failed ? "Could not check this cluster" : "Checking") : `Kubernetes ${status.version}`}
                </span>
              )}
            </div>
            {broken && (
              <p className="break-words pl-4 text-xs text-muted">{status.error ?? "Unreachable"}</p>
            )}
            {commands && commands.length > 0 && (
              <div className="pl-4">
                <Terminal commands={commands} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** A numbered step in an add flow. */
export function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold text-muted">
        {n}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <span className="pt-0.5 text-sm font-medium">{title}</span>
        {children}
      </div>
    </div>
  );
}
