"use client";

import { useState } from "react";

import { CheckIcon, CopyIcon } from "@/components/icons";
import { PLACEHOLDER } from "@/lib/demo";

export function CopyButton({ text, label = "Copy command" }: { text: string; label?: string }) {
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
      aria-label={copied ? "Copied" : label}
      title={copied ? "Copied" : "Copy"}
      className="shrink-0 rounded p-1 text-terminal-fg/60 transition-[color,background-color,transform] hover:bg-white/10 hover:text-terminal-fg active:scale-90"
    >
      {copied ? <CheckIcon className="text-accent" /> : <CopyIcon />}
    </button>
  );
}

/** A command with its `<placeholders>` highlighted. */
export function CommandText({ command }: { command: string }) {
  return (
    <>
      {command.split(PLACEHOLDER).map((part, i) =>
        i % 2 ? (
          <span key={i} className="text-terminal-warn">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}

/** Terminal block: one command per line, each with its own copy button. */
export function CommandBlock({ commands, wrap = false }: { commands: string[]; wrap?: boolean }) {
  return (
    <div className="overflow-hidden rounded-lg bg-terminal text-left">
      <ul className="flex flex-col py-3">
        {commands.map((command) => (
          <li key={command} className="flex items-start gap-3 px-4 py-1.5">
            <code className="select-none font-mono text-sm leading-6 text-accent" aria-hidden>
              $
            </code>
            <code
              className={`min-w-0 flex-1 font-mono text-sm leading-6 text-terminal-fg ${
                wrap ? "whitespace-pre-wrap break-all" : "overflow-x-auto whitespace-pre"
              }`}
            >
              <CommandText command={command} />
            </code>
            <CopyButton text={command} />
          </li>
        ))}
      </ul>
    </div>
  );
}
