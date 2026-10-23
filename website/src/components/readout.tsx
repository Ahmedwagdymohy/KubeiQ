"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { CommandText, CopyButton } from "@/components/command-block";
import { DIAGNOSES, NAMESPACE } from "@/lib/demo";

/**
 * The live readout: pick a broken workload from the demo namespace and watch Cluster Doctor's
 * diagnosis assemble: what it read (secrets masked), the one-line root cause, the fix command
 * typed out, then the check. The finished payment diagnosis is in the HTML, so it reads without script.
 */

const LINE_MS = 300;
const CHARS_PER_FRAME = 3;

type Run = { stage: number; typed: number };

function Masked({ text }: { text: string }) {
  return (
    <>
      {text.split(/(••••)/).map((part, i) =>
        part === "••••" ? (
          <span key={i} className="rounded bg-surface-2 px-1 text-fg">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}

export function Readout() {
  const [index, setIndex] = useState(0);
  const d = DIAGNOSES[index];
  const fixText = d.fix.join("\n");
  const evidenceCount = d.evidence.length;
  // Stages: 1..n evidence lines, n+1 cause, n+2 typing, n+3 check, n+4 done.
  const done: Run = { stage: evidenceCount + 4, typed: fixText.length };
  const [run, setRun] = useState<Run>(done);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const root = useRef<HTMLDivElement>(null);

  const play = useCallback((i: number) => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    const diag = DIAGNOSES[i];
    const text = diag.fix.join("\n");
    const n = diag.evidence.length;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setRun({ stage: n + 4, typed: text.length });
      return;
    }
    setRun({ stage: 0, typed: 0 });
    const at = (ms: number, fn: () => void) => timers.current.push(setTimeout(fn, ms));
    for (let k = 1; k <= n; k++) at(260 + k * LINE_MS, () => setRun({ stage: k, typed: 0 }));
    const causeAt = 260 + (n + 1) * LINE_MS + 120;
    at(causeAt, () => setRun({ stage: n + 1, typed: 0 }));
    const typeAt = causeAt + 450;
    const frames = Math.ceil(text.length / CHARS_PER_FRAME);
    for (let f = 1; f <= frames; f++) {
      at(typeAt + f * 16, () =>
        setRun({ stage: n + 2, typed: Math.min(text.length, f * CHARS_PER_FRAME) }),
      );
    }
    const checkAt = typeAt + frames * 16 + 450;
    at(checkAt, () => setRun({ stage: n + 3, typed: text.length }));
    at(checkAt + 500, () => setRun({ stage: n + 4, typed: text.length }));
  }, []);

  // Play once when the readout first comes into view.
  useEffect(() => {
    const el = root.current;
    if (!el || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          play(0);
          observer.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    observer.observe(el);
    const pending = timers.current;
    return () => {
      observer.disconnect();
      pending.forEach(clearTimeout);
    };
  }, [play]);

  const choose = (i: number) => {
    setIndex(i);
    play(i);
  };

  const n = evidenceCount;
  const typing = run.stage === n + 2;
  const shownFix = fixText.slice(0, run.typed).split("\n");

  return (
    <div
      ref={root}
      data-ui
      className="grid overflow-hidden rounded-2xl bg-surface p-2 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]"
    >
      <div className="flex flex-col p-3 lg:p-4">
        <p className="px-2 pb-3 text-sm text-muted">
          <code className="font-mono text-[13px] text-fg">{NAMESPACE}</code>, {DIAGNOSES.length}{" "}
          broken
        </p>
        <ul className="grid grid-cols-2 gap-1 sm:grid-cols-4 lg:grid-cols-1">
          {DIAGNOSES.map((item, i) => (
            <li key={item.name}>
              <button
                type="button"
                onClick={() => choose(i)}
                aria-pressed={i === index}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-[background-color,color,transform] active:scale-[0.98] ${
                  i === index ? "bg-bg text-fg" : "text-muted hover:bg-surface-2 hover:text-fg"
                }`}
              >
                <span className="h-2 w-2 shrink-0 rounded-full bg-danger" />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[15px] font-medium">{item.name}</span>
                  <span className="text-[13px] text-muted">{item.kind}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex min-h-[34rem] min-w-0 flex-col gap-6 rounded-xl bg-bg p-5 sm:p-8" aria-live="polite">
        <div className="flex items-baseline justify-between gap-4">
          <p className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-xl font-semibold">{d.name}</span>
            <span className="text-[15px] text-muted">
              {d.kind} in {NAMESPACE}
            </span>
          </p>
          <span className="tnum shrink-0 text-[15px] text-muted">
            {run.stage > n ? `${d.confidence}%` : "Reading"}
          </span>
        </div>

        <ul className="flex flex-col gap-1.5">
          {d.evidence.map((line, k) =>
            run.stage > k ? (
              <li key={`${d.name}-${k}`} className="line-in">
                <code className="block truncate font-mono text-[13px] leading-6 text-muted">
                  <Masked text={line} />
                </code>
              </li>
            ) : (
              <li key={`${d.name}-${k}`} aria-hidden className="h-6" />
            ),
          )}
        </ul>

        <p
          className={`text-[22px] font-medium leading-snug tracking-[-0.01em] transition-opacity duration-500 sm:text-[26px] ${
            run.stage > n ? "opacity-100" : "opacity-0"
          }`}
        >
          {d.cause}
        </p>

        <div
          className={`flex flex-col gap-3 transition-opacity duration-500 ${
            run.stage > n + 1 ? "opacity-100" : "opacity-0"
          }`}
        >
          <p className="text-[15px] font-medium">How to Fix</p>
          <p className="text-[15px] text-muted">{d.step}</p>
          <div className="rounded-lg bg-terminal py-3">
            {d.fix.map((command, k) => (
              <div key={command} className="flex items-start gap-3 px-4 py-1">
                <code aria-hidden className="select-none font-mono text-[13px] leading-6 text-accent">
                  $
                </code>
                <code className="min-w-0 flex-1 whitespace-pre-wrap break-all font-mono text-[13px] leading-6 text-terminal-fg">
                  <CommandText command={shownFix[k] ?? ""} />
                  {typing && k === shownFix.length - 1 && (
                    <span className="caret ml-px inline-block h-4 w-2 translate-y-0.5 bg-terminal-fg/70" />
                  )}
                </code>
                <CopyButton text={command} />
              </div>
            ))}
          </div>
        </div>

        <div
          className={`flex flex-col gap-3 transition-opacity duration-500 ${
            run.stage > n + 2 ? "opacity-100" : "opacity-0"
          }`}
        >
          <p className="text-[15px] font-medium">Check That It Worked</p>
          <div className="rounded-lg bg-terminal py-3">
            {d.check.map((command) => (
              <div key={command} className="flex items-start gap-3 px-4 py-1">
                <code aria-hidden className="select-none font-mono text-[13px] leading-6 text-accent">
                  $
                </code>
                <code className="min-w-0 flex-1 whitespace-pre-wrap break-all font-mono text-[13px] leading-6 text-terminal-fg">
                  {command}
                </code>
                <CopyButton text={command} />
              </div>
            ))}
          </div>
        </div>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-2 text-sm text-muted">
          <span>Read-only. Nothing in {NAMESPACE} was changed</span>
          <button
            type="button"
            onClick={() => play(index)}
            className="rounded-md px-2 py-1 font-medium text-fg transition-[background-color,transform] hover:bg-surface-2 active:scale-95"
          >
            Read Again
          </button>
        </div>
      </div>
    </div>
  );
}
