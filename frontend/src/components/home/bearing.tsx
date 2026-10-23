"use client";

import Link from "next/link";

import { investigateHref, type Workload } from "@/lib/fleet";
import type { MapStatus } from "@/lib/api";

const TONE: Record<MapStatus, string> = {
  error: "var(--danger)",
  warning: "var(--warning)",
  healthy: "var(--accent)",
};

/**
 * The bearing: every workload of the cluster as one mark on a compass ring, grouped by namespace
 * and read clockwise from north. Broken workloads stand out as long red marks, so the whole
 * cluster's health reads in one look; the count of failing workloads sits in the middle.
 * Each broken mark links to an investigation of that workload.
 */
export function Bearing({ cluster, workloads }: { cluster: string; workloads: Workload[] }) {
  const ordered = [...workloads].sort(
    (a, b) => a.namespace.localeCompare(b.namespace) || a.name.localeCompare(b.name),
  );
  const failing = workloads.filter((w) => w.status !== "healthy").length;
  const n = Math.max(ordered.length, 1);
  const R = 100;
  const step = 360 / n;
  // Namespace arcs: a quiet inner ring split where the namespace changes.
  const arcs: { namespace: string; from: number; to: number }[] = [];
  ordered.forEach((w, i) => {
    const last = arcs[arcs.length - 1];
    if (last && last.namespace === w.namespace) last.to = (i + 1) * step;
    else arcs.push({ namespace: w.namespace, from: i * step, to: (i + 1) * step });
  });
  const point = (deg: number, r: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return [Math.cos(rad) * r, Math.sin(rad) * r];
  };
  const arc = (from: number, to: number, r: number) => {
    const gap = Math.min(3, (to - from) / 4);
    const [x1, y1] = point(from + gap, r);
    const [x2, y2] = point(to - gap, r);
    const large = to - from - 2 * gap > 180 ? 1 : 0;
    return `M${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2}`;
  };

  return (
    <svg viewBox="-128 -128 256 256" className="h-auto w-full max-w-[300px]" role="img" aria-label={`${failing} of ${workloads.length} workloads failing`}>
      {/* compass ring and the four cardinal ticks */}
      <circle r={R + 14} fill="none" stroke="var(--border)" strokeWidth={1} />
      {[0, 90, 180, 270].map((d) => {
        const [x1, y1] = point(d, R + 14);
        const [x2, y2] = point(d, R + 22);
        return <line key={d} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--text-subtle)" strokeWidth={1.5} />;
      })}
      {arcs.map((a) => (
        <path key={a.namespace} d={arc(a.from, a.to, R - 30)} fill="none" stroke="var(--border)" strokeWidth={3} strokeLinecap="round">
          <title>{a.namespace}</title>
        </path>
      ))}
      {ordered.map((w, i) => {
        const deg = i * step + step / 2;
        const broken = w.status !== "healthy";
        const [x1, y1] = point(deg, broken ? R - 18 : R - 6);
        const [x2, y2] = point(deg, R + 8);
        const mark = (
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={TONE[w.status]} strokeWidth={broken ? 5 : 3} strokeLinecap="round">
            <title>{`${w.name} (${w.kind} in ${w.namespace})${w.reason ? `: ${w.reason}` : ""}`}</title>
          </line>
        );
        return broken ? (
          <Link key={w.ref} href={investigateHref(cluster, w)} aria-label={`Investigate ${w.name}`}>
            {mark}
          </Link>
        ) : (
          <g key={w.ref}>{mark}</g>
        );
      })}
      <text y={-2} textAnchor="middle" className="fill-fg text-[44px] font-bold tabular-nums" style={{ letterSpacing: "-0.03em" }}>
        {failing}
      </text>
      <text y={22} textAnchor="middle" className="fill-muted text-[12px]">
        {failing === 1 ? "workload failing" : "workloads failing"}
      </text>
    </svg>
  );
}
