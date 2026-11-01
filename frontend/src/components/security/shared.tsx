"use client";

import type { SecuritySeverity, SecurityTarget } from "@/lib/api";

export const SEVERITIES: SecuritySeverity[] = ["critical", "high", "medium", "low"];

const PILL: Record<SecuritySeverity, string> = {
  critical: "bg-danger-soft text-danger",
  high: "text-danger ring-1 ring-inset ring-danger/40",
  medium: "bg-warning-soft text-warning",
  low: "bg-surface-2 text-muted",
};

/** Severity as a word in a pill: never colour alone. */
export function SeverityPill({ severity }: { severity: SecuritySeverity }) {
  return (
    <span className={`inline-flex h-5 w-fit shrink-0 items-center rounded px-1.5 text-xs font-semibold capitalize ${PILL[severity]}`}>
      {severity}
    </span>
  );
}

export function SeverityCounts({ counts }: { counts: Record<SecuritySeverity, number> }) {
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-1 text-sm tabular-nums">
      {SEVERITIES.map((s) => (
        <span key={s} className={counts[s] ? (s === "critical" || s === "high" ? "text-danger" : s === "medium" ? "text-warning" : "text-muted") : "text-subtle"}>
          <span className="font-semibold">{counts[s] ?? 0}</span> {s}
        </span>
      ))}
    </span>
  );
}

const KINDS: Record<string, string> = {
  Pod: "core/v1/pods",
  Deployment: "apps/v1/deployments",
  StatefulSet: "apps/v1/statefulsets",
  DaemonSet: "apps/v1/daemonsets",
  Job: "batch/v1/jobs",
  CronJob: "batch/v1/cronjobs",
  Service: "core/v1/services",
  ConfigMap: "core/v1/configmaps",
  ServiceAccount: "core/v1/serviceaccounts",
  Namespace: "core/v1/namespaces",
  Role: "rbac.authorization.k8s.io/v1/roles",
  RoleBinding: "rbac.authorization.k8s.io/v1/rolebindings",
  ClusterRole: "rbac.authorization.k8s.io/v1/clusterroles",
  ClusterRoleBinding: "rbac.authorization.k8s.io/v1/clusterrolebindings",
  NetworkPolicy: "networking.k8s.io/v1/networkpolicies",
  Ingress: "networking.k8s.io/v1/ingresses",
};

export function kindResource(kind: string): string {
  return (KINDS[kind] ?? "").split("/")[2] ?? kind.toLowerCase();
}

/** The object in Cluster Manager, or null for kinds it does not list (the control plane). */
export function objectHref(cluster: string, target: SecurityTarget): string | null {
  const kind = KINDS[target.kind];
  if (!kind) return null;
  const q = new URLSearchParams({ cluster, kind, name: target.name });
  if (target.namespace) {
    q.set("in", target.namespace);
    q.set("namespace", target.namespace);
  }
  return `/manager?${q}`;
}

export function targetLabel(target: SecurityTarget): string {
  return `${target.namespace ? `${target.namespace}/` : ""}${target.name}`;
}

export const SYSTEM_REASON = "Part of Kubernetes or the cluster's own add-ons";
