"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Spinner } from "@/components/ui";
import { api, type KindInfo } from "@/lib/api";

const REFRESH_MS = 15_000;
/** Columns of figures (ready counts, restarts, ages) line up on the right. The Table API calls
 * most of them strings, so the values decide. */
function figureColumns(rows: { cells: unknown[] }[], count: number): boolean[] {
  return Array.from({ length: count }, (_, i) => {
    const values = rows
      .map((r) => r.cells[i])
      .filter((v) => v !== null && v !== undefined && v !== "");
    return values.length > 0 && values.every((v) => /^\d/.test(String(v)));
  });
}

const BAD = /(Error|BackOff|Failed|Pending|Unknown|NotReady|Evicted|OOMKilled|Terminating)/;

export function ResourceTable({
  cluster,
  kind,
  namespace,
  selected,
  onSelect,
}: {
  cluster: string;
  kind: KindInfo;
  namespace: string | null;
  selected: { namespace: string | null; name: string } | null;
  onSelect: (sel: { namespace: string | null; name: string }) => void;
}) {
  const [filter, setFilter] = useState("");
  const list = useQuery({
    queryKey: ["manager", "list", cluster, kind.group, kind.resource, namespace],
    queryFn: () => api.resources(cluster, kind, namespace),
    refetchInterval: REFRESH_MS,
    placeholderData: keepPreviousData,
  });
  const showNamespace = kind.namespaced && !namespace;
  const q = filter.trim().toLowerCase();
  const figures = figureColumns(list.data?.rows ?? [], list.data?.columns.length ?? 0);
  const align = (i: number) => (figures[i] ? "text-right" : "");
  const rows = (list.data?.rows ?? []).filter(
    (r) => !q || r.name.toLowerCase().includes(q) || (r.namespace ?? "").includes(q),
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border px-6 py-3">
        <h1 className="font-semibold">{kind.label}</h1>
        {list.data && <span className="text-sm text-subtle">{rows.length}</span>}
        {list.isFetching && <Spinner />}
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by name"
          aria-label="Filter by name"
          className="ml-auto w-56 rounded-md border border-control bg-bg px-3 py-1.5 text-sm outline-none focus:border-accent"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {list.error && <p className="p-6 text-sm text-danger">{list.error.message}</p>}
        {list.isPending && <p className="p-6 text-sm text-muted">Loading</p>}
        {list.data && rows.length === 0 && (
          <p className="p-6 text-sm text-muted">
            {q ? "Nothing matches" : `No ${kind.label.toLowerCase()} here`}
          </p>
        )}
        {list.data && rows.length > 0 && (
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 border-b border-border bg-bg text-xs text-muted">
              <tr>
                {list.data.columns.slice(0, 1).map((c) => (
                  <th key={c.name} className="px-6 py-2 font-normal" title={c.description}>
                    {c.name}
                  </th>
                ))}
                {showNamespace && <th className="px-4 py-2 font-normal">Namespace</th>}
                {list.data.columns.slice(1).map((c, i) => (
                  <th
                    key={c.name}
                    className={`px-4 py-2 font-normal ${align(i + 1)}`}
                    title={c.description}
                  >
                    {c.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => {
                const active =
                  selected?.name === row.name && selected.namespace === (row.namespace ?? null);
                return (
                  <tr
                    key={`${row.namespace}/${row.name}`}
                    onClick={() => onSelect({ namespace: row.namespace, name: row.name })}
                    className={`cursor-pointer transition-colors ${
                      active
                        ? "bg-surface-2 shadow-[inset_1px_0_0_var(--accent)]"
                        : "hover:bg-surface"
                    }`}
                  >
                    <td className="max-w-[360px] truncate px-6 py-2.5 font-medium">{row.name}</td>
                    {showNamespace && <td className="px-4 py-2.5 text-muted">{row.namespace}</td>}
                    {row.cells.slice(1).map((cell, i) => {
                      const text = cell === null || cell === undefined ? "" : String(cell);
                      return (
                        <td
                          key={i}
                          className={`max-w-[280px] truncate px-4 py-2.5 ${align(i + 1)} ${BAD.test(text) ? "text-danger" : "text-muted"}`}
                          title={text}
                        >
                          {text}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
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
