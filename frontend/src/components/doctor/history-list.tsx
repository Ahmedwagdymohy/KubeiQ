"use client";

import { useQuery } from "@tanstack/react-query";

import { SectionLabel } from "@/components/ui";
import { api, type InvestigationSummary } from "@/lib/api";

function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function dot(item: InvestigationSummary): string {
  if (item.status === "failed") return "bg-danger";
  if (item.status !== "completed") return "bg-accent animate-pulse";
  if (item.healthy) return "bg-accent";
  return item.severity === "critical" ? "bg-danger" : "bg-warning";
}

function label(item: InvestigationSummary): string {
  if (item.status === "failed") return item.error ?? "Failed";
  if (item.status !== "completed") return "In progress";
  if (item.healthy) return "No problems found";
  return item.summary ?? `${item.incident_count} incident(s)`;
}

export function HistoryList({
  activeId,
  onOpen,
}: {
  activeId: string | null;
  onOpen: (id: string) => void;
}) {
  const history = useQuery({ queryKey: ["investigations"], queryFn: () => api.investigations(15) });

  return (
    <section className="flex flex-col gap-4 bg-bg p-6">
      <SectionLabel>Recent investigations</SectionLabel>
      {history.data?.length === 0 && <p className="text-sm text-muted">No investigations yet</p>}
      <ul className="flex flex-col">
        {history.data?.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onOpen(item.id)}
              className={`flex w-full items-start gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-surface-2 ${
                item.id === activeId ? "bg-surface-2" : ""
              }`}
            >
              <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dot(item)}`} />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm text-fg">{label(item)}</span>
                <span className="truncate font-mono text-xs text-subtle">
                  {item.cluster_id.replace(/^kubeconfig:/, "")}
                  {item.namespace ? ` / ${item.namespace}` : ""} · {timeAgo(item.created_at)}
                  {item.status === "completed" && !item.healthy
                    ? ` · ${item.incident_count} incident(s)`
                    : ""}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
