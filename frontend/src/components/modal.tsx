"use client";

import { useEffect, type ReactNode } from "react";

import { CloseIcon } from "@/components/icons";

/** A dialog over the page: Escape or a click outside closes it. Full screen on a phone. */
export function Modal({
  title,
  description,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  description?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const escape = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/40 sm:items-start sm:px-4 sm:pt-[8vh]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex max-h-full w-full flex-col overflow-hidden bg-bg shadow-2xl shadow-black/30 sm:max-h-[84vh] sm:rounded-xl sm:border sm:border-border ${
          wide ? "sm:max-w-[760px]" : "sm:max-w-[560px]"
        }`}
      >
        <div className="flex items-start gap-4 border-b border-border px-5 py-4">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
            {description && <p className="text-sm text-muted">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-subtle transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <CloseIcon width={18} height={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

/** 2px-underline tabs, as everywhere in the app. */
export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: [T, string][];
  active: T;
  onChange: (tab: T) => void;
}) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-border px-3">
      {tabs.map(([id, label]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={active === id}
          onClick={() => onChange(id)}
          className={`shrink-0 px-3 py-2.5 text-sm transition-colors ${
            active === id ? "font-medium text-fg shadow-[inset_0_-2px_0_var(--accent)]" : "text-muted hover:text-fg"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
