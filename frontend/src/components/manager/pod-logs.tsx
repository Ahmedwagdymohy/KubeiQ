"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Switch } from "@/components/settings/fields";
import { CodeBlock, Spinner } from "@/components/ui";
import { api } from "@/lib/api";

const control =
  "rounded-md border border-border bg-panel px-2 py-1 text-sm text-fg outline-none focus:border-accent";

export function PodLogsView({
  cluster,
  namespace,
  pod,
}: {
  cluster: string;
  namespace: string;
  pod: string;
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
