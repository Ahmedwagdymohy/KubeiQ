"use client";

import { Spinner } from "@/components/ui";
import type { InvestigationStatus, ProgressEvent } from "@/lib/api";

const COLLECTORS: { step: string; label: string }[] = [
  { step: "pods", label: "Pods" },
  { step: "events", label: "Events" },
  { step: "workloads", label: "Workloads" },
  { step: "services", label: "Services" },
  { step: "nodes", label: "Nodes" },
  { step: "logs", label: "Logs" },
];

type StepState = "pending" | "running" | "done" | "failed";

function stateOf(events: ProgressEvent[], step: string): { state: StepState; detail: string | null } {
  const last = events.filter((e) => e.step === step).at(-1);
  if (!last) return { state: "pending", detail: null };
  if (last.status === "failed") return { state: "failed", detail: last.detail };
  if (last.status === "completed") return { state: "done", detail: last.detail };
  return { state: "running", detail: last.detail };
}

function Marker({ state }: { state: StepState }) {
  if (state === "running") return <Spinner />;
  const styles: Record<Exclude<StepState, "running">, string> = {
    pending: "border border-border",
    done: "bg-accent",
    failed: "bg-danger",
  };
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${styles[state]}`} />;
}

function Row({ label, state, detail }: { label: string; state: StepState; detail?: string | null }) {
  return (
    <li className="flex min-w-0 items-baseline gap-3 py-1">
      <Marker state={state} />
      <span className={`shrink-0 text-sm ${state === "pending" ? "text-subtle" : "text-fg"}`}>
        {label}
      </span>
      {detail && <span className="truncate text-sm text-muted">{detail}</span>}
    </li>
  );
}

export function ProgressTimeline({
  events,
  status,
}: {
  events: ProgressEvent[];
  status: InvestigationStatus | null;
}) {
  const active = status === "queued" || status === "running";
  const collectors = COLLECTORS.map((c) => ({ ...c, ...stateOf(events, c.step) }));
  const collectState: StepState = collectors.every((c) => c.state === "done")
    ? "done"
    : collectors.some((c) => c.state !== "pending") || active
      ? "running"
      : "pending";
  const detect = stateOf(events, "detect");
  const done = stateOf(events, "done");
  const agentEvents = events.filter((e) => e.step === "agent");
  const deepState: StepState =
    agentEvents.length === 0 ? (done.state === "pending" ? "pending" : "done") : done.state === "pending" ? "running" : "done";

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <h2 className="text-base font-semibold">
        {active ? "Investigating" : done.state === "failed" ? "Investigation failed" : "Investigation"}
      </h2>
      {active && (
        <div className="relative h-0.5 w-full overflow-hidden rounded-full bg-surface-2">
          <div className="scan-bar absolute inset-y-0 w-1/4 rounded-full bg-accent" />
        </div>
      )}
      <ul className="flex flex-col">
        <Row label="Collecting evidence" state={collectState} />
        <ul className="ml-1 flex flex-col border-l border-border pl-5">
          {collectors.map((c) => (
            <Row key={c.step} label={c.label} state={c.state} detail={c.detail} />
          ))}
        </ul>
        <Row label="Finding problems" state={detect.state} detail={detect.detail} />
        {(agentEvents.length > 0 || deepState === "running") && (
          <>
            <Row label="Digging deeper" state={deepState} />
            <ul className="ml-1 flex flex-col gap-1 border-l border-border py-1 pl-5">
              {agentEvents.slice(-8).map((e) => (
                <li
                  key={e.seq}
                  className={`truncate text-sm ${
                    e.status === "failed"
                      ? "text-danger"
                      : e.status === "completed"
                        ? "text-fg"
                        : "text-muted"
                  }`}
                >
                  {e.detail?.replaceAll("`", "")}
                </li>
              ))}
            </ul>
          </>
        )}
        <Row label={done.state === "failed" ? "Failed" : "Done"} state={done.state} detail={done.detail} />
      </ul>
    </div>
  );
}
