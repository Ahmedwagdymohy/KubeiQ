"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";

import { ClusterPanel } from "@/components/doctor/cluster-panel";
import { HistoryList } from "@/components/doctor/history-list";
import { IncidentList } from "@/components/doctor/incident-list";
import { ProgressTimeline } from "@/components/doctor/progress-timeline";
import { Dot } from "@/components/ui";
import { useInvestigation } from "@/hooks/use-investigation";
import {
  api,
  type Diagnosis,
  type Investigation,
  type InvestigationStatus,
  type ProgressEvent,
} from "@/lib/api";

const SIDEBAR_KEY = "kubeiq-sidebar-width";
const SIDEBAR_MIN = 280;
const SIDEBAR_MAX = 560;
const SIDEBAR_DEFAULT = 340;

function readSavedWidth(): number {
  try {
    const saved = Number(localStorage.getItem(SIDEBAR_KEY));
    return saved >= SIDEBAR_MIN && saved <= SIDEBAR_MAX ? saved : SIDEBAR_DEFAULT;
  } catch {
    return SIDEBAR_DEFAULT;
  }
}

function subscribeToWidth(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(SIDEBAR_KEY, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(SIDEBAR_KEY, onChange);
  };
}

/** Sidebar width: saved per browser; the server renders the default, the client the saved value. */
function useSidebarWidth() {
  const saved = useSyncExternalStore(subscribeToWidth, readSavedWidth, () => SIDEBAR_DEFAULT);
  const [dragging, setDragging] = useState<number | null>(null);
  const width = dragging ?? saved;

  const startDrag = useCallback(
    (event: React.PointerEvent) => {
      event.preventDefault();
      const startX = event.clientX;
      let latest = width;
      const move = (e: PointerEvent) => {
        latest = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, width + e.clientX - startX));
        setDragging(latest);
      };
      const stop = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", stop);
        document.body.style.cursor = "";
        try {
          localStorage.setItem(SIDEBAR_KEY, String(latest));
        } catch {
          // storage unavailable; width resets on reload
        }
        window.dispatchEvent(new Event(SIDEBAR_KEY));
        setDragging(null);
      };
      document.body.style.cursor = "col-resize";
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", stop);
    },
    [width],
  );

  return { width, startDrag };
}

export function Doctor() {
  const clusters = useQuery({ queryKey: ["clusters"], queryFn: api.clusters });
  const router = useRouter();
  const params = useSearchParams();
  // Deep link from Cluster Map: ?cluster=..&namespace=..&focus=<workload ref> starts a scan.
  const [chosen, setChosen] = useState<string | null>(() => params.get("cluster"));
  const [namespace, setNamespace] = useState(() => params.get("namespace") ?? "");
  const [focus] = useState(() => params.get("focus"));
  const investigation = useInvestigation();
  const { width, startDrag } = useSidebarWidth();
  const linkedId = params.get("id");
  const openedLink = useRef(false);

  useEffect(() => {
    const cluster = params.get("cluster");
    if (cluster && !linkedId && !openedLink.current) {
      openedLink.current = true;
      investigation.start(cluster, params.get("namespace") || null);
    }
  }, [params, linkedId, investigation]);

  // Open an investigation from a shared link (?id=...) once on load.
  useEffect(() => {
    if (linkedId && !openedLink.current) {
      openedLink.current = true;
      investigation.open(linkedId);
    }
  }, [linkedId, investigation]);

  // With nothing linked, open the latest investigation so the screen starts with real results.
  const latest = useQuery({ queryKey: ["investigations"], queryFn: () => api.investigations(20) });
  useEffect(() => {
    const first = latest.data?.[0];
    if (first && !linkedId && !params.get("cluster") && !openedLink.current) {
      openedLink.current = true;
      investigation.open(first.id);
    }
  }, [latest.data, linkedId, params, investigation]);

  // Keep the URL in sync so the current investigation can be shared.
  useEffect(() => {
    if (investigation.id && investigation.id !== linkedId) {
      const keep = focus ? `&focus=${encodeURIComponent(focus)}` : "";
      router.replace(`/doctor?id=${investigation.id}${keep}`, { scroll: false });
    }
  }, [investigation.id, linkedId, router, focus]);

  const selected =
    chosen ?? clusters.data?.find((c) => c.is_default)?.id ?? clusters.data?.[0]?.id ?? null;

  const choose = (id: string) => {
    setChosen(id);
    setNamespace("");
  };

  const waitingForLink =
    (linkedId || latest.isPending || Boolean(latest.data?.length)) &&
    !investigation.status &&
    !investigation.error;

  return (
    <div className="flex flex-1 flex-col">
      <main
        style={{ "--sidebar": `${width}px` } as CSSProperties}
        className="mx-auto grid w-full max-w-[1680px] flex-1 grid-cols-[minmax(0,1fr)] gap-px border-x border-border bg-border lg:grid-cols-[var(--sidebar)_minmax(0,1fr)]"
      >
        <div className="relative flex min-w-0 flex-col gap-px">
          <ClusterPanel
            selected={selected}
            namespace={namespace}
            running={investigation.running}
            onSelect={choose}
            onNamespace={setNamespace}
            onInvestigate={(ns) => selected && investigation.start(selected, ns || null)}
          />
          <div className="flex-1 bg-bg">
            <HistoryList activeId={investigation.id} onOpen={investigation.open} />
          </div>
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sidebar"
            onPointerDown={startDrag}
            className="absolute -right-1 top-0 hidden h-full w-2 cursor-col-resize transition-colors hover:bg-accent/40 lg:block"
          />
        </div>

        <div
          className={`flex min-w-0 flex-col gap-px transition-opacity ${
            investigation.loading ? "opacity-60" : ""
          }`}
        >
          {investigation.error && (
            <div className="bg-bg p-6 text-sm text-danger sm:p-8">{investigation.error}</div>
          )}
          {waitingForLink ? (
            <div className="flex-1 bg-bg" />
          ) : !investigation.status && !investigation.error ? (
            <EmptyState />
          ) : (
            <>
              {investigation.status && (
                <Steps
                  key={investigation.id ?? "new"}
                  events={investigation.events}
                  status={investigation.status}
                />
              )}
              {investigation.investigation && (
                <Results investigation={investigation.investigation} focus={focus} />
              )}
              <div className="flex-1 bg-bg" />
            </>
          )}
        </div>
      </main>
    </div>
  );
}

/** Live steps while running; a one-line summary (expandable) once finished. */
function Steps({ events, status }: { events: ProgressEvent[]; status: InvestigationStatus }) {
  const [expanded, setExpanded] = useState(false);
  const finished = status === "completed" || status === "failed";
  if (!finished || expanded) {
    return (
      <div className="bg-bg p-6 sm:p-8">
        <ProgressTimeline events={events} status={status} />
        {finished && (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="mt-4 text-sm text-subtle transition-colors hover:text-accent"
          >
            Hide steps
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between gap-4 bg-bg px-6 py-4 sm:px-8">
      <span className="flex items-center gap-2 text-sm text-muted">
        <Dot tone={status === "failed" ? "critical" : "healthy"} />
        {status === "failed" ? "Investigation failed" : "Investigation finished"}
      </span>
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="text-sm text-subtle transition-colors hover:text-accent"
      >
        Show steps
      </button>
    </div>
  );
}

function SeverityCounts({ diagnoses }: { diagnoses: Diagnosis[] }) {
  const critical = diagnoses.filter((d) => d.severity === "critical").length;
  const warning = diagnoses.filter((d) => d.severity === "warning").length;
  return (
    <span className="flex items-center gap-4 text-sm text-muted">
      <span className="flex items-center gap-2">
        <Dot tone="critical" />
        {critical} critical
      </span>
      <span className="flex items-center gap-2">
        <Dot tone="warning" />
        {warning} warning
      </span>
    </span>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col bg-bg p-6 sm:p-8">
      <h2 className="text-lg font-semibold">No Investigations Yet</h2>
      <p className="mt-1 max-w-xl text-muted">
        Pick a cluster and a namespace, then run an investigation to see what is broken and how to
        fix it
      </p>
      <div className="mt-6 max-w-xl rounded-lg border border-dashed border-control px-5 py-4 text-sm text-muted">
        Results show here: each broken workload with its root cause, the commands that fix it and
        how to check that it worked
      </div>
    </div>
  );
}

const CHECKED_LABELS: [key: string, singular: string, plural: string][] = [
  ["pods", "pod", "pods"],
  ["workloads", "workload", "workloads"],
  ["services", "service", "services"],
  ["nodes", "node", "nodes"],
  ["events", "warning event", "warning events"],
];

function checkedSummary(checked: Record<string, number>): string[] {
  return CHECKED_LABELS.filter(([key]) => key in checked).map(
    ([key, one, many]) => `${checked[key]} ${checked[key] === 1 ? one : many}`,
  );
}

function Results({ investigation, focus }: { investigation: Investigation; focus: string | null }) {
  const report = investigation.report;
  if (investigation.status === "failed") {
    return (
      <div className="bg-bg p-6 sm:p-8">
        <p className="text-danger">{investigation.error}</p>
      </div>
    );
  }
  if (!report) return null;

  const scope = report.namespace ? `namespace ${report.namespace}` : "all namespaces";
  const checked = checkedSummary(report.checked ?? {});

  if (report.healthy) {
    return (
      <div className="flex flex-col bg-bg p-6 sm:p-8">
        <span className="flex items-center gap-2 text-sm text-muted">
          <Dot tone="healthy" /> Healthy
        </span>
        <h2 className="mt-2 text-lg font-semibold">No Issues Found</h2>
        <p className="mt-1 max-w-lg text-muted">
          Checked {checked.join(", ") || "the cluster"} in {scope}. Everything is running as
          expected
        </p>
      </div>
    );
  }

  const count = report.diagnoses.length;
  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-2 bg-bg px-6 pb-4 pt-6 sm:px-8">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">
            {count} {count === 1 ? "Issue" : "Issues"} Found
          </h2>
          <span className="text-sm text-muted">
            Checked {checked.slice(0, 3).join(", ")} in {scope}
          </span>
        </div>
        <SeverityCounts diagnoses={report.diagnoses} />
      </div>
      <IncidentList key={investigation.id} diagnoses={report.diagnoses} focus={focus} />
    </>
  );
}
