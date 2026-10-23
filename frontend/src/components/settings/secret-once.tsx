"use client";

import { useState } from "react";

import { CheckIcon, CopyIcon } from "@/components/icons";

/** A generated password, shown once with a copy button. */
export function SecretOnce({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      // clipboard unavailable; the value is still visible
    }
  };
  return (
    <div className="flex flex-col gap-2 rounded-md border border-accent/40 bg-accent/5 px-4 py-3">
      <span className="text-sm text-fg">{label}</span>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate font-mono text-sm">{value}</code>
        <button
          type="button"
          onClick={copy}
          aria-label="Copy"
          className="rounded p-1 text-muted transition-colors hover:bg-surface-2 hover:text-fg"
        >
          {copied ? <CheckIcon className="text-accent" /> : <CopyIcon />}
        </button>
      </div>
      <span className="text-xs text-subtle">It will not be shown again.</span>
    </div>
  );
}
