"use client";

import { useState } from "react";

import type { UsagePoint } from "@/lib/api";

const GAP_MS = 3 * 60_000;

/**
 * One measured series (a percentage) over time: a 2px accent line on a fixed 0-100 scale, broken
 * where no sample was recorded, with a crosshair and value on hover. Real samples only (ADR 0015).
 */
export function Sparkline({
  points,
  field,
  label,
  height = 36,
  hours = 24,
}: {
  points: UsagePoint[];
  field: "cpu" | "memory";
  label: string;
  height?: number;
  hours?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 300;
  const all = points
    .map((p) => ({ t: new Date(p.at).getTime(), v: p[field] }))
    .filter((p): p is { t: number; v: number } => p.v !== null);
  // The window ends at the newest sample (the samples are a minute apart).
  const end = all.length ? all[all.length - 1].t : 0;
  // A young history spans what was recorded, and says since when, instead of a dot at the end.
  const start = Math.max(end - hours * 3_600_000, all.length ? all[0].t : 0);
  const partial = all.length > 0 && end - all[0].t < hours * 3_600_000 * 0.95;
  const values = all.filter((p) => p.t >= start);
  if (values.length < 2)
    return (
      <div className="flex items-center text-xs text-subtle" style={{ height }}>
        {values.length ? "Collecting history" : "No history yet"}
      </div>
    );

  const x = (t: number) => ((t - start) / (end - start)) * width;
  const y = (v: number) => height - 2 - (Math.min(100, v) / 100) * (height - 4);
  let d = "";
  values.forEach((p, i) => {
    const gap = i > 0 && p.t - values[i - 1].t > GAP_MS;
    d += `${i === 0 || gap ? "M" : "L"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`;
  });
  const near = hover === null ? null : values.reduce((a, b) => (Math.abs(x(b.t) - hover) < Math.abs(x(a.t) - hover) ? b : a));
  const last = values[values.length - 1];

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${label} over the last ${hours} hours, now ${Math.round(last.v)}%`}
        className="block w-full overflow-visible"
        style={{ height }}
        onMouseMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          setHover(((e.clientX - box.left) / box.width) * width);
        }}
        onMouseLeave={() => setHover(null)}
      >
        <line x1="0" x2={width} y1={height - 1} y2={height - 1} stroke="var(--border)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {near && (
          <line x1={x(near.t)} x2={x(near.t)} y1="0" y2={height} stroke="var(--text-subtle)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        )}
        {/* Hit area larger than the line. */}
        <rect x="0" y="0" width={width} height={height} fill="transparent" />
      </svg>
      {near && (
        <div
          className="pointer-events-none absolute -top-8 z-10 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-bg px-2 py-1 text-xs shadow-md"
          style={{ left: `${(x(near.t) / width) * 100}%` }}
        >
          <span className="text-muted">{new Date(near.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>{" "}
          <span className="font-medium tabular-nums text-fg">{Math.round(near.v)}%</span>
        </div>
      )}
      {partial && (
        <span className="mt-1 block text-right text-[11px] text-subtle">
          Since {new Date(start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      )}
    </div>
  );
}
