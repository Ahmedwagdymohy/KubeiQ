"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { CloseIcon } from "@/components/icons";
import { INVESTIGABLE, ON_MAP, SELECTS_PODS } from "@/components/manager/kinds";
import { ObjectActions } from "@/components/manager/object-actions";
import { ObjectEvents } from "@/components/manager/object-events";
import { ObjectOverview } from "@/components/manager/object-overview";
import { PodFiles } from "@/components/manager/pod-files";
import { PodLogsView, WorkloadLogs } from "@/components/manager/pod-logs";
import { PodTerminal } from "@/components/manager/pod-terminal";
import { YamlPanel } from "@/components/manager/yaml-panel";
import { useCanEdit } from "@/hooks/use-can-edit";
import { api, type KindInfo } from "@/lib/api";

type Tab = "overview" | "yaml" | "events" | "logs" | "terminal" | "files";

export function ObjectPanel({
  cluster,
  kind,
  namespace,
  name,
  onClose,
}: {
  cluster: string;
  kind: KindInfo;
  namespace: string | null;
  name: string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const ref = { group: kind.group, version: kind.version, resource: kind.resource, namespace, name };
  const detail = useQuery({
    queryKey: ["manager", "object", cluster, ref],
    queryFn: () => api.object(cluster, ref),
    refetchInterval: 15_000,
  });
  const isPod = kind.group === "" && kind.resource === "pods";
  const hasLogs = Boolean(namespace) && (isPod || SELECTS_PODS.has(`${kind.group}/${kind.resource}`));
  const canEdit = useCanEdit(cluster, namespace);
  const shell = isPod && canEdit && Boolean(namespace);
  const tabs: [Tab, string][] = [
    ["overview", "Overview"],
    ["yaml", "YAML"],
    ["events", "Events"],
    ...(hasLogs ? ([["logs", "Logs"]] as [Tab, string][]) : []),
    ...(shell ? ([["terminal", "Terminal"], ["files", "Files"]] as [Tab, string][]) : []),
  ];
  const scope = `cluster=${encodeURIComponent(cluster)}&namespace=${encodeURIComponent(namespace ?? "")}`;
  const ref_ = namespace ? `${kind.kind}/${namespace}/${name}` : `${kind.kind}/${name}`;

  return (
    <aside className="flex h-full flex-col">
      <div className="flex items-start gap-3 border-b border-border px-6 py-4">
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 className="break-words font-semibold">{name}</h2>
          <p className="text-sm text-subtle">
            {kind.kind}
            {namespace ? ` in ${namespace}` : ""}
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

      <div className="flex flex-wrap items-center gap-2 border-b border-border px-6 py-3">
        {INVESTIGABLE.has(kind.kind) && namespace && (
          <Link
            href={`/doctor?${scope}&focus=${encodeURIComponent(ref_)}`}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink transition-colors hover:bg-accent-strong"
          >
            Investigate
          </Link>
        )}
        {ON_MAP.has(kind.kind) && namespace && (
          <Link
            href={`/map?${scope}`}
            className="rounded-md border border-border px-3 py-1.5 text-sm text-fg transition-colors hover:bg-surface-2"
          >
            Show on map
          </Link>
        )}
        <ObjectActions
          cluster={cluster}
          kind={kind}
          objectRef={ref}
          object={detail.data?.object}
          onDeleted={onClose}
        />
      </div>

      <div className="flex gap-1 border-b border-border px-4" role="tablist">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`px-3 py-2.5 text-sm transition-colors ${
              tab === id ? "text-fg shadow-[inset_0_-2px_0_var(--accent)]" : "text-muted hover:text-fg"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {detail.error && <p className="p-6 text-sm text-danger">{detail.error.message}</p>}
        {detail.isPending && <p className="p-6 text-sm text-muted">Loading</p>}
        {detail.data && tab === "overview" && (
          <ObjectOverview detail={detail.data} kind={kind} />
        )}
        {detail.data && tab === "yaml" && (
          <YamlPanel cluster={cluster} kind={kind} detail={detail.data} objectRef={{ namespace, name }} />
        )}
        {tab === "terminal" && shell && namespace && <PodTerminal cluster={cluster} namespace={namespace} pod={name} />}
        {tab === "files" && shell && namespace && <PodFiles cluster={cluster} namespace={namespace} pod={name} />}
        {tab === "events" && (
          <ObjectEvents cluster={cluster} kind={kind.kind} namespace={namespace} name={name} />
        )}
        {tab === "logs" && namespace && hasLogs &&
          (isPod ? (
            <PodLogsView cluster={cluster} namespace={namespace} pod={name} />
          ) : (
            <WorkloadLogs cluster={cluster} kind={kind} namespace={namespace} name={name} />
          ))}
      </div>
    </aside>
  );
}
