"use client";

import { useState } from "react";

import { CloseIcon } from "@/components/icons";
import type { ClusterLabel, LabelColor } from "@/lib/api";

export const COLORS: LabelColor[] = ["red", "amber", "blue", "green", "violet", "cyan", "pink", "slate"];
const TEXT: Record<LabelColor, string> = {
  red: "text-label-red bg-label-red/10",
  amber: "text-label-amber bg-label-amber/10",
  blue: "text-label-blue bg-label-blue/10",
  green: "text-label-green bg-label-green/10",
  violet: "text-label-violet bg-label-violet/10",
  cyan: "text-label-cyan bg-label-cyan/10",
  pink: "text-label-pink bg-label-pink/10",
  slate: "text-label-slate bg-label-slate/10",
};
const SWATCH: Record<LabelColor, string> = {
  red: "bg-label-red",
  amber: "bg-label-amber",
  blue: "bg-label-blue",
  green: "bg-label-green",
  violet: "bg-label-violet",
  cyan: "bg-label-cyan",
  pink: "bg-label-pink",
  slate: "bg-label-slate",
};
export const PRESETS: ClusterLabel[] = [
  { name: "production", color: "red" },
  { name: "staging", color: "amber" },
  { name: "development", color: "blue" },
  { name: "testing", color: "violet" },
  { name: "monitoring", color: "cyan" },
  { name: "internal", color: "slate" },
  { name: "external", color: "green" },
  { name: "critical", color: "red" },
  { name: "legacy", color: "slate" },
];
export const MAX_LABELS = 10;

export function LabelChip({ label, onRemove }: { label: ClusterLabel; onRemove?: () => void }) {
  return (
    <span
      className={`inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-2 text-[11px] font-semibold ${TEXT[label.color]}`}
    >
      {label.name}
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`Remove ${label.name}`} className="-mr-1 rounded-full p-0.5 hover:bg-bg/60">
          <CloseIcon width={10} height={10} />
        </button>
      )}
    </span>
  );
}

export function LabelList({ labels, max = 3 }: { labels: ClusterLabel[] | undefined; max?: number }) {
  if (!labels?.length) return null;
  return (
    <span className="flex min-w-0 items-center gap-1">
      {labels.slice(0, max).map((l) => (
        <LabelChip key={l.name} label={l} />
      ))}
      {labels.length > max && <span className="text-[11px] text-subtle">+{labels.length - max}</span>}
    </span>
  );
}

/** Presets to toggle, plus custom labels with a small palette. Up to ten per cluster. */
export function LabelEditor({ value, onChange }: { value: ClusterLabel[]; onChange: (labels: ClusterLabel[]) => void }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState<LabelColor>("blue");
  const has = (n: string) => value.some((l) => l.name === n);
  const full = value.length >= MAX_LABELS;
  const add = (label: ClusterLabel) => {
    if (!has(label.name) && !full) onChange([...value, label]);
  };
  const clean = name.trim().toLowerCase();
  const valid = /^[a-z0-9][a-z0-9 ._-]{0,23}$/.test(clean);

  return (
    <div className="flex flex-col gap-3">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((l) => (
            <LabelChip key={l.name} label={l} onRemove={() => onChange(value.filter((v) => v.name !== l.name))} />
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.filter((p) => !has(p.name)).map((p) => (
          <button
            key={p.name}
            type="button"
            disabled={full}
            onClick={() => add(p)}
            className="inline-flex h-6 items-center gap-1.5 rounded-full border border-control px-2.5 text-xs text-muted transition-colors hover:border-subtle hover:text-fg disabled:opacity-50"
          >
            <span className={`h-1.5 w-1.5 rounded-full ${SWATCH[p.color]}`} />
            {p.name}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && valid) {
              e.preventDefault();
              add({ name: clean, color });
              setName("");
            }
          }}
          placeholder="Custom label"
          maxLength={24}
          aria-label="Custom label"
          className="h-8 w-40 rounded-lg border border-control bg-bg px-2.5 text-sm outline-none focus:border-accent"
        />
        <div role="radiogroup" aria-label="Colour" className="flex items-center gap-1">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={color === c}
              aria-label={c}
              onClick={() => setColor(c)}
              className={`h-5 w-5 rounded-full ${SWATCH[c]} ${color === c ? "ring-2 ring-fg ring-offset-2 ring-offset-bg" : ""}`}
            />
          ))}
        </div>
        <button
          type="button"
          disabled={!valid || full || has(clean)}
          onClick={() => {
            add({ name: clean, color });
            setName("");
          }}
          className="text-sm font-medium text-accent disabled:text-subtle"
        >
          Add
        </button>
        {full && <span className="text-xs text-subtle">Up to {MAX_LABELS} labels</span>}
      </div>
    </div>
  );
}
