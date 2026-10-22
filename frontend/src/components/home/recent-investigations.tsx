"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { headline, timeAgo, tone } from "@/components/doctor/history-list";
import { Dot } from "@/components/ui";
import { api } from "@/lib/api";

export function RecentInvestigations() {
  const recent = useQuery({ queryKey: ["investigations", 6], queryFn: () => api.investigations(6) });

  if (recent.isPending) return <p className="px-6 py-5 text-sm text-subtle">Loading</p>;
  if (recent.isError)
    return <p className="px-6 py-5 text-sm text-danger">Could not reach the KubeiQ API</p>;
  if (recent.data.length === 0)
    return (
      <p className="px-6 py-5 text-sm text-muted">
        No investigations yet. Open Cluster Doctor to run your first one.
      </p>
    );

  return (
    <ul className="flex flex-col divide-y divide-border">
      {recent.data.map((item) => (
        <li key={item.id}>
          <Link
            href={`/doctor?id=${item.id}`}
            className="flex items-center gap-4 px-6 py-4 transition-colors hover:bg-surface"
          >
            <Dot tone={tone(item)} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm font-medium">{headline(item)}</span>
              <span className="truncate text-sm text-muted">
                {item.cluster_id.split(":").pop()}
                {item.namespace ? ` / ${item.namespace}` : " / all namespaces"}
              </span>
            </span>
            <span className="shrink-0 text-sm text-subtle">{timeAgo(item.created_at)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
