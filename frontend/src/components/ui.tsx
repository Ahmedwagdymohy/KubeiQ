"use client";

import { useState, type ReactNode } from "react";

import { CheckIcon, CopyIcon } from "@/components/icons";

const DOTS: Record<string, string> = {
  critical: "bg-danger",
  warning: "bg-warning",
  info: "bg-subtle",
  healthy: "bg-accent",
};

export function Dot({ tone, pulse = false }: { tone: string; pulse?: boolean }) {
  return (
    <span
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${DOTS[tone] ?? "bg-subtle"} ${
        pulse ? "animate-pulse" : ""
      }`}
    />
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="text-sm font-medium text-muted">{children}</p>;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable (insecure context); nothing to do
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? "Copied" : "Copy command"}
      title={copied ? "Copied" : "Copy"}
      className="shrink-0 rounded p-1 text-terminal-fg/50 transition-colors hover:bg-white/10 hover:text-terminal-fg"
    >
      {copied ? <CheckIcon className="text-accent" /> : <CopyIcon />}
    </button>
  );
}

/** Terminal-style block: one runnable command per line, each with its own copy button. */
export function Terminal({ commands }: { commands: string[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-terminal">
      <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
      </div>
      <ul className="flex flex-col py-2">
        {commands.map((command) => (
          <li key={command} className="flex items-start gap-3 px-4 py-1.5 hover:bg-white/[0.03]">
            <span className="select-none font-mono text-sm leading-6 text-accent">$</span>
            <code className="min-w-0 flex-1 whitespace-pre-wrap break-words font-mono text-sm leading-6 text-terminal-fg">
              {command}
            </code>
            <CopyButton text={command} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Spinner() {
  return <span className="inline-block h-2 w-2 shrink-0 animate-pulse rounded-full bg-accent" />;
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
