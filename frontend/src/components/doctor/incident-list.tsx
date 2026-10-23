"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { ChevronIcon } from "@/components/icons";
import { Dot, hasPlaceholder, RichText, Terminal } from "@/components/ui";
import type { Diagnosis } from "@/lib/api";

function parseWorkload(ref: string): { kind: string; namespace: string | null; name: string } {
  const parts = ref.split("/");
  return parts.length === 3
    ? { kind: parts[0], namespace: parts[1], name: parts[2] }
    : { kind: parts[0], namespace: null, name: parts.at(-1) ?? ref };
}

/** The incident a resource belongs to: its own workload, or one it affects. */
function matches(diagnosis: Diagnosis, ref: string): boolean {
  return diagnosis.workload === ref || diagnosis.affected.includes(ref);
}

export function IncidentList({
  diagnoses,
  focus = null,
}: {
  diagnoses: Diagnosis[];
  focus?: string | null;
}) {
  const focused = focus ? diagnoses.find((d) => matches(d, focus)) : undefined;
  const [open, setOpen] = useState<string | null>(
    (focused ?? diagnoses[0])?.incident_id ?? null,
  );
  return (
    <ul className="flex flex-col gap-px">
      {diagnoses.map((diagnosis) => (
        <IncidentRow
          key={diagnosis.incident_id}
          diagnosis={diagnosis}
          focused={diagnosis === focused}
          expanded={open === diagnosis.incident_id}
          onToggle={() =>
            setOpen((current) => (current === diagnosis.incident_id ? null : diagnosis.incident_id))
          }
        />
      ))}
    </ul>
  );
}

function IncidentRow({
  diagnosis,
  focused,
  expanded,
  onToggle,
}: {
  diagnosis: Diagnosis;
  focused: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { kind, namespace, name } = parseWorkload(diagnosis.workload);
  const row = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (focused) row.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [focused]);
  return (
    <li
      ref={row}
      className={`scroll-mt-4 bg-bg ${focused ? "shadow-[inset_2px_0_0_var(--accent)]" : ""}`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-start gap-4 px-6 py-5 text-left transition-colors hover:bg-surface sm:px-8"
      >
        <span className="pt-2">
          <Dot tone={diagnosis.severity} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-semibold text-fg">{name}</span>
            <span className="font-mono text-xs text-subtle">
              {kind}
              {namespace ? `/${namespace}` : ""}
            </span>
          </span>
          <span className={`text-fg/90 ${expanded ? "" : "line-clamp-2"}`}>
            <RichText text={diagnosis.root_cause} />
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-3 pt-0.5">
          <span className="text-sm tabular-nums text-muted" title="Confidence">
            {diagnosis.confidence}%
          </span>
          <ChevronIcon
            className={`text-subtle transition-transform ${expanded ? "rotate-90" : ""}`}
          />
        </span>
      </button>

      {expanded && (
        <div className="flex flex-col gap-6 px-6 pb-8 pl-[3.25rem] sm:px-8 sm:pl-[3.75rem]">
          {diagnosis.fix_steps.length > 0 && (
            <Block title="How to Fix">
              <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-fg/90">
                {diagnosis.fix_steps.map((step) => (
                  <li key={step}>
                    <RichText text={step} />
                  </li>
                ))}
              </ol>
            </Block>
          )}

          {diagnosis.commands.length > 0 && (
            <div className="flex flex-col gap-2">
              <Terminal commands={diagnosis.commands} />
              {diagnosis.commands.some(hasPlaceholder) && (
                <p className="text-sm text-muted">
                  Replace the <span className="text-warning">highlighted</span> values before
                  running.
                </p>
              )}
            </div>
          )}

          {(diagnosis.verify ?? []).length > 0 && (
            <Block title="Check That It Worked">
              <Terminal commands={diagnosis.verify ?? []} />
            </Block>
          )}

          <Block title="Why It Happens">
            <p className="text-muted">
              <RichText text={diagnosis.explanation} />
            </p>
          </Block>

          {diagnosis.prevention && (
            <Block title="Prevent It Next Time">
              <p className="text-muted">
                <RichText text={diagnosis.prevention} />
              </p>
            </Block>
          )}

          {diagnosis.related.length > 0 && (
            <Block title="Impact">
              <ul className="flex flex-col gap-1 text-muted">
                {diagnosis.related.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </Block>
          )}

          <Block title="Affected Resources">
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {diagnosis.affected.map((ref) => (
                <span key={ref} className="font-mono text-sm text-subtle">
                  {ref}
                </span>
              ))}
            </div>
          </Block>

          {diagnosis.note && <p className="text-sm text-warning">{diagnosis.note}</p>}
        </div>
      )}
    </li>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h4 className="text-sm font-semibold text-fg">{title}</h4>
      {children}
    </section>
  );
}
