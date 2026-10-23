"use client";

import { useState, type ReactNode } from "react";

import { INCIDENTS, type Incident } from "@/lib/incidents";

const PICKS = ["payment", "billing", "analytics", "queue-worker", "orders"];
const MODELS = [
  ["none", "No model, rules only"],
  ["openai", "OpenAI"],
  ["anthropic", "Anthropic"],
  ["ollama", "Ollama on your own machine"],
] as const;
type Model = (typeof MODELS)[number][0];

/** What the evidence looks like on its way to the model, with and without masking. */
const EVIDENCE: Record<string, [masked: string, raw: string]> = {
  payment: ["env DB_PASSWORD=••••••••", "env DB_PASSWORD=pr0d-Wint3r-2026"],
  billing: ["secret billing-db keys: username", "secret billing-db keys: username"],
  analytics: ["requests cpu=64 memory=1Gi", "requests cpu=64 memory=1Gi"],
  "queue-worker": [
    "log: token=•••• panic: concurrency 0",
    "log: token=sk-live-81fa2c panic: concurrency 0",
  ],
  orders: [
    "log: postgres://orders:••••@postgres-orders:5432",
    "log: postgres://orders:hunter2@postgres-orders:5432",
  ],
};

function Card({
  incident,
  model,
  masked,
  changes,
}: {
  incident: Incident;
  model: Model;
  masked: boolean;
  changes: boolean;
}) {
  const needsModel = incident.foundBy === "agent" && model === "none";
  const [maskedLine, rawLine] = EVIDENCE[incident.workload];
  const modelName = MODELS.find(([id]) => id === model)?.[1];
  return (
    <div
      data-ui
      className="w-full max-w-[460px] overflow-hidden rounded-xl bg-terminal text-left text-terminal-fg "
    >
      <div className="flex items-center gap-3 px-5 pt-5">
        <span
          className={`h-2.5 w-2.5 rounded-full ${needsModel ? "bg-terminal-warn" : "bg-tile-bad"}`}
        />
        <span className="font-semibold">{incident.workload}</span>
        <span className="truncate text-sm text-terminal-fg/65">{incident.kind} in kubeiq-demo</span>
        {!needsModel && (
          <span className="ml-auto shrink-0 text-sm text-terminal-fg/65">
            {incident.confidence}% sure
          </span>
        )}
      </div>
      <p className="px-5 pt-1 text-sm text-terminal-fg/65">{incident.symptom}</p>

      <div key={`${incident.workload}-${model}`} className="after-mask flex flex-col gap-4 p-5">
        {needsModel ? (
          <p className="text-[17px] font-medium leading-snug">
            The rules see the crash but not its cause. Add a model and the agent finds it
          </p>
        ) : (
          <>
            <p className="text-[17px] font-medium leading-snug">{incident.rootCause}</p>
            <pre className="overflow-x-auto rounded-md bg-black/40 px-4 py-3 text-[13px] leading-6">
              <code>
                {incident.commands.map((c) => (
                  <span key={c} className="block whitespace-pre">
                    <span className="select-none text-field">$ </span>
                    {c}
                  </span>
                ))}
              </code>
            </pre>
          </>
        )}

        <div className="flex flex-col gap-1.5 text-[13px]">
          <span className="text-terminal-fg/65">Evidence the model reads</span>
          <code
            className={`rounded-md px-3 py-2 ${masked ? "bg-black/40" : "bg-tile-bad/15 text-tile-bad"}`}
          >
            {masked ? maskedLine : rawLine}
          </code>
          {!masked && maskedLine !== rawLine && (
            <span className="text-tile-bad">
              Without masking, this secret would leave your cluster
            </span>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 pt-1">
          <span className="text-[13px] text-terminal-fg/65">
            {model === "none"
              ? "Found by the built-in rules"
              : incident.foundBy === "agent"
                ? `Investigated with ${modelName}`
                : `Rules first, ${modelName} on standby`}
          </span>
          {!needsModel && (
            <button
              type="button"
              className={`shrink-0 rounded-md px-3 py-2 text-[13px] font-semibold transition-colors ${
                changes
                  ? "bg-terminal-fg text-terminal hover:opacity-90"
                  : "bg-white/10 text-terminal-fg hover:bg-white/15"
              }`}
            >
              {changes ? "Run with confirmation" : "Copy the fix"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div data-reveal className="flex flex-col justify-center gap-4 py-12 lg:min-h-[50svh] lg:py-0">
      <h3 className="t-statement font-medium">{title}</h3>
      {children}
    </div>
  );
}

function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="flex min-h-11 items-center gap-3 self-start text-left"
    >
      <span
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-accent" : "bg-control"}`}
      >
        <span
          className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-[left] ${on ? "left-6" : "left-1"}`}
        />
      </span>
      <span className="text-[17px]">{label}</span>
    </button>
  );
}

/** The one live thing: a pinned incident the reader configures as they scroll. */
export function LiveReport() {
  const [pick, setPick] = useState("payment");
  const [model, setModel] = useState<Model>("none");
  const [masked, setMasked] = useState(true);
  const [changes, setChanges] = useState(false);
  const incident = INCIDENTS.find((i) => i.workload === pick)!;

  return (
    <section id="try-it" className="flex flex-col lg:grid lg:grid-cols-2">
      <div className="frame lg:col-start-2 lg:row-start-1 lg:pl-16 xl:pl-24">
        <div data-reveal className="flex flex-col gap-4 pb-12 pt-20 lg:pb-0 lg:pt-28">
          <h2 className="t-title">Make It Yours</h2>
          <p className="max-w-[44ch] text-[17px] text-muted">
            Every control below changes the incident on the left. It is real output from our demo
            cluster
          </p>
        </div>
      </div>

      <div className="sticky top-0 z-10 flex h-[46svh] items-center justify-center overflow-hidden bg-field px-4 lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:h-svh lg:px-10">
        <Card incident={incident} model={model} masked={masked} changes={changes} />
      </div>

      <div className="frame lg:col-start-2 lg:row-start-2 lg:pl-16 xl:pl-24">
        <Block title="Pick a broken workload">
          <p className="max-w-[44ch] text-[17px] text-muted">
            Each one fails in its own way. The root cause names the exact setting
          </p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Workload">
            {PICKS.map((name) => (
              <button
                key={name}
                type="button"
                role="radio"
                aria-checked={pick === name}
                onClick={() => setPick(name)}
                className={`min-h-11 rounded-md px-4 text-[15px] font-medium transition-colors ${
                  pick === name
                    ? "bg-primary text-primary-ink"
                    : "bg-surface-2 text-fg hover:bg-control"
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        </Block>

        <Block title="Bring any model, or none">
          <p className="max-w-[44ch] text-[17px] text-muted">
            The built-in rules find common failures with no model at all. Add one and an agent takes
            on the rest. Try orders with and without
          </p>
          <select
            aria-label="AI model"
            value={model}
            onChange={(e) => setModel(e.target.value as Model)}
            className="min-h-11 max-w-sm rounded-md border border-control bg-bg px-3 text-[17px] text-fg outline-none focus:border-accent"
          >
            {MODELS.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </Block>

        <Block title="Secrets stay in your cluster">
          <p className="max-w-[44ch] text-[17px] text-muted">
            Passwords, tokens and keys are masked before anything reaches a model. Switch it off to
            see what that saves you from
          </p>
          <Toggle on={masked} onChange={setMasked} label="Mask secrets" />
        </Block>

        <Block title="Read-only until you say so">
          <p className="max-w-[44ch] text-[17px] text-muted">
            KubeiQ changes nothing by default. An admin can allow changes for project editors, and
            every change is confirmed and logged
          </p>
          <Toggle on={changes} onChange={setChanges} label="Allow cluster changes" />
        </Block>
        <div className="h-12 lg:h-[20svh]" />
      </div>
    </section>
  );
}
