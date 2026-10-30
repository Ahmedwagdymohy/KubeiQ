"use client";

import { useEffect, useRef, useState } from "react";

import { CheckIcon, ChevronDownIcon } from "@/components/icons";

/** A namespace picker with search, "All namespaces" first when the user may see them all. */
export function NamespacePicker({
  value,
  namespaces,
  allowAll,
  disabled = false,
  onChange,
}: {
  value: string;
  namespaces: string[];
  allowAll: boolean;
  disabled?: boolean;
  onChange: (ns: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const q = text.trim().toLowerCase();
  const options = [...(allowAll ? [""] : []), ...namespaces].filter((ns) => !q || (ns || "all namespaces").includes(q));
  const pick = (ns: string) => {
    onChange(ns);
    setOpen(false);
    setText("");
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Namespace"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className="flex h-8 min-w-44 items-center gap-2 rounded-lg border border-control bg-bg px-2.5 text-sm text-fg transition-colors hover:border-subtle disabled:opacity-50"
      >
        <span className="truncate">{value || "All namespaces"}</span>
        <ChevronDownIcon width={14} height={14} className="ml-auto shrink-0 text-subtle" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 flex w-64 flex-col rounded-lg border border-border bg-bg p-1.5 shadow-lg shadow-black/10">
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
              if (e.key === "Enter" && options[0] !== undefined) pick(options[0]);
            }}
            placeholder="Find a namespace"
            aria-label="Find a namespace"
            className="mb-1 h-8 rounded-md border border-control bg-bg px-2.5 text-sm outline-none focus:border-accent"
          />
          <ul role="listbox" className="flex max-h-72 flex-col overflow-y-auto text-sm">
            {options.length === 0 && <li className="px-2.5 py-2 text-muted">Nothing matches</li>}
            {options.map((ns) => (
              <li key={ns || "*"}>
                <button
                  type="button"
                  role="option"
                  aria-selected={ns === value}
                  onClick={() => pick(ns)}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-surface-2"
                >
                  <span className={`truncate ${ns ? "" : "text-muted"}`}>{ns || "All namespaces"}</span>
                  {ns === value && <CheckIcon width={14} height={14} className="ml-auto shrink-0 text-accent" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
