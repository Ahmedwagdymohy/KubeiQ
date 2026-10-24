"use client";

import { useState, type ReactNode } from "react";

import { CheckIcon, CopyIcon } from "@/components/icons";

const DOTS: Record<string, string> = {
  critical: "bg-danger",
  warning: "bg-warning",
  info: "bg-subtle",
  healthy: "bg-healthy",
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
/** Values the user must fill in, such as `<database-url>`. */
const PLACEHOLDER = /(<[a-z][a-z0-9-]*>)/;

export function hasPlaceholder(command: string) {
  return PLACEHOLDER.test(command);
}

export function Terminal({ commands }: { commands: string[] }) {
  return (
    <div className="overflow-hidden rounded-lg bg-terminal">
      <ul className="flex flex-col py-2.5">
        {commands.map((command) => (
          <li key={command} className="flex items-start gap-3 px-4 py-1.5 hover:bg-white/[0.03]">
            <span className="select-none font-mono text-sm leading-6 text-accent">$</span>
            <code className="min-w-0 flex-1 whitespace-pre-wrap break-words font-mono text-sm leading-6 text-terminal-fg [font-variant-ligatures:none]">
              {command.split(PLACEHOLDER).map((part, i) =>
                i % 2 ? (
                  <span key={i} className="text-terminal-warn">
                    {part}
                  </span>
                ) : (
                  part
                ),
              )}
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

/** Read-only text such as YAML or logs, in the terminal palette, with one copy button. */
export function CodeBlock({ text, className = "" }: { text: string; className?: string }) {
  return (
    <div className="relative overflow-hidden rounded-lg bg-terminal">
      <div className="absolute right-2 top-2">
        <CopyButton text={text} />
      </div>
      <pre
        className={`overflow-auto p-4 pr-10 font-mono text-xs leading-5 text-terminal-fg ${className}`}
      >
        {text}
      </pre>
    </div>
  );
}
