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

import { AppHeader } from "@/components/app-header";
import { ClusterPanel } from "@/components/doctor/cluster-panel";
import { HistoryList } from "@/components/doctor/history-list";
import { IncidentList } from "@/components/doctor/incident-list";
import { ProgressTimeline } from "@/components/doctor/progress-timeline";
import { Dot } from "@/components/ui";
import { useInvestigation } from "@/hooks/use-investigation";
import { api, type Investigation, type InvestigationStatus, type ProgressEvent } from "@/lib/api";

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
  const [chosen, setChosen] = useState<string | null>(null);
  const [namespace, setNamespace] = useState("");
  const investigation = useInvestigation();
  const { width, startDrag } = useSidebarWidth();
  const router = useRouter();
  const params = useSearchParams();
  const linkedId = params.get("id");
  const openedLink = useRef(false);

  // Open an investigation from a shared link (?id=...) once on load.
  useEffect(() => {
    if (linkedId && !openedLink.current) {
      openedLink.current = true;
      investigation.open(linkedId);
    }
  }, [linkedId, investigation]);

  // Keep the URL in sync so the current investigation can be shared.
  useEffect(() => {
    if (investigation.id && investigation.id !== linkedId) {
      router.replace(`/doctor?id=${investigation.id}`, { scroll: false });
    }
  }, [investigation.id, linkedId, router]);

  const selected =
    chosen ?? clusters.data?.find((c) => c.is_default)?.id ?? clusters.data?.[0]?.id ?? null;

  const choose = (id: string) => {
    setChosen(id);
    setNamespace("");
  };

  const waitingForLink = linkedId && !investigation.status && !investigation.error;

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
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
            onInvestigate={() => selected && investigation.start(selected, namespace || null)}
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
              {investigation.investigation && <Results investigation={investigation.investigation} />}
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

function EmptyState() {
  return (
    <div className="bg-grid flex flex-1 flex-col items-center justify-center bg-bg px-6 py-24 text-center">
      <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">
        <span className="text-accent">Cluster</span> Doctor
      </h1>
      <p className="mt-4 max-w-md text-muted">
        Pick a cluster and a namespace, then run an investigation to see what is broken and how to
        fix it
      </p>
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

function Results({ investigation }: { investigation: Investigation }) {
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
      <div className="bg-grid flex flex-col items-center bg-bg px-6 py-16 text-center">
        <span className="flex items-center gap-2 text-sm text-muted">
          <Dot tone="healthy" /> Healthy
        </span>
        <h2 className="mt-4 text-2xl font-semibold">No Issues Found</h2>
        <p className="mt-2 max-w-lg text-muted">
          Checked {checked.join(", ") || "the cluster"} in {scope}. Everything is running as
          expected
        </p>
      </div>
    );
  }

  const count = report.diagnoses.length;
  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-2 bg-bg px-6 py-5 sm:px-8">
        <h2 className="text-lg font-semibold">
          {count} issue{count === 1 ? "" : "s"} found
        </h2>
        <span className="text-sm text-subtle">
          Checked {checked.slice(0, 3).join(", ")} in {scope}
        </span>
      </div>
      <IncidentList key={investigation.id} diagnoses={report.diagnoses} />
    </>
  );
}
