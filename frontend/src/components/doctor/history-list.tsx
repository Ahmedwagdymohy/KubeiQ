"use client";

import { useInfiniteQuery } from "@tanstack/react-query";

import { Dot, SectionLabel } from "@/components/ui";
import { api, type InvestigationSummary } from "@/lib/api";

/** Investigations shown at first and loaded by each Show more. */
const PAGE_SIZE = 5;

export function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function tone(item: InvestigationSummary): string {
  if (item.status === "failed") return "critical";
  if (item.status !== "completed") return "healthy";
  if (item.healthy) return "healthy";
  return item.severity ?? "warning";
}

export function headline(item: InvestigationSummary): string {
  if (item.status === "failed") return "Investigation failed";
  if (item.status !== "completed") return "Investigating";
  if (item.healthy) return "No issues found";
  return `${item.incident_count} issue${item.incident_count === 1 ? "" : "s"} found`;
}

export function HistoryList({
  activeId,
  onOpen,
}: {
  activeId: string | null;
  onOpen: (id: string) => void;
}) {
  const history = useInfiniteQuery({
    queryKey: ["investigations", "history"],
    queryFn: ({ pageParam }) => api.investigations(PAGE_SIZE, pageParam),
    initialPageParam: undefined as string | undefined,
    // A full page means there may be more; the next page starts before its last item.
    getNextPageParam: (last) => (last.length === PAGE_SIZE ? last.at(-1)?.created_at : undefined),
  });
  const items = history.data?.pages.flat();

  return (
    <section className="flex flex-col gap-3 bg-bg p-6">
      <SectionLabel>Recent Investigations</SectionLabel>
      {items?.length === 0 && <p className="text-sm text-subtle">No investigations yet</p>}
      <ul className="-mx-2 flex flex-col gap-0.5">
        {items?.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onOpen(item.id)}
              className={`flex w-full items-start gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-surface ${
                item.id === activeId ? "bg-surface-2" : ""
              }`}
            >
              <span className="pt-1.5">
                <Dot tone={tone(item)} pulse={item.status === "running" || item.status === "queued"} />
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-medium text-fg">
                  {headline(item)}
                  <span className="font-normal text-subtle"> · {timeAgo(item.created_at)}</span>
                </span>
                <span className="text-sm text-muted">
                  {item.namespace ?? "All namespaces"} on{" "}
                  <span className="font-mono text-xs">{item.cluster_id.replace(/^kubeconfig:/, "")}</span>
                </span>
                {item.status === "completed" && !item.healthy && item.summary && (
                  <span className="line-clamp-2 text-sm text-subtle">{item.summary}</span>
                )}
                {item.status === "failed" && item.error && (
                  <span className="line-clamp-2 text-sm text-danger/80">{item.error}</span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {history.hasNextPage && (
        <button
          type="button"
          onClick={() => history.fetchNextPage()}
          disabled={history.isFetchingNextPage}
          className="self-start text-sm font-medium text-muted transition-colors hover:text-fg disabled:opacity-60"
        >
          {history.isFetchingNextPage ? "Loading" : "Show more"}
        </button>
      )}
    </section>
  );
}
