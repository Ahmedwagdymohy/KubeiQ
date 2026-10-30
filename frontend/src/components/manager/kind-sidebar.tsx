"use client";

import { useState } from "react";

import { ChevronDownIcon, ChevronIcon, PinIcon } from "@/components/icons";
import { KindIcon } from "@/components/manager/kind-icons";
import { kindKey } from "@/components/manager/kinds";
import { usePreference } from "@/hooks/use-preferences";
import type { KindCategory } from "@/lib/api";
import { MAX_PINS, resourceHref } from "@/lib/navigation";

const COLLAPSED = new Set(["Other"]);

export function KindSidebar({
  categories,
  loading,
  error,
  activeKey,
  allNamespaces,
  onSelect,
}: {
  categories: KindCategory[];
  loading: boolean;
  error?: string;
  activeKey: string;
  allNamespaces: boolean;
  onSelect: (key: string) => void;
}) {
  const [filter, setFilter] = useState("");
  const [closed, setClosed] = useState<Set<string>>(COLLAPSED);
  const [pins, setPins] = usePreference<string[]>("pinned", []);
  const [notice, setNotice] = useState<string | null>(null);
  // Pin a kind to the top of the app sidebar (the same pins as products there).
  const togglePin = (href: string) => {
    if (pins.includes(href)) setPins(pins.filter((p) => p !== href));
    else if (pins.length >= MAX_PINS) {
      setNotice(`Pin up to ${MAX_PINS} items. Unpin one first`);
      setTimeout(() => setNotice(null), 3000);
    } else setPins([...pins, href]);
  };
  const q = filter.trim().toLowerCase();

  const toggle = (name: string) => {
    const next = new Set(closed);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setClosed(next);
  };

  return (
    <nav className="hidden w-60 shrink-0 flex-col overflow-y-auto border-r border-border md:flex">
      <div className="sticky top-0 border-b border-border bg-bg p-3">
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Find a kind"
          aria-label="Find a kind"
          className="h-8 w-full rounded-lg border border-control bg-bg px-2.5 text-sm outline-none transition-colors focus:border-accent"
        />
      </div>
      {notice && <p role="status" className="mx-3 mt-2 rounded-lg bg-surface px-3 py-2 text-xs text-muted">{notice}</p>}
      {loading && <p className="p-4 text-sm text-muted">Loading kinds</p>}
      {error && <p className="p-4 text-sm text-danger">{error}</p>}
      <div className="flex flex-col py-2">
        {categories.map((category) => {
          // Users limited to some namespaces cannot list cluster-wide kinds.
          const kinds = category.kinds.filter(
            (k) =>
              (allNamespaces || k.namespaced) &&
              (!q || k.label.toLowerCase().includes(q) || k.kind.toLowerCase().includes(q)),
          );
          if (kinds.length === 0) return null;
          const open = Boolean(q) || !closed.has(category.name);
          return (
            <div key={category.name} className="flex flex-col">
              <button
                type="button"
                onClick={() => toggle(category.name)}
                className="flex items-center justify-between gap-1.5 px-4 pb-1.5 pt-3 text-left text-xs font-semibold text-subtle transition-colors hover:text-fg"
              >
                {category.name}
                {open ? (
                  <ChevronDownIcon width={14} height={14} />
                ) : (
                  <ChevronIcon width={14} height={14} />
                )}
              </button>
              {open &&
                kinds.map((k) => {
                  const key = kindKey(k);
                  const active = key === activeKey;
                  const href = resourceHref(key);
                  const pinned = pins.includes(href);
                  return (
                    <div key={key} className="group relative mx-2">
                      <button
                        type="button"
                        onClick={() => onSelect(key)}
                        title={k.group ? `${k.kind} (${k.group})` : k.kind}
                        className={`flex w-full items-center gap-2.5 rounded-lg py-1.5 pl-4 pr-8 text-left text-sm transition-colors ${
                          active
                            ? "bg-surface-2 font-semibold text-fg"
                            : "font-medium text-muted hover:bg-surface hover:text-fg"
                        }`}
                      >
                        <KindIcon
                          resource={k.resource}
                          className={`shrink-0 ${active ? "text-accent" : "text-subtle"}`}
                        />
                        <span className="truncate">{k.label}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => togglePin(href)}
                        aria-label={pinned ? `Unpin ${k.label}` : `Pin ${k.label} to the sidebar`}
                        title={pinned ? "Unpin" : "Pin to the sidebar"}
                        className={`absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md opacity-0 transition-opacity hover:bg-bg focus-visible:opacity-100 group-hover:opacity-100 ${
                          pinned ? "text-accent" : "text-subtle"
                        }`}
                      >
                        <PinIcon width={13} height={13} />
                      </button>
                    </div>
                  );
                })}
            </div>
          );
        })}
      </div>
    </nav>
  );
}
