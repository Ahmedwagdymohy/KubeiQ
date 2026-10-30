"use client";

import type { ReactNode } from "react";

import { age } from "@/components/manager/kinds";
import type { KindInfo, ResourceList, ResourceRow, RowExtra, Thresholds } from "@/lib/api";
import { bytes, cores, DEFAULT_THRESHOLDS, USAGE_BAR, usageTone } from "@/lib/usage";

export type Column = {
  id: string;
  label: string;
  title?: string;
  numeric?: boolean;
  render: (row: ResourceRow) => ReactNode;
  sort: (row: ResourceRow) => string | number;
  /** Shown when nothing is saved for this kind. */
  hidden?: boolean;
};

const BAD = /(Error|BackOff|Failed|Pending|Unknown|NotReady|Evicted|OOMKilled|Terminating)/;
const TONE: Record<NonNullable<RowExtra["tone"]>, string> = {
  ok: "text-healthy bg-healthy/10",
  warning: "text-warning bg-warning/10",
  bad: "text-danger bg-danger/10",
  done: "text-muted bg-surface-2",
};

export function StatusPill({ text, tone }: { text: string; tone: NonNullable<RowExtra["tone"]> }) {
  return (
    <span className={`inline-flex h-5 max-w-full items-center truncate rounded-full px-2 text-xs font-medium ${TONE[tone]}`} title={text}>
      {text}
    </span>
  );
}

function ContainerDots({ extra }: { extra: RowExtra }) {
  return (
    <span className="flex items-center gap-1">
      {(extra.containers ?? []).map((c) => {
        const color =
          c.state === "running" && c.ready
            ? "bg-healthy"
            : c.state === "terminated" && c.reason === "Completed"
              ? "bg-subtle"
              : c.state === "waiting" && !c.reason
                ? "bg-warning"
                : c.state === "running"
                  ? "bg-warning"
                  : "bg-danger";
        return (
          <span
            key={c.name}
            className={`h-2.5 w-2.5 rounded-[3px] ${color}`}
            title={`${c.name}: ${c.reason ?? c.state}${c.ready ? ", ready" : ""} · ${c.restarts} restarts`}
          />
        );
      })}
    </span>
  );
}

function Usage({ used, capacity, text, t }: { used: number | null | undefined; capacity: number | null | undefined; text: (n: number) => string; t: Thresholds }) {
  if (used === null || used === undefined) return <span className="text-subtle">-</span>;
  if (!capacity) return <span className="tabular-nums text-muted" title="No limit set">{text(used)}</span>;
  const value = (100 * used) / capacity;
  return (
    <span className="flex items-center gap-2" title={`${text(used)} of ${text(capacity)}`}>
      <span className="h-1.5 w-12 shrink-0 overflow-hidden rounded-full bg-surface-2">
        <span className={`block h-full rounded-full ${USAGE_BAR[usageTone(value, t)]}`} style={{ width: `${Math.min(100, value)}%` }} />
      </span>
      <span className="tabular-nums text-muted">{text(used)}</span>
    </span>
  );
}

const restartsClass = (n: number) => (n > 10 ? "font-semibold text-danger" : n > 0 ? "text-warning" : "text-muted");

/**
 * The columns of a list: the server's own (Table API), with richer cells and extra columns for
 * pods, workloads and nodes. Age sorts by creation time, counts as numbers.
 */
export function buildColumns(
  kind: KindInfo,
  list: ResourceList,
  showNamespace: boolean,
  onNamespace: (ns: string) => void,
  thresholds: { cpu: Thresholds; memory: Thresholds } = { cpu: DEFAULT_THRESHOLDS, memory: DEFAULT_THRESHOLDS },
): Column[] {
  const key = `${kind.group}/${kind.resource}`;
  const rows = list.rows;
  const numericAt = (i: number) => {
    const c = list.columns[i];
    if (c.type === "integer" || c.type === "number") return true;
    const cells = rows.map((r) => r.cells[i]).filter((v) => v !== null && v !== "");
    return cells.length > 0 && cells.every((v) => typeof v === "number" || /^\d+(\/\d+)?$/.test(String(v)));
  };
  const server: Column[] = list.columns.slice(1).map((c, j) => {
    const i = j + 1;
    const numeric = numericAt(i);
    if (c.name === "Age")
      return {
        id: "Age",
        label: "Age",
        title: c.description,
        numeric: true,
        render: (r) => <span className="text-muted">{age(r.created)}</span>,
        sort: (r) => -(r.created ? new Date(r.created).getTime() : 0),
      };
    return {
      id: c.name,
      label: c.name,
      title: c.description,
      numeric,
      render: (r) => {
        const v = r.cells[i];
        const text = v === null || v === undefined ? "" : String(v);
        return <span className={BAD.test(text) ? "text-danger" : "text-muted"} title={text}>{text}</span>;
      },
      sort: (r) => {
        const v = r.cells[i];
        if (typeof v === "number") return v;
        const text = String(v ?? "");
        return numeric ? Number(text.split("/")[0]) || 0 : text;
      },
    };
  });

  const ns: Column[] = showNamespace
    ? [
        {
          id: "Namespace",
          label: "Namespace",
          render: (r) =>
            r.namespace ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onNamespace(r.namespace!);
                }}
                title={`Show only ${r.namespace}`}
                className="rounded px-1.5 py-0.5 text-left text-muted hover:bg-surface-2 hover:text-fg"
              >
                {r.namespace}
              </button>
            ) : null,
          sort: (r) => r.namespace ?? "",
        },
      ]
    : [];

  const replace = (cols: Column[], id: string, col: Partial<Column>) =>
    cols.map((c) => (c.id === id ? { ...c, ...col } : c));

  if (key === "/pods") {
    let cols = replace(server, "Status", {
      render: (r) => (r.extra?.status ? <StatusPill text={r.extra.status} tone={r.extra.tone ?? "warning"} /> : null),
      sort: (r) => `${r.extra?.tone === "bad" ? 0 : r.extra?.tone === "warning" ? 1 : 2}${r.extra?.status ?? ""}`,
    });
    cols = replace(cols, "Restarts", {
      numeric: true,
      render: (r) => <span className={`tabular-nums ${restartsClass(r.extra?.restarts ?? 0)}`}>{r.extra?.restarts ?? 0}</span>,
      sort: (r) => r.extra?.restarts ?? 0,
    });
    const extra: Column[] = [
      { id: "Containers", label: "Containers", render: (r) => (r.extra ? <ContainerDots extra={r.extra} /> : null), sort: (r) => r.extra?.containers?.filter((c) => c.ready).length ?? 0 },
      {
        id: "CPU",
        label: "CPU",
        render: (r) => <Usage used={r.extra?.cpu} capacity={r.extra?.cpu_limit} text={cores} t={thresholds.cpu} />,
        sort: (r) => r.extra?.cpu ?? -1,
      },
      {
        id: "Memory",
        label: "Memory",
        render: (r) => <Usage used={r.extra?.memory} capacity={r.extra?.memory_limit} text={bytes} t={thresholds.memory} />,
        sort: (r) => r.extra?.memory ?? -1,
      },
      { id: "Node", label: "Node", render: (r) => <span className="text-muted">{r.extra?.node ?? ""}</span>, sort: (r) => r.extra?.node ?? "" },
      { id: "IP", label: "IP", render: (r) => <span className="font-mono text-xs text-muted">{r.extra?.ip ?? ""}</span>, sort: (r) => r.extra?.ip ?? "", hidden: true },
    ];
    const at = cols.findIndex((c) => c.id === "Age");
    return [...ns, ...cols.slice(0, at), ...extra, ...cols.slice(at)];
  }
  if (key === "apps/deployments" || key === "apps/statefulsets" || key === "apps/daemonsets") {
    const extra: Column[] = [
      { id: "Strategy", label: "Strategy", render: (r) => <span className="text-muted">{r.extra?.strategy ?? ""}</span>, sort: (r) => r.extra?.strategy ?? "", hidden: true },
      {
        id: "Images",
        label: "Images",
        render: (r) => <span className="font-mono text-xs text-muted" title={(r.extra?.images ?? []).join("\n")}>{(r.extra?.images ?? []).join(", ")}</span>,
        sort: (r) => (r.extra?.images ?? []).join(","),
      },
    ];
    const at = server.findIndex((c) => c.id === "Age");
    return [...ns, ...server.slice(0, at), ...extra, ...server.slice(at)];
  }
  if (key === "/nodes") {
    const cols = replace(server, "Status", {
      render: (r) => <StatusPill text={String(r.cells[list.columns.findIndex((c) => c.name === "Status")] ?? "")} tone={r.extra?.tone ?? "warning"} />,
    });
    const extra: Column[] = [
      {
        id: "CPU",
        label: "CPU",
        render: (r) => <Usage used={r.extra?.cpu} capacity={r.extra?.cpu_capacity} text={cores} t={thresholds.cpu} />,
        sort: (r) => (r.extra?.cpu ?? -1) / (r.extra?.cpu_capacity || 1),
      },
      {
        id: "Memory",
        label: "Memory",
        render: (r) => <Usage used={r.extra?.memory} capacity={r.extra?.memory_capacity} text={bytes} t={thresholds.memory} />,
        sort: (r) => (r.extra?.memory ?? -1) / (r.extra?.memory_capacity || 1),
      },
      {
        id: "Pods",
        label: "Pods",
        numeric: true,
        render: (r) => <span className="tabular-nums text-muted">{r.extra ? `${r.extra.pods} / ${r.extra.pods_capacity}` : ""}</span>,
        sort: (r) => r.extra?.pods ?? 0,
      },
      {
        id: "Taints",
        label: "Taints",
        render: (r) => <span className="text-xs text-muted" title={(r.extra?.taints ?? []).join("\n")}>{r.extra?.taints?.length ? (r.extra.taints.length === 1 ? r.extra.taints[0] : `${r.extra.taints.length} taints`) : ""}</span>,
        sort: (r) => r.extra?.taints?.length ?? 0,
      },
    ];
    const at = cols.findIndex((c) => c.id === "Age");
    return [...cols.slice(0, at), ...extra, ...cols.slice(at)];
  }
  return [...ns, ...server];
}

/** Whether a row shows a problem worth an Investigate action. */
export function failing(kind: KindInfo, row: ResourceRow): boolean {
  if (row.extra?.tone) return row.extra.tone === "bad" || row.extra.tone === "warning";
  return row.cells.some((v) => BAD.test(String(v ?? "")));
}
