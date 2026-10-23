"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { CloseIcon } from "@/components/icons";
import { INVESTIGABLE, ON_MAP } from "@/components/manager/kinds";
import { ObjectActions } from "@/components/manager/object-actions";
import { ObjectEvents } from "@/components/manager/object-events";
import { ObjectOverview } from "@/components/manager/object-overview";
import { PodLogsView } from "@/components/manager/pod-logs";
import { CodeBlock } from "@/components/ui";
import { api, type KindInfo } from "@/lib/api";

type Tab = "overview" | "yaml" | "events" | "logs";

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
  const tabs: [Tab, string][] = [
    ["overview", "Overview"],
    ["yaml", "YAML"],
    ["events", "Events"],
    ...(isPod ? ([["logs", "Logs"]] as [Tab, string][]) : []),
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
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-ink transition-opacity hover:opacity-85"
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
              tab === id ? "text-fg shadow-[inset_0_-2px_0_var(--text)]" : "text-muted hover:text-fg"
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
          <div className="flex flex-col gap-3 p-6">
            {detail.data.values_hidden && (
              <p className="text-sm text-muted">
                Secret values are never read. Only names and metadata are shown.
              </p>
            )}
            <CodeBlock text={detail.data.yaml.trimEnd()} />
          </div>
        )}
        {tab === "events" && (
          <ObjectEvents cluster={cluster} kind={kind.kind} namespace={namespace} name={name} />
        )}
        {tab === "logs" && isPod && namespace && (
          <PodLogsView cluster={cluster} namespace={namespace} pod={name} />
        )}
      </div>
    </aside>
  );
}
