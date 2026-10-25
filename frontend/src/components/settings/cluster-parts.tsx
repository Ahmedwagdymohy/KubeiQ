"use client";

import type { ReactNode } from "react";

import { Dot } from "@/components/ui";
import type { Cluster } from "@/lib/api";

export const CONNECT_URL =
  "https://raw.githubusercontent.com/Ahmedwagdymohy/KubeiQ/main/deploy/connect.sh";

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

export function ClusterRows({
  clusters,
  failed,
  empty,
}: {
  clusters: Cluster[];
  failed: boolean;
  empty: string;
}) {
  if (clusters.length === 0) return <p className="text-[13px] text-subtle">{failed ? "Could not load clusters" : empty}</p>;
  return (
    <ul className="flex flex-col gap-1.5">
      {clusters.map(({ id, name, status }) => (
        <li key={id} className="flex items-center gap-2 text-sm">
          <Dot tone={!status ? (failed ? "critical" : "info") : status.reachable ? "healthy" : "critical"} />
          <span>{name}</span>
          <span className="min-w-0 truncate text-xs text-subtle">
            {!status
              ? failed
                ? "Could not check this cluster"
                : "Checking"
              : status.reachable
                ? `Kubernetes ${status.version}`
                : (status.error ?? "Unreachable")}
          </span>
        </li>
      ))}
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
