"use client";

import { useState } from "react";

import { CommandBlock, Pill, RichText, SectionLabel } from "@/components/ui";
import type { Diagnosis } from "@/lib/api";

function confidenceColor(value: number): string {
  if (value >= 80) return "bg-accent";
  if (value >= 55) return "bg-warning";
  return "bg-danger";
}

export function DiagnosisCard({ diagnosis }: { diagnosis: Diagnosis }) {
  const [showDetails, setShowDetails] = useState(false);
  const name = diagnosis.workload.split("/").slice(-1)[0];
  const kind = diagnosis.workload.split("/")[0];

  return (
    <article className="flex min-w-0 flex-col gap-5 bg-bg p-6 sm:p-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="text-lg font-medium">{name}</h3>
          <span className="font-mono text-xs text-subtle">{kind}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Pill tone={diagnosis.severity}>{diagnosis.severity}</Pill>
          <Pill tone={diagnosis.source}>{diagnosis.source === "ai" ? "AI analysis" : "Rule match"}</Pill>
        </div>
      </header>

      <div className="flex flex-col gap-2">
        <SectionLabel>Root cause</SectionLabel>
        <p className="text-base text-fg">
          <RichText text={diagnosis.root_cause} />
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <SectionLabel>Confidence</SectionLabel>
          <span className="font-mono text-sm">{diagnosis.confidence}%</span>
        </div>
        <div className="h-1 w-full rounded-full bg-surface-2">
          <div
            className={`h-1 rounded-full ${confidenceColor(diagnosis.confidence)}`}
            style={{ width: `${diagnosis.confidence}%` }}
          />
        </div>
      </div>

      {diagnosis.fix_steps.length > 0 && (
        <div className="flex flex-col gap-2">
          <SectionLabel>Fix</SectionLabel>
          <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-muted">
            {diagnosis.fix_steps.map((step) => (
              <li key={step}>
                <RichText text={step} />
              </li>
            ))}
          </ol>
        </div>
      )}

      {diagnosis.commands.length > 0 && (
        <div className="flex flex-col gap-2">
          <SectionLabel>Commands</SectionLabel>
          {diagnosis.commands.slice(0, showDetails ? undefined : 2).map((command) => (
            <CommandBlock key={command} command={command} />
          ))}
        </div>
      )}

      {diagnosis.note && <p className="text-sm text-warning">{diagnosis.note}</p>}

      <button
        type="button"
        onClick={() => setShowDetails((v) => !v)}
        className="self-start font-mono text-xs text-subtle transition-colors hover:text-accent"
      >
        {showDetails ? "hide details" : "show details"}
      </button>

      {showDetails && (
        <div className="flex flex-col gap-4 border-t border-border pt-4 text-sm">
          <Detail label="Explanation">
            <p className="text-muted">
              <RichText text={diagnosis.explanation} />
            </p>
          </Detail>
          {diagnosis.prevention && (
            <Detail label="Prevention">
              <p className="text-muted">
                <RichText text={diagnosis.prevention} />
              </p>
            </Detail>
          )}
          <Detail label="Why this confidence">
            <ul className="flex flex-col gap-1 text-muted">
              {diagnosis.confidence_reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </Detail>
          {diagnosis.agent_steps.length > 0 && (
            <Detail label="AI tool calls">
              <ul className="flex flex-col gap-1 font-mono text-xs text-muted">
                {diagnosis.agent_steps.map((step, i) => (
                  <li key={`${step.tool}-${i}`} className={step.ok ? "" : "text-subtle line-through"}>
                    {step.tool}({Object.entries(step.arguments)
                      .filter(([k]) => k !== "namespace")
                      .map(([k, v]) => `${k}=${String(v)}`)
                      .join(", ")})
                  </li>
                ))}
              </ul>
            </Detail>
          )}
          {diagnosis.related.length > 0 && (
            <Detail label="Impact">
              <ul className="flex flex-col gap-1 text-muted">
                {diagnosis.related.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </Detail>
          )}
          <Detail label="Affected">
            <div className="flex flex-wrap gap-2">
              {diagnosis.affected.map((ref) => (
                <span key={ref} className="font-mono text-xs text-subtle">
                  {ref}
                </span>
              ))}
            </div>
          </Detail>
        </div>
      )}
    </article>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <SectionLabel>{label}</SectionLabel>
      {children}
    </div>
  );
}
