"use client";

import Link from "next/link";

import { CloseIcon } from "@/components/icons";
import { KubeIcon, kindLabel } from "@/components/map/kube-icon";
import { Dot } from "@/components/ui";
import type { ClusterMap, MapNode } from "@/lib/api";

const STATUS = {
  healthy: { tone: "healthy", label: "Healthy" },
  warning: { tone: "warning", label: "Needs attention" },
  error: { tone: "critical", label: "Broken" },
} as const;

export function DetailsPanel({
  node,
  map,
  onSelect,
  onClose,
}: {
  node: MapNode;
  map: ClusterMap;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const byId = new Map(map.nodes.map((n) => [n.id, n]));
  const related = map.edges
    .filter((e) => e.source === node.id || e.target === node.id)
    .map((e) => byId.get(e.source === node.id ? e.target : e.source))
    .filter((n): n is MapNode => Boolean(n));
  const status = STATUS[node.status];
  const investigate =
    node.investigate &&
    `/doctor?cluster=${encodeURIComponent(map.cluster_id)}` +
      `&namespace=${encodeURIComponent(node.namespace ?? "")}` +
      `&focus=${encodeURIComponent(node.investigate)}`;

  return (
    <aside className="flex h-full w-full flex-col overflow-y-auto border-l border-border bg-bg">
      <div className="flex items-start gap-3 border-b border-border p-5">
        <KubeIcon
          kind={node.kind}
          size={36}
          className={node.status === "healthy" ? "text-accent" : node.status === "error" ? "text-danger" : "text-warning"}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 className="break-words font-semibold">{node.name}</h2>
          <p className="text-sm text-subtle">
            {kindLabel(node.kind)}
            {node.namespace ? ` in ${node.namespace}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close details"
          className="rounded p-1 text-subtle transition-colors hover:bg-surface-2 hover:text-fg"
        >
          <CloseIcon width={18} height={18} />
        </button>
      </div>

      <div className="flex flex-col gap-6 p-5">
        <div className="flex flex-col gap-3">
          <span className="flex items-center gap-2 text-sm text-muted">
            <Dot tone={status.tone} /> {status.label}
          </span>
          {node.reason && <p className="font-medium text-fg">{node.reason}</p>}
          {investigate && (
            <Link
              href={investigate}
              className="mt-1 rounded-md bg-primary px-4 py-2.5 text-center text-sm font-semibold text-primary-ink transition-opacity hover:opacity-85"
            >
              Investigate with Cluster Doctor
            </Link>
          )}
          {investigate && (
            <p className="text-xs text-subtle">Get the root cause and the exact commands to fix it</p>
          )}
        </div>

        {Object.keys(node.facts).length > 0 && (
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2 text-sm">
            {Object.entries(node.facts).map(([key, value]) => (
              <div key={key} className="contents">
                <dt className="text-subtle">{key}</dt>
                <dd className="break-words text-fg">{value}</dd>
              </div>
            ))}
          </dl>
        )}

        {related.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-muted">Connected</p>
            <ul className="flex flex-col">
              {related.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(r.id)}
                    className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-surface"
                  >
                    <Dot tone={STATUS[r.status].tone} />
                    <span className="min-w-0 flex-1 truncate">{r.name}</span>
                    <span className="text-xs text-subtle">{kindLabel(r.kind)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {Object.keys(node.labels).length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-muted">Labels</p>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(node.labels)
                .filter(([k]) => k !== "pod-template-hash")
                .map(([k, v]) => (
                  <code key={k} className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-muted">
                    {k}={v}
                  </code>
                ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
