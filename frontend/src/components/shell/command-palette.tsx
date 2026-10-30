"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import {
  ActivityIcon,
  OverviewIcon,
  SearchIcon,
  SettingsIcon,
  SidebarIcon,
  SparkleIcon,
  StethoscopeIcon,
  SunIcon,
} from "@/components/icons";
import { KindIcon } from "@/components/manager/kind-icons";
import { INVESTIGABLE } from "@/components/manager/kinds";
import { openAssistant } from "@/components/assistant/assistant-panel";
import { useScopedClusters } from "@/components/shell/status-bar";
import { toggleTheme } from "@/components/theme-toggle";
import { useMe } from "@/hooks/use-me";
import { api, type SearchHit } from "@/lib/api";
import { clusterTone, TONE_DOT } from "@/lib/clusters";
import { RESOURCE_GROUPS, resourceHref } from "@/lib/navigation";
import { PRODUCTS } from "@/lib/products";
import { setClusterScope } from "@/lib/scope";
import { settingsAreas } from "@/lib/settings-nav";

export const PALETTE_EVENT = "kubeiq:palette";
export const openPalette = () => window.dispatchEvent(new Event(PALETTE_EVENT));

type Group = "Recent" | "Objects" | "Pages" | "Resources" | "Settings" | "Actions";
type Command = {
  id: string;
  group: Group;
  label: string;
  sub?: string;
  icon: ReactNode;
  keywords?: string;
  href?: string;
  /** For objects: open Cluster Doctor on it (Shift+Enter). */
  investigate?: string;
  run?: () => void;
};
type Recent = { id: string; label: string; sub?: string; href: string; icon: string };

const RECENT_KEY = "kubeiq-recent";
const ORDER: Group[] = ["Recent", "Objects", "Pages", "Resources", "Settings", "Actions"];

function readRecent(): Recent[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as Recent[];
  } catch {
    return [];
  }
}

function remember(c: Command, icon: string) {
  if (!c.href) return;
  const next = [{ id: c.id, label: c.label, sub: c.sub, href: c.href, icon }, ...readRecent().filter((r) => r.id !== c.id)];
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next.slice(0, 6)));
  } catch {
    // storage unavailable; recents are a convenience
  }
}

function score(c: Command, q: string): number {
  const label = c.label.toLowerCase();
  if (label.startsWith(q)) return 0;
  if (label.split(/[\s/-]+/).some((w) => w.startsWith(q))) return 1;
  if (label.includes(q)) return 2;
  if ((c.keywords ?? "").toLowerCase().includes(q) || (c.sub ?? "").toLowerCase().includes(q)) return 3;
  return -1;
}

const kindKeyOf = (h: SearchHit) => `${h.group || "core"}/${h.version}/${h.resource}`;

/**
 * Cmd/Ctrl+K: jump to pages and settings, find objects by name in the cluster in scope and open
 * them, and run actions (switch cluster, investigate, theme). Recent picks come first.
 */
export function CommandPalette({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((v) => !v);
      }
    };
    const show = () => setOpen(true);
    window.addEventListener("keydown", key);
    window.addEventListener(PALETTE_EVENT, show);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener(PALETTE_EVENT, show);
    };
  }, []);

  if (!open) return null;
  return <Palette onClose={() => setOpen(false)} onToggleSidebar={onToggleSidebar} />;
}

function Palette({ onClose, onToggleSidebar }: { onClose: () => void; onToggleSidebar: () => void }) {
  const router = useRouter();
  const admin = useMe().data?.role === "admin";
  const { current, ordered } = useScopedClusters();
  const [text, setText] = useState("");
  const [index, setIndex] = useState(0);
  const [debounced, setDebounced] = useState("");
  const listRef = useRef<HTMLUListElement>(null);
  const q = text.trim().toLowerCase();

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(text.trim()), 200);
    return () => clearTimeout(timer);
  }, [text]);

  const objects = useQuery({
    queryKey: ["search", current?.id, debounced],
    queryFn: ({ signal }) => api.search(current!.id, debounced, signal),
    enabled: Boolean(current) && debounced.length >= 2,
    staleTime: 20_000,
  });

  const base = useMemo<Command[]>(() => {
    const pages: Command[] = [
      { id: "page:/", group: "Pages", label: "Overview", icon: <OverviewIcon />, href: "/" },
      ...PRODUCTS.map((p) => ({
        id: `page:${p.href}`,
        group: "Pages" as const,
        label: p.name,
        sub: p.description,
        icon: <p.icon />,
        href: p.href,
      })),
    ];
    const kinds: Command[] = RESOURCE_GROUPS.flatMap((g) =>
      g.items.map((i) => ({
        id: `kind:${i.kind}`,
        group: "Resources" as const,
        label: i.label,
        sub: g.name,
        icon: <KindIcon resource={i.resource} />,
        href: resourceHref(i.kind),
      })),
    );
    const settings: Command[] = settingsAreas(admin).map((a) => ({
      id: `settings:${a.id}`,
      group: "Settings" as const,
      label: a.label,
      sub: "Settings",
      keywords: "settings",
      icon: a.id === "activity" ? <ActivityIcon /> : <SettingsIcon />,
      href: `/settings#${a.id}`,
    }));
    const actions: Command[] = [
      ...ordered
        .filter((c) => c.id !== current?.id)
        .map((c) => ({
          id: `switch:${c.id}`,
          group: "Actions" as const,
          label: `Switch to ${c.name}`,
          keywords: "cluster switch",
          icon: <span className={`m-[5px] h-1.5 w-1.5 rounded-full ${TONE_DOT[clusterTone(c)]}`} />,
          run: () => setClusterScope(c.id),
        })),
      ...(current
        ? [
            {
              id: "investigate-cluster",
              group: "Actions" as const,
              label: `Investigate ${current.name}`,
              keywords: "doctor scan diagnose",
              icon: <StethoscopeIcon />,
              href: `/doctor?cluster=${encodeURIComponent(current.id)}`,
            },
          ]
        : []),
      { id: "assistant", group: "Actions", label: "Ask the assistant", keywords: "ai chat question explain", icon: <SparkleIcon />, run: () => openAssistant() },
      { id: "theme", group: "Actions", label: "Toggle light and dark", keywords: "theme dark light mode", icon: <SunIcon />, run: toggleTheme },
      { id: "sidebar", group: "Actions", label: "Collapse or expand the sidebar", keywords: "sidebar rail menu", icon: <SidebarIcon />, run: onToggleSidebar },
    ];
    return [...pages, ...kinds, ...settings, ...actions];
  }, [admin, current, ordered, onToggleSidebar]);

  const commands = useMemo<Command[]>(() => {
    if (!q) {
      const recent: Command[] = readRecent().map((r) => ({
        id: r.id,
        group: "Recent",
        label: r.label,
        sub: r.sub,
        href: r.href,
        icon: r.icon.startsWith("kind:") ? <KindIcon resource={r.icon.slice(5)} /> : <SearchIcon />,
      }));
      const seen = new Set(recent.map((r) => r.id));
      return [...recent, ...base.filter((c) => c.group === "Pages" && !seen.has(c.id))];
    }
    const found: Command[] = (objects.data ?? []).map((h) => {
      const params = new URLSearchParams({ cluster: current?.id ?? "", kind: kindKeyOf(h), name: h.name });
      if (h.namespace) {
        params.set("in", h.namespace);
        params.set("namespace", h.namespace);
      }
      return {
        id: `obj:${kindKeyOf(h)}/${h.namespace ?? ""}/${h.name}`,
        group: "Objects",
        label: h.name,
        sub: h.namespace ? `${h.kind} in ${h.namespace}` : h.kind,
        icon: <KindIcon resource={h.resource} />,
        href: `/manager?${params.toString()}`,
        investigate:
          INVESTIGABLE.has(h.kind) && h.namespace
            ? `/doctor?${new URLSearchParams({ cluster: current?.id ?? "", namespace: h.namespace, focus: `${h.kind}/${h.namespace}/${h.name}` })}`
            : undefined,
      };
    });
    const matched = base
      .map((c) => ({ c, s: score(c, q) }))
      .filter((m) => m.s >= 0)
      .sort((a, b) => a.s - b.s)
      .map((m) => m.c);
    return [...found, ...matched].sort((a, b) => ORDER.indexOf(a.group) - ORDER.indexOf(b.group));
  }, [q, base, objects.data, current]);

  const active = Math.min(index, Math.max(0, commands.length - 1));

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const choose = (c: Command, investigate = false) => {
    onClose();
    const icon = c.id.startsWith("obj:") || c.id.startsWith("kind:") ? `kind:${c.id.startsWith("obj:") ? c.id.split("/")[2] : c.href?.split("/").pop()}` : "page";
    if (investigate && c.investigate) {
      router.push(c.investigate);
      return;
    }
    remember(c, icon);
    if (c.run) c.run();
    else if (c.href) router.push(c.href);
  };

  const onKey = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") onClose();
    else if (event.key === "ArrowDown") {
      event.preventDefault();
      setIndex((active + 1) % Math.max(1, commands.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setIndex((active - 1 + commands.length) % Math.max(1, commands.length));
    } else if (event.key === "Enter" && commands[active]) {
      event.preventDefault();
      choose(commands[active], event.shiftKey);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex justify-center bg-black/30 px-3 pt-[12vh]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onMouseDown={(e) => e.stopPropagation()}
        className="flex h-fit max-h-[70vh] w-full max-w-[640px] flex-col overflow-hidden rounded-xl border border-border bg-bg shadow-2xl shadow-black/20"
      >
        <div className="flex items-center gap-3 border-b border-border px-4">
          <SearchIcon className="shrink-0 text-subtle" />
          <input
            autoFocus
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setIndex(0);
            }}
            onKeyDown={onKey}
            placeholder={current ? `Search pages, settings and objects in ${current.name}` : "Search pages and settings"}
            aria-label="Search"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={commands[active] ? `palette-${active}` : undefined}
            className="h-12 min-w-0 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-subtle"
          />
          {objects.isFetching && <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />}
        </div>
        <ul id="palette-list" ref={listRef} role="listbox" className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {commands.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-muted">
              {q.length >= 2 && objects.isFetching ? "Searching" : "Nothing matches"}
            </li>
          )}
          {commands.map((c, i) => {
            const header = i === 0 || commands[i - 1].group !== c.group ? c.group : null;
            return (
              <li key={c.id} role="presentation">
                {header && <p className="px-2.5 pb-1 pt-2.5 text-xs font-medium text-subtle">{header}</p>}
                <div
                  id={`palette-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={i === active}
                  onMouseMove={() => setIndex(i)}
                  onClick={() => choose(c)}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-sm ${
                    i === active ? "bg-surface-2" : ""
                  }`}
                >
                  <span className="shrink-0 text-subtle">{c.icon}</span>
                  <span className="min-w-0 flex-1 truncate">
                    <span className={c.group === "Objects" ? "font-mono text-[13px]" : ""}>{c.label}</span>
                    {c.sub && <span className="ml-2 text-xs text-subtle">{c.sub}</span>}
                  </span>
                  {c.investigate && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        choose(c, true);
                      }}
                      className="shrink-0 rounded-md px-2 py-0.5 text-xs font-medium text-accent hover:bg-bg"
                    >
                      Investigate
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border px-4 py-2 text-xs text-subtle">
          <span>
            <kbd className="font-sans">↑↓</kbd> to move
          </span>
          <span>
            <kbd className="font-sans">Enter</kbd> to open
          </span>
          <span>
            <kbd className="font-sans">Shift Enter</kbd> to investigate
          </span>
          <span>
            <kbd className="font-sans">Esc</kbd> to close
          </span>
        </div>
      </div>
    </div>
  );
}
