import type { KindInfo } from "@/lib/api";

export const kindKey = (k: Pick<KindInfo, "group" | "version" | "resource">) =>
  `${k.group || "core"}/${k.version}/${k.resource}`;

export const DEFAULT_KIND = "core/v1/pods";

/** Kinds whose Logs tab shows the logs of the pods they select (group/resource). */
export const SELECTS_PODS = new Set([
  "apps/deployments",
  "apps/statefulsets",
  "apps/daemonsets",
  "apps/replicasets",
  "batch/jobs",
  "/services",
]);

/** Kinds Cluster Doctor can investigate, as used in its `focus` links. */
export const INVESTIGABLE = new Set([
  "Pod",
  "Deployment",
  "StatefulSet",
  "DaemonSet",
  "Job",
  "CronJob",
  "Service",
]);

/** Kinds Cluster Map draws, so "Show on map" makes sense. */
export const ON_MAP = new Set([
  ...INVESTIGABLE,
  "ReplicaSet",
  "Ingress",
  "PersistentVolumeClaim",
  "ConfigMap",
  "Secret",
  "HorizontalPodAutoscaler",
]);

export const SCALABLE = new Set(["apps/deployments", "apps/statefulsets", "apps/replicasets"]);
export const RESTARTABLE = new Set(["apps/deployments", "apps/statefulsets", "apps/daemonsets"]);

export function age(timestamp: string | null | undefined): string {
  if (!timestamp) return "";
  const seconds = Math.max(0, (Date.now() - new Date(timestamp).getTime()) / 1000);
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}
