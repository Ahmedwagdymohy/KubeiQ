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
    <div className="overflow-hidden rounded-lg bg-terminal text-left">
      <ul className="flex flex-col py-3">
        {commands.map((command) => (
          <li key={command} className="flex items-start gap-3 px-4 py-1.5">
            <code className="min-w-0 flex-1 whitespace-pre-wrap break-all font-mono text-sm leading-6 text-terminal-fg">
              <span className="select-none text-field">$ </span>
              {command}
            </code>
            <CopyButton text={command} />
          </li>
        ))}
      </ul>
    </div>
  );
}
