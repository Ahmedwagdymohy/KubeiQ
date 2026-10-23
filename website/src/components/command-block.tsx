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
      className="press shrink-0 rounded p-1 text-terminal-fg/60 transition-colors hover:bg-white/10 hover:text-terminal-fg"
    >
      {copied ? <CheckIcon className="text-field" /> : <CopyIcon />}
    </button>
  );
}

/** Highlights `<placeholders>` the user must replace, as the app does. */
function Highlighted({ command }: { command: string }) {
  const parts = command.split(/(<[a-z0-9-]+>)/g);
  return (
    <>
      {parts.map((part, i) =>
        /^<[a-z0-9-]+>$/.test(part) ? (
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

/** The command lines alone: `$` prompt, one command per line, a copy button each. */
export function CommandLines({ commands, wrap = true }: { commands: string[]; wrap?: boolean }) {
  return (
    <ul className="flex flex-col rounded-md bg-terminal py-2 text-left">
      {commands.map((command) => (
        <li key={command} className="flex items-start gap-3 px-3.5 py-1">
          <code aria-hidden className="select-none font-mono text-[13px] leading-6 text-field">$</code>
          <code
            className={`min-w-0 flex-1 font-mono text-[13px] leading-6 text-terminal-fg ${
              wrap ? "whitespace-pre-wrap break-all" : "overflow-x-auto whitespace-pre"
            }`}
          >
            <Highlighted command={command} />
          </code>
          <CopyButton text={command} />
        </li>
      ))}
    </ul>
  );
}

/** Terminal block for install commands: one command per line, each with its own copy button. */
export function CommandBlock({ commands }: { commands: string[] }) {
  return (
    <div data-ui className="w-full">
      <CommandLines commands={commands} wrap={false} />
    </div>
  );
}
