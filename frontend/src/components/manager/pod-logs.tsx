"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { Switch } from "@/components/settings/fields";
import { CodeBlock, Spinner } from "@/components/ui";
import { api, type KindInfo } from "@/lib/api";

const control =
  "h-8 rounded-lg border border-control bg-bg px-2 text-sm text-fg outline-none focus:border-accent";

export function PodLogsView({
  cluster,
  namespace,
  pod,
  picker,
}: {
  cluster: string;
  namespace: string;
  pod: string;
  /** Shown first in the controls row, e.g. the pod picker of a workload. */
  picker?: ReactNode;
}) {
  const [container, setContainer] = useState<string | undefined>();
  const [tail, setTail] = useState(500);
  const [previous, setPrevious] = useState(false);
  const [follow, setFollow] = useState(true);
  const logs = useQuery({
    queryKey: ["manager", "logs", cluster, namespace, pod, container, tail, previous],
    queryFn: () => api.logs(cluster, namespace, pod, { container, tail, previous }),
    refetchInterval: follow && !previous ? 5_000 : false,
    placeholderData: keepPreviousData,
  });
  // Kubernetes prefixes each line with an RFC 3339 timestamp; show local time instead.
  const text = (logs.data?.lines ?? [])
    .map((line) => {
      const space = line.indexOf(" ");
      const stamp = new Date(line.slice(0, space));
      return Number.isNaN(stamp.getTime())
        ? line
        : `${stamp.toLocaleTimeString()}  ${line.slice(space + 1)}`;
    })
    .join("\n");

  return (
    <div className="flex flex-col gap-3 p-6">
      <div className="flex flex-wrap items-center gap-3">
        {picker}
        {logs.data && logs.data.containers.length > 1 && (
          <select
            aria-label="Container"
            value={logs.data.container}
            onChange={(e) => setContainer(e.target.value)}
            className={control}
          >
            {logs.data.containers.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        )}
        <select
          aria-label="Lines"
          value={tail}
          onChange={(e) => setTail(Number(e.target.value))}
          className={control}
        >
          {[100, 500, 1000, 2000].map((n) => (
            <option key={n} value={n}>
              Last {n} lines
            </option>
          ))}
        </select>
        <Switch checked={previous} onChange={setPrevious} label="Before last restart" />
        <Switch checked={follow && !previous} onChange={setFollow} label="Live" />
        {logs.isFetching && <Spinner />}
      </div>
      {logs.error && <p className="text-sm text-danger">{logs.error.message}</p>}
      {logs.data &&
        (text ? (
          <CodeBlock text={text} className="max-h-[70vh]" />
        ) : (
          <p className="text-sm text-muted">No logs yet</p>
        ))}
    </div>
  );
}

/** Logs of a workload or Service: pick one of its pods, the ones with problems first. */
export function WorkloadLogs({
  cluster,
  kind,
  namespace,
  name,
}: {
  cluster: string;
  kind: KindInfo;
  namespace: string;
  name: string;
}) {
  const ref = { group: kind.group, version: kind.version, resource: kind.resource, namespace, name };
  const pods = useQuery({
    queryKey: ["manager", "workload-pods", cluster, ref],
    queryFn: () => api.workloadPods(cluster, ref),
    refetchInterval: 15_000,
  });
  const [chosen, setChosen] = useState<string | undefined>();
  const list = pods.data ?? [];
  const pod = list.find((p) => p.name === chosen)?.name ?? list[0]?.name;

  if (pods.error) return <p className="p-6 text-sm text-danger">{pods.error.message}</p>;
  if (pods.isPending) return <p className="p-6 text-sm text-muted">Loading</p>;
  if (!pod)
    return (
      <p className="p-6 text-sm text-muted">
        {kind.kind === "Service" ? "No pods match this Service's selector" : `No pods running for this ${kind.kind}`}
      </p>
    );
  return (
    <PodLogsView
      key={pod}
      cluster={cluster}
      namespace={namespace}
      pod={pod}
      picker={
        <select aria-label="Pod" value={pod} onChange={(e) => setChosen(e.target.value)} className={`${control} max-w-full`}>
          {list.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name} · {p.status}
              {p.restarts ? `, ${p.restarts} restarts` : ""}
            </option>
          ))}
        </select>
      }
    />
  );
}
