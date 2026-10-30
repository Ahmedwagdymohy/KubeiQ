"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { ChevronDownIcon } from "@/components/icons";
import { buildColumns, failing, type Column } from "@/components/manager/columns";
import { INVESTIGABLE } from "@/components/manager/kinds";
import { Spinner } from "@/components/ui";
import { useLiveList } from "@/hooks/use-live-list";
import { usePreference } from "@/hooks/use-preferences";
import { api, watchUrl, type KindInfo, type ResourceRow } from "@/lib/api";

const POLL_MS = 15_000;
const VIRTUAL_FROM = 150;
const OVERSCAN = 12;

type ColumnPrefs = Record<string, { hidden?: string[]; order?: string[] }>;
type Sort = { id: string; desc: boolean } | null;

export function ResourceTable({
  cluster,
  kind,
  namespace,
  selected,
  onSelect,
  onNamespace,
}: {
  cluster: string;
  kind: KindInfo;
  namespace: string | null;
  selected: { namespace: string | null; name: string } | null;
  onSelect: (sel: { namespace: string | null; name: string }) => void;
  onNamespace?: (ns: string) => void;
}) {
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<Sort>(null);
  const [compact, setCompact] = usePreference<boolean>("table.compact", false);
  const [prefs, setPrefs] = usePreference<ColumnPrefs>("columns", {});
  const kindId = `${kind.group || "core"}/${kind.resource}`;
  const queryKey = ["manager", "list", cluster, kind.group, kind.resource, namespace];
  const live = useLiveList(watchUrl(cluster, kind, namespace), queryKey);
  const list = useQuery({
    queryKey,
    queryFn: () => api.resources(cluster, kind, namespace),
    refetchInterval: live ? false : POLL_MS,
    placeholderData: keepPreviousData,
  });
  const clusters = useQuery({ queryKey: ["clusters"], queryFn: api.clusters });
  const settings = clusters.data?.find((c) => c.id === cluster)?.settings;
  const showNamespace = kind.namespaced && !namespace;

  const all = useMemo(
    () =>
      list.data
        ? buildColumns(kind, list.data, showNamespace, (ns) => onNamespace?.(ns), settings ? { cpu: settings.cpu, memory: settings.memory } : undefined)
        : [],
    [list.data, kind, showNamespace, onNamespace, settings],
  );
  const saved = prefs[kindId];
  const ordered = useMemo(() => {
    const order = saved?.order ?? [];
    return [...all].sort((a, b) => {
      const ia = order.indexOf(a.id);
      const ib = order.indexOf(b.id);
      return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
    });
  }, [all, saved]);
  const visibleColumns = ordered.filter((c) => (saved?.hidden ? !saved.hidden.includes(c.id) : !c.hidden));

  const q = filter.trim().toLowerCase();
  const total = list.data?.rows.length ?? 0;
  const rows = useMemo(() => {
    const found = (list.data?.rows ?? []).filter(
      (r) => !q || r.name.toLowerCase().includes(q) || (r.namespace ?? "").includes(q),
    );
    if (!sort) return found;
    const col = all.find((c) => c.id === sort.id);
    const value = (r: ResourceRow) => (sort.id === "Name" ? r.name : (col?.sort(r) ?? ""));
    return [...found].sort((a, b) => {
      const x = value(a);
      const y = value(b);
      const order = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true });
      return sort.desc ? -order : order;
    });
  }, [list.data, q, sort, all]);

  // Virtual rows: only what is on screen (plus a margin) is rendered on big lists.
  const scroller = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ top: 0, height: 800 });
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const resize = new ResizeObserver(() => setView((v) => ({ ...v, height: el.clientHeight })));
    resize.observe(el);
    return () => resize.disconnect();
  }, []);
  const rowHeight = compact ? 33 : 41;
  const virtual = rows.length > VIRTUAL_FROM;
  const first = virtual ? Math.max(0, Math.floor(view.top / rowHeight) - OVERSCAN) : 0;
  const last = virtual ? Math.min(rows.length, Math.ceil((view.top + view.height) / rowHeight) + OVERSCAN) : rows.length;
  const investigable = INVESTIGABLE.has(kind.kind) && kind.namespaced;

  const header = (id: string, label: string, title?: string, numeric?: boolean, first = false) => {
    const active = sort?.id === id;
    return (
      <th
        key={id}
        aria-sort={active ? (sort.desc ? "descending" : "ascending") : "none"}
        className={`whitespace-nowrap px-4 py-2 font-medium ${first ? "sm:px-5" : ""} ${numeric ? "text-right" : ""}`}
        title={title}
      >
        <button
          type="button"
          onClick={() => setSort(active ? (sort.desc ? null : { id, desc: true }) : { id, desc: false })}
          className={`inline-flex items-center gap-1 hover:text-fg ${active ? "text-fg" : ""}`}
        >
          {label}
          {active && <ChevronDownIcon width={12} height={12} className={sort.desc ? "" : "rotate-180"} />}
        </button>
      </th>
    );
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2.5 sm:px-5">
        <h2 className="font-semibold">{kind.label}</h2>
        {list.data && (
          <span className="text-sm tabular-nums text-subtle">{q ? `${rows.length} of ${total}` : total}</span>
        )}
        {live ? (
          <span className="flex items-center gap-1.5 text-xs text-muted" title="Updates as the cluster changes">
            <span className="h-1.5 w-1.5 rounded-full bg-healthy" />
            Live
          </span>
        ) : (
          list.isFetching && <Spinner />
        )}
        <div className="ml-auto flex items-center gap-2">
          <ColumnMenu
            columns={ordered}
            visible={visibleColumns.map((c) => c.id)}
            compact={compact}
            onCompact={setCompact}
            onChange={(hidden, order) => setPrefs({ ...prefs, [kindId]: { hidden, order } })}
            onReset={() => {
              const next = { ...prefs };
              delete next[kindId];
              setPrefs(next);
            }}
          />
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by name"
            aria-label="Filter by name"
            className="h-8 w-44 rounded-lg border border-control bg-bg px-2.5 text-sm outline-none transition-colors focus:border-accent sm:w-56"
          />
        </div>
      </div>
      <div ref={scroller} onScroll={(e) => virtual && setView({ top: e.currentTarget.scrollTop, height: e.currentTarget.clientHeight })} className="min-h-0 flex-1 overflow-auto">
        {list.error && <p className="p-6 text-sm text-danger">{list.error.message}</p>}
        {list.isPending && <p className="p-6 text-sm text-muted">Loading</p>}
        {list.data && rows.length === 0 && (
          <p className="p-6 text-sm text-muted">{q ? "Nothing matches" : `No ${kind.label.toLowerCase()} here`}</p>
        )}
        {list.data && rows.length > 0 && (
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-border bg-bg text-xs text-subtle">
              <tr>
                {header("Name", list.data.columns[0]?.name ?? "Name", list.data.columns[0]?.description, false, true)}
                {visibleColumns.map((c) => header(c.id, c.label, c.title, c.numeric))}
                {investigable && <th className="w-24 px-4 py-2"><span className="sr-only">Actions</span></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {virtual && first > 0 && <tr style={{ height: first * rowHeight }} aria-hidden="true" />}
              {rows.slice(first, last).map((row) => (
                <TableRow
                  key={`${row.namespace}/${row.name}`}
                  row={row}
                  columns={visibleColumns}
                  compact={compact}
                  active={selected?.name === row.name && selected.namespace === (row.namespace ?? null)}
                  onSelect={() => onSelect({ namespace: row.namespace, name: row.name })}
                  investigate={
                    investigable && row.namespace && failing(kind, row)
                      ? `/doctor?${new URLSearchParams({ cluster, namespace: row.namespace, focus: `${kind.kind}/${row.namespace}/${row.name}` })}`
                      : null
                  }
                  showActions={investigable}
                />
              ))}
              {virtual && last < rows.length && <tr style={{ height: (rows.length - last) * rowHeight }} aria-hidden="true" />}
            </tbody>
          </table>
        )}
        {list.data?.truncated && (
          <p className="px-6 py-3 text-xs text-subtle">
            Showing the first {list.data.rows.length}. Pick a namespace to narrow the list.
          </p>
        )}
      </div>
    </div>
  );
}

function TableRow({
  row,
  columns,
  compact,
  active,
  onSelect,
  investigate,
  showActions,
}: {
  row: ResourceRow;
  columns: Column[];
  compact: boolean;
  active: boolean;
  onSelect: () => void;
  investigate: string | null;
  showActions: boolean;
}) {
  const pad = compact ? "py-1.5" : "py-2.5";
  return (
    <tr onClick={onSelect} className={`group cursor-pointer transition-colors ${active ? "bg-surface-2" : "hover:bg-surface"}`}>
      <td className={`max-w-[360px] truncate px-4 ${pad} font-medium sm:px-5`} title={row.name}>
        {row.name}
      </td>
      {columns.map((c) => (
        <td key={c.id} className={`max-w-[280px] truncate px-4 ${pad} tabular-nums ${c.numeric ? "text-right" : ""}`}>
          {c.render(row)}
        </td>
      ))}
      {showActions && (
        <td className={`px-4 ${pad} text-right`}>
          {investigate && (
            <Link
              href={investigate}
              onClick={(e) => e.stopPropagation()}
              className="text-sm font-medium text-accent opacity-0 transition-opacity hover:underline focus-visible:opacity-100 group-hover:opacity-100"
            >
              Investigate
            </Link>
          )}
        </td>
      )}
    </tr>
  );
}

/** Show, hide and reorder columns (saved per user and kind), and compact rows. */
function ColumnMenu({
  columns,
  visible,
  compact,
  onCompact,
  onChange,
  onReset,
}: {
  columns: Column[];
  visible: string[];
  compact: boolean;
  onCompact: (v: boolean) => void;
  onChange: (hidden: string[], order: string[]) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  const ids = columns.map((c) => c.id);
  const hiddenOf = (show: string[]) => ids.filter((id) => !show.includes(id));
  const move = (id: string, by: number) => {
    const order = [...ids];
    const i = order.indexOf(id);
    const j = i + by;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    onChange(hiddenOf(visible), order);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="h-8 rounded-lg border border-control px-2.5 text-sm text-muted transition-colors hover:text-fg"
      >
        Columns
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 flex w-64 flex-col rounded-lg border border-border bg-bg p-1.5 text-sm shadow-lg shadow-black/10">
          <ul className="flex max-h-80 flex-col overflow-y-auto">
            {columns.map((c, i) => {
              const on = visible.includes(c.id);
              return (
                <li key={c.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-surface">
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      className="accent-[var(--accent)]"
                      checked={on}
                      onChange={() => onChange(hiddenOf(on ? visible.filter((v) => v !== c.id) : [...visible, c.id]), ids)}
                    />
                    <span className="truncate">{c.label}</span>
                  </label>
                  <button type="button" aria-label={`Move ${c.label} up`} disabled={i === 0} onClick={() => move(c.id, -1)} className="px-1 text-subtle hover:text-fg disabled:opacity-30">
                    ↑
                  </button>
                  <button type="button" aria-label={`Move ${c.label} down`} disabled={i === columns.length - 1} onClick={() => move(c.id, 1)} className="px-1 text-subtle hover:text-fg disabled:opacity-30">
                    ↓
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-1 flex items-center justify-between border-t border-border px-2 pt-2">
            <label className="flex cursor-pointer items-center gap-2 text-muted">
              <input type="checkbox" className="accent-[var(--accent)]" checked={compact} onChange={(e) => onCompact(e.target.checked)} />
              Compact rows
            </label>
            <button type="button" onClick={onReset} className="text-xs text-subtle hover:text-fg">
              Reset
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
