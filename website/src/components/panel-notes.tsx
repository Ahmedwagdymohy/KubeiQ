"use client";

import { useState, type ReactNode } from "react";

/**
 * One panel from the app, the billing deployment as Cluster Map shows it, with notes in both
 * margins naming which product each part comes from. Pointing at a note rings its part.
 */

type Part = "status" | "investigate" | "facts" | "connected" | "labels" | "changes";

const LEFT: { part: Part; name: string; text: string }[] = [
  { part: "status", name: "Status and Reason", text: "Cluster Map colours every resource by health and says why in one line" },
  { part: "investigate", name: "Investigate", text: "Opens Cluster Doctor on this workload with the root cause and the fix" },
  { part: "facts", name: "Facts", text: "Replicas, image and age, read from the cluster as it is right now" },
];
const RIGHT: { part: Part; name: string; text: string }[] = [
  { part: "connected", name: "Connected Resources", text: "How Kubernetes links it: the ReplicaSet, the pod, the Secret it needs" },
  { part: "labels", name: "YAML, Events and Logs", text: "Cluster Manager opens the object with its YAML, events and live logs" },
  { part: "changes", name: "Changes Are Off", text: "Restart and scale stay locked until an admin turns changes on. Every attempt is recorded" },
];

function Note({
  name,
  text,
  part,
  side,
  onFocus,
}: {
  name: string;
  text: string;
  part: Part;
  side: "left" | "right";
  onFocus: (p: Part | null) => void;
}) {
  return (
    <button
      type="button"
      onMouseEnter={() => onFocus(part)}
      onMouseLeave={() => onFocus(null)}
      onFocus={() => onFocus(part)}
      onBlur={() => onFocus(null)}
      className={`rise flex max-w-[26ch] flex-col gap-1 rounded-md text-left transition-colors hover:text-fg ${
        side === "left" ? "lg:ml-auto lg:text-right" : ""
      }`}
    >
      <span className="text-lg font-medium">{name}</span>
      <span className="text-base text-muted">{text}</span>
    </button>
  );
}

function Area({ part, active, children }: { part: Part; active: Part | null; children: ReactNode }) {
  return (
    <div
      className={`rounded-lg p-2 transition-shadow duration-300 ${
        active === part ? "ring-2 ring-accent" : "ring-0"
      }`}
    >
      {children}
    </div>
  );
}

export function PanelNotes() {
  const [active, setActive] = useState<Part | null>(null);

  const panel = (
    <div className="rounded-2xl bg-surface p-2">
      <div data-ui className="flex flex-col gap-3 rounded-xl bg-bg p-4">
        <Area part="status" active={active}>
          <p className="flex items-baseline justify-between">
            <span className="text-[17px] font-semibold">billing</span>
            <span className="text-sm text-muted">Deployment</span>
          </p>
          <p className="mt-2 flex items-center gap-2 text-sm font-medium text-danger">
            <span className="h-2 w-2 rounded-full bg-danger" />
            Broken
          </p>
          <p className="mt-1 text-[15px]">Secret billing-db is missing key &apos;password&apos;</p>
        </Area>
        <Area part="investigate" active={active}>
          <span className="block rounded-lg bg-surface-2 px-3 py-2.5 text-center text-[15px] font-medium">
            Investigate with Cluster Doctor
          </span>
        </Area>
        <Area part="facts" active={active}>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
            <dt className="text-muted">Ready</dt>
            <dd className="tnum">0 of 1</dd>
            <dt className="text-muted">Image</dt>
            <dd>
              <code className="font-mono text-[13px]">busybox:1.36</code>
            </dd>
            <dt className="text-muted">Namespace</dt>
            <dd>
              <code className="font-mono text-[13px]">kubeiq-demo</code>
            </dd>
          </dl>
        </Area>
        <Area part="connected" active={active}>
          <p className="pb-1.5 text-sm text-muted">Connected</p>
          <ul className="flex flex-col gap-1 text-sm">
            {["ReplicaSet billing-766df694f7", "Pod billing-766df694f7-dnfgw", "Secret billing-db"].map(
              (r) => (
                <li key={r} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-danger" />
                  <code className="truncate font-mono text-[13px]">{r}</code>
                </li>
              ),
            )}
          </ul>
        </Area>
        <Area part="labels" active={active}>
          <p className="pb-1.5 text-sm text-muted">Open in Cluster Manager</p>
          <div className="flex gap-4 text-sm font-medium">
            <span className="border-b-2 border-fg pb-1">YAML</span>
            <span className="pb-1 text-muted">Events</span>
            <span className="pb-1 text-muted">Logs</span>
          </div>
        </Area>
        <Area part="changes" active={active}>
          <div className="flex gap-2 text-sm">
            <span className="rounded-md bg-surface-2 px-3 py-1.5 text-muted">Restart</span>
            <span className="rounded-md bg-surface-2 px-3 py-1.5 text-muted">Scale</span>
            <span className="self-center pl-1 text-muted">Changes are off</span>
          </div>
        </Area>
      </div>
    </div>
  );

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_25rem_minmax(0,1fr)] lg:gap-12">
      <div className="hidden flex-col justify-around gap-10 lg:flex">
        {LEFT.map((n) => (
          <Note key={n.part} {...n} side="left" onFocus={setActive} />
        ))}
      </div>
      <div className="rise mx-auto w-full max-w-[25rem]">{panel}</div>
      <div className="hidden flex-col justify-around gap-10 lg:flex">
        {RIGHT.map((n) => (
          <Note key={n.part} {...n} side="right" onFocus={setActive} />
        ))}
      </div>
      <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:hidden">
        {[...LEFT, ...RIGHT].map((n) => (
          <Note key={n.part} {...n} side="right" onFocus={setActive} />
        ))}
      </div>
    </div>
  );
}
