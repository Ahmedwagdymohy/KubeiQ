"use client";

import { useState, type ReactNode } from "react";

import type { Severity } from "@/lib/api";

export function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-[3px] border border-fg/60 px-2 py-0.5 font-mono text-xs text-fg/90">
      {children}
    </span>
  );
}

const DOTS: Record<string, string> = {
  critical: "bg-danger",
  warning: "bg-warning",
  info: "bg-subtle",
  healthy: "bg-accent",
  ai: "bg-accent",
  rules: "bg-fg/70",
};

export function Pill({ children, tone }: { children: ReactNode; tone: Severity | string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-0.5 text-xs text-muted">
      <span className={`h-1.5 w-1.5 rounded-full ${DOTS[tone] ?? "bg-subtle"}`} />
      {children}
    </span>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="font-mono text-xs uppercase tracking-wider text-subtle">{children}</p>;
}

export function CommandBlock({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard not available (e.g. insecure context); ignore
    }
  };
  return (
    <div className="group flex items-start justify-between gap-3 rounded-md border border-border bg-bg px-3 py-2">
      <code className="min-w-0 break-words font-mono text-xs text-fg/90">{command}</code>
      <button
        type="button"
        onClick={copy}
        className="shrink-0 font-mono text-xs text-subtle transition-colors hover:text-accent"
      >
        {copied ? "copied" : "copy"}
      </button>
    </div>
  );
}

export function Spinner() {
  return <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-accent" />;
}

/** Renders `backtick` spans from AI text as inline code. */
export function RichText({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("`") && part.endsWith("`") && part.length > 2 ? (
          <code key={i} className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[0.85em] text-fg">
            {part.slice(1, -1)}
          </code>
        ) : (
          part
        ),
      )}
    </>
  );
}
