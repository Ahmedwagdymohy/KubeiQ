"use client";

import { useState } from "react";

import { CheckIcon, CopyIcon } from "@/components/icons";

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

/** Terminal-style block: one command per line, each with its own copy button. */
export function CommandBlock({ commands }: { commands: string[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-terminal text-left">
      <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
      </div>
      <ul className="flex flex-col py-2">
        {commands.map((command) => (
          <li key={command} className="flex items-start gap-3 px-4 py-1.5">
            <span className="select-none font-mono text-sm leading-6 text-accent">$</span>
            <code className="min-w-0 flex-1 overflow-x-auto whitespace-pre font-mono text-sm leading-6 text-terminal-fg">
              {command}
            </code>
            <CopyButton text={command} />
          </li>
        ))}
      </ul>
    </div>
  );
}
