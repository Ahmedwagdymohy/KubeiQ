"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { usePodContainers } from "@/components/manager/pod-terminal";
import { api, fileDownloadUrl } from "@/lib/api";

const control = "h-8 rounded-lg border border-control bg-bg px-2 text-sm text-fg outline-none focus:border-accent";

/** Browse a container's files and download one (same permission as the terminal; audited). */
export function PodFiles({ cluster, namespace, pod }: { cluster: string; namespace: string; pod: string }) {
  const containers = usePodContainers(cluster, namespace, pod);
  const [container, setContainer] = useState<string | null>(null);
  const [path, setPath] = useState("/");
  const chosen = container ?? containers[0] ?? null;
  const listing = useQuery({
    queryKey: ["manager", "files", cluster, namespace, pod, chosen, path],
    queryFn: () => api.files(cluster, namespace, pod, chosen!, path),
    enabled: Boolean(chosen),
    retry: false,
  });
  const parts = path.split("/").filter(Boolean);
  const join = (name: string) => `${path.replace(/\/$/, "")}/${name}`;

  return (
    <div className="flex flex-col gap-3 p-6">
      <div className="flex flex-wrap items-center gap-2">
        {containers.length > 1 && (
          <select aria-label="Container" value={chosen ?? ""} onChange={(e) => { setContainer(e.target.value); setPath("/"); }} className={control}>
            {containers.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        )}
        <nav aria-label="Path" className="flex min-w-0 flex-wrap items-center gap-1 font-mono text-[13px]">
          <button type="button" onClick={() => setPath("/")} className="rounded px-1 hover:bg-surface-2">
            /
          </button>
          {parts.map((p, i) => (
            <span key={i} className="flex items-center gap-1">
              <button type="button" onClick={() => setPath(`/${parts.slice(0, i + 1).join("/")}`)} className="rounded px-1 hover:bg-surface-2">
                {p}
              </button>
              {i < parts.length - 1 && <span className="text-subtle">/</span>}
            </span>
          ))}
        </nav>
      </div>
      {listing.isPending && chosen && <p className="text-sm text-muted">Loading</p>}
      {listing.error && <p className="break-words rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{listing.error.message}</p>}
      {listing.data && (
        <ul className="flex flex-col divide-y divide-border/70 rounded-lg border border-border">
          {path !== "/" && (
            <li>
              <button type="button" onClick={() => setPath(`/${parts.slice(0, -1).join("/")}`)} className="w-full px-3 py-2 text-left text-sm text-muted hover:bg-surface">
                ..
              </button>
            </li>
          )}
          {listing.data.entries.length === 0 && <li className="px-3 py-2 text-sm text-muted">Empty folder</li>}
          {listing.data.entries.map((e) => (
            <li key={e.name} className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-surface">
              {e.directory ? (
                <button type="button" onClick={() => setPath(join(e.name))} className="min-w-0 flex-1 truncate text-left font-mono text-[13px]">
                  {e.name}/
                </button>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-muted">{e.name}</span>
                  <a href={fileDownloadUrl(cluster, namespace, pod, chosen!, join(e.name))} className="shrink-0 text-sm font-medium text-accent hover:underline">
                    Download
                  </a>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {listing.data?.truncated && <p className="text-xs text-subtle">Showing the first 1,000 entries</p>}
      <p className="text-[13px] text-subtle">Downloads up to 10 MB, each recorded in the activity log</p>
    </div>
  );
}
