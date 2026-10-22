"use client";

import { SectionLabel, Spinner } from "@/components/ui";
import type { InvestigationStatus, ProgressEvent } from "@/lib/api";

const COLLECTORS = ["pods", "events", "workloads", "services", "nodes", "logs"];

type StepState = "pending" | "running" | "done" | "failed";

function stateOf(events: ProgressEvent[], step: string): { state: StepState; detail: string | null } {
  const mine = events.filter((e) => e.step === step);
  const last = mine.at(-1);
  if (!last) return { state: "pending", detail: null };
  if (last.status === "failed") return { state: "failed", detail: last.detail };
  if (last.status === "completed") return { state: "done", detail: last.detail };
  return { state: "running", detail: last.detail };
}

function Marker({ state }: { state: StepState }) {
  if (state === "running") return <Spinner />;
  const styles: Record<StepState, string> = {
    pending: "border border-border",
    running: "",
    done: "bg-accent",
    failed: "bg-danger",
  };
  return <span className={`inline-block h-2 w-2 rounded-full ${styles[state]}`} />;
}

function Row({ label, state, detail }: { label: string; state: StepState; detail: string | null }) {
  return (
    <li className="flex min-w-0 items-baseline gap-3 py-1">
      <Marker state={state} />
      <span className={`text-sm ${state === "pending" ? "text-subtle" : "text-fg"}`}>{label}</span>
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
  const collectorStates = COLLECTORS.map((step) => ({ step, ...stateOf(events, step) }));
  const collectState: StepState = collectorStates.every((c) => c.state === "pending")
    ? status === "queued" || status === "running"
      ? "running"
      : "pending"
    : collectorStates.some((c) => c.state === "running" || c.state === "pending")
      ? "running"
      : "done";
  const detect = stateOf(events, "detect");
  const agentEvents = events.filter((e) => e.step === "agent");
  const done = stateOf(events, "done");
  const agentState: StepState =
    agentEvents.length === 0
      ? done.state === "done"
        ? "done"
        : "pending"
      : done.state === "pending"
        ? "running"
        : "done";

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <SectionLabel>Investigation</SectionLabel>
      <ul className="flex flex-col">
        <Row label="Collecting evidence" state={collectState} detail={null} />
        <ul className="ml-5 border-l border-border pl-4">
          {collectorStates.map((c) => (
            <Row key={c.step} label={c.step} state={c.state} detail={c.detail} />
          ))}
        </ul>
        <Row label="Detecting failures" state={detect.state} detail={detect.detail} />
        <Row
          label="AI investigation"
          state={agentState}
          detail={agentEvents.length === 0 && agentState === "done" ? "not needed" : null}
        />
        {agentEvents.length > 0 && (
          <ul className="ml-5 flex flex-col gap-1 border-l border-border py-1 pl-4">
            {agentEvents.slice(-10).map((e) => (
              <li
                key={e.seq}
                className={`truncate font-mono text-xs ${
                  e.status === "failed"
                    ? "text-danger"
                    : e.status === "completed"
                      ? "text-accent"
                      : "text-muted"
                }`}
              >
                {e.detail?.replaceAll("`", "")}
              </li>
            ))}
          </ul>
        )}
        <Row
          label={done.state === "failed" ? "Failed" : "Done"}
          state={done.state}
          detail={done.detail}
        />
      </ul>
    </div>
  );
}
