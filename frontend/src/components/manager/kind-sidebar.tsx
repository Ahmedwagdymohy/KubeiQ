"use client";

import { useState } from "react";

import { ChevronDownIcon, ChevronIcon } from "@/components/icons";
import { kindKey } from "@/components/manager/kinds";
import type { KindCategory } from "@/lib/api";

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
          className="w-full rounded-md border border-control bg-bg px-3 py-1.5 text-sm outline-none focus:border-accent"
        />
      </div>
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
                className="flex items-center gap-1.5 px-4 py-2 text-left text-sm font-medium text-muted transition-colors hover:text-fg"
              >
                {open ? (
                  <ChevronDownIcon width={14} height={14} />
                ) : (
                  <ChevronIcon width={14} height={14} />
                )}
                {category.name}
              </button>
              {open &&
                kinds.map((k) => {
                  const key = kindKey(k);
                  const active = key === activeKey;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => onSelect(key)}
                      title={k.group ? `${k.kind} (${k.group})` : k.kind}
                      className={`truncate py-1.5 pl-10 pr-4 text-left text-sm transition-colors ${
                        active
                          ? "text-fg shadow-[inset_1px_0_0_var(--accent)]"
                          : "text-muted hover:bg-surface hover:text-fg"
                      }`}
                    >
                      {k.label}
                    </button>
                  );
                })}
            </div>
          );
        })}
      </div>
    </nav>
  );
}
