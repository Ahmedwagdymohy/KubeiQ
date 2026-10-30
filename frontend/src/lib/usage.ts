import type { Gauge } from "@/lib/api";

export type Thresholds = { warning: number; critical: number };
export const DEFAULT_THRESHOLDS: Thresholds = { warning: 60, critical: 80 };

export const percent = (g: Gauge) => (g.capacity ? (100 * g.used) / g.capacity : 0);

/** Bar colour for a usage percentage against the cluster's thresholds. */
export function usageTone(value: number, t: Thresholds = DEFAULT_THRESHOLDS): "ok" | "warning" | "critical" {
  if (value >= t.critical) return "critical";
  if (value >= t.warning) return "warning";
  return "ok";
}

export const USAGE_BAR = { ok: "bg-healthy", warning: "bg-warning", critical: "bg-danger" } as const;

export function cores(n: number): string {
  if (n < 1) return `${Math.round(n * 1000)}m`;
  return `${n >= 10 ? Math.round(n) : n.toFixed(1)}`;
}

export function bytes(n: number): string {
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n >= 10 || i === 0 ? Math.round(n) : n.toFixed(1)} ${units[i]}`;
}
