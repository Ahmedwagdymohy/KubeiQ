"use client";

import { useQuery } from "@tanstack/react-query";

import { age } from "@/components/manager/kinds";
import { Dot } from "@/components/ui";
import { api } from "@/lib/api";

export function ObjectEvents({
  cluster,
  kind,
  namespace,
  name,
}: {
  cluster: string;
  kind: string;
  namespace: string | null;
  name: string;
}) {
  const events = useQuery({
    queryKey: ["manager", "events", cluster, kind, namespace, name],
    queryFn: () => api.events(cluster, kind, namespace, name),
    refetchInterval: 15_000,
  });
  if (events.error) return <p className="p-6 text-sm text-danger">{events.error.message}</p>;
  if (events.isPending) return <p className="p-6 text-sm text-muted">Loading</p>;
  if (events.data.length === 0)
    return <p className="p-6 text-sm text-muted">No recent events. Kubernetes keeps them for about an hour</p>;
  return (
    <ul className="flex flex-col divide-y divide-border">
      {events.data.map((e, i) => (
        <li key={i} className="flex flex-col gap-1 px-6 py-3 text-sm">
          <span className="flex items-center gap-2">
            <Dot tone={e.type === "Warning" ? "warning" : "info"} />
            <span className="font-medium">{e.reason}</span>
            <span className="ml-auto text-xs text-subtle">
              {e.count > 1 ? `${e.count}x · ` : ""}
              {age(e.last_seen)} ago
            </span>
          </span>
          <span className="break-words text-muted">{e.message}</span>
        </li>
      ))}
    </ul>
  );
}
