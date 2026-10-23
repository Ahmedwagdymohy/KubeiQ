"use client";

import { useRef, useState } from "react";
import type { KeyboardEvent } from "react";

import { CommandLines } from "@/components/command-block";
import { HelmWheel } from "@/components/helm-wheel";
import { rise } from "@/components/ui";
import { FINDINGS, SCAN } from "@/lib/voyage";

const pad = (n: number) => String(n).padStart(3, "0");

/**
 * The live thing: steer the wheel to one of the nine broken workloads from a real scan and read its
 * log entry: position, observation (root cause), action (fix) and the check that proves it.
 */
export function BearingFinder() {
  const [index, setIndex] = useState(0);
  const [turn, setTurn] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const finding = FINDINGS[index];

  // Turn the wheel the short way round to the new bearing, so it never spins backwards a full lap.
  const select = (next: number, focus = false) => {
    const n = (next + FINDINGS.length) % FINDINGS.length;
    const target = FINDINGS[n].bearing;
    const current = ((turn % 360) + 360) % 360;
    let delta = target - current;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    setTurn(turn + delta);
    setIndex(n);
    if (focus) buttons.current[n]?.focus();
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      e.preventDefault();
      select(index + 1, true);
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      e.preventDefault();
      select(index - 1, true);
    }
  };

  return (
    <div className="grid gap-8 md:grid-cols-12 md:gap-6">
      <div className="flex min-w-0 flex-col gap-8 md:col-span-5">
        <div className="flex flex-col gap-5">
          <h2 data-rise className="text-[clamp(34px,4vw,60px)] font-extrabold leading-[0.98] tracking-[-0.035em]">
            Steer to What Broke
          </h2>
          <p data-rise style={rise(1)} className="max-w-[44ch] text-lg leading-relaxed">
            A real scan of the {SCAN.namespace} namespace found {FINDINGS.length} failing workloads.
            Pick one, or turn the wheel, and read its entry in the log
          </p>
        </div>
        <div
          role="listbox"
          aria-label="Failing workloads"
          onKeyDown={onKey}
          data-rise
          style={rise(2)}
          className="no-scrollbar -mx-4 flex snap-x scroll-px-4 gap-5 overflow-x-auto px-4 md:mx-0 md:flex-col md:gap-0 md:overflow-visible md:px-0"
        >
          {FINDINGS.map((f, i) => {
            const on = i === index;
            return (
              <button
                key={f.name}
                ref={(el) => {
                  buttons.current[i] = el;
                }}
                type="button"
                role="option"
                aria-selected={on}
                tabIndex={on ? 0 : -1}
                onClick={() => select(i)}
                className={`group flex shrink-0 snap-start items-baseline gap-3 py-1 text-left text-[22px] font-extrabold leading-[1.12] tracking-[-0.03em] transition-colors md:text-[clamp(26px,2.6vw,40px)] ${
                  on ? "text-fg" : "text-muted hover:text-fg"
                }`}
              >
                <span className="whitespace-nowrap">{f.name}</span>
                <span
                  className={`hidden text-base font-semibold tracking-normal tabular-nums md:inline ${on ? "text-fg" : "text-subtle"}`}
                >
                  {pad(f.bearing)}°
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div
        data-rise
        style={rise(2)}
        className="relative h-[78svh] max-h-[860px] min-h-[600px] overflow-hidden bg-surface md:col-span-7 md:h-[88svh]"
      >
        <div
          data-ui
          aria-live="polite"
          className="absolute left-3 right-3 top-4 rounded-md bg-bg text-fg sm:left-8 sm:right-auto sm:top-[72px] sm:w-[560px] lg:left-16"
        >
          <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-3 text-[13px] font-medium text-muted">
            <span>
              Log of <code className="font-mono">{SCAN.cluster}</code>
            </span>
            <span className="tabular-nums">
              {SCAN.date}, {SCAN.finished}
            </span>
          </div>

          <div key={finding.name} className="animate-[fade_200ms_ease-out]">
            <div className="flex items-center gap-4 px-5 pb-4 pt-5">
              <button
                type="button"
                onClick={() => select(index + 1)}
                aria-label="Turn the wheel to the next workload"
                className="press shrink-0 rounded-full text-fg transition-colors hover:text-accent"
              >
                <HelmWheel
                  className="h-[72px] w-[72px] transition-transform duration-700 ease-[cubic-bezier(.22,1,.36,1)] motion-reduce:transition-none"
                  style={{ transform: `rotate(${turn}deg)` }}
                  cubeColor="var(--accent)"
                />
              </button>
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-[13px] font-medium text-muted">
                  Bearing <span className="tabular-nums text-fg">{pad(finding.bearing)}°</span>
                  <span className="mx-2 text-subtle">·</span>
                  Confidence <span className="tabular-nums text-fg">{finding.confidence}</span>
                </span>
                <span className="flex items-center gap-2 text-xl font-bold">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-danger" aria-hidden />
                  <span className="truncate">{finding.name}</span>
                </span>
                <span className="text-sm text-muted">
                  {finding.kind} in {SCAN.namespace}
                </span>
              </div>
            </div>

            <dl className="flex flex-col text-base">
              <div className="grid gap-1 border-t border-border px-5 py-4 sm:grid-cols-[96px_1fr] sm:gap-4">
                <dt className="font-medium text-muted">Position</dt>
                <dd className="min-w-0 break-all">
                  <code className="font-mono text-[13px] leading-6">
                    {finding.kind}/{SCAN.namespace}/{finding.name}
                  </code>
                </dd>
              </div>
              <div className="grid gap-1 border-t border-border px-5 py-4 sm:grid-cols-[96px_1fr] sm:gap-4">
                <dt className="font-medium text-muted">Observed</dt>
                <dd className="flex flex-col gap-1.5">
                  <span className="text-lg font-bold leading-snug">{finding.rootCause}</span>
                  <span className="text-muted">{finding.fix[0]}</span>
                </dd>
              </div>
              <div className="grid gap-2 border-t border-border px-5 py-4 sm:grid-cols-[96px_1fr] sm:gap-4">
                <dt className="font-medium text-muted">Action</dt>
                <dd className="min-w-0">
                  <CommandLines commands={finding.commands} />
                </dd>
              </div>
              <div className="grid gap-2 border-t border-border px-5 py-4 sm:grid-cols-[96px_1fr] sm:gap-4">
                <dt className="font-medium text-muted">Check</dt>
                <dd className="min-w-0">
                  <CommandLines commands={finding.verify} />
                </dd>
              </div>
              <div className="grid gap-1 border-t border-border px-5 py-4 sm:grid-cols-[96px_1fr] sm:gap-4">
                <dt className="font-medium text-muted">Affected</dt>
                <dd className="flex min-w-0 flex-col gap-1">
                  {finding.affected.map((ref) => (
                    <code key={ref} className="truncate font-mono text-[13px] leading-6">
                      {ref}
                    </code>
                  ))}
                </dd>
              </div>
              {finding.prevention && (
                <div className="grid gap-1 border-t border-border px-5 py-4 sm:grid-cols-[96px_1fr] sm:gap-4">
                  <dt className="font-medium text-muted">Next time</dt>
                  <dd>{finding.prevention}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
