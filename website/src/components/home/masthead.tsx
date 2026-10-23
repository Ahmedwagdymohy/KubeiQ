"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { INCIDENTS, WORKLOADS } from "@/lib/incidents";
import { GITHUB_URL } from "@/lib/site";

const FAILING = WORKLOADS.filter((w) => w.failing).map((w) => w.name);
const STEP_MS = 1700;
const REST_MS = 3200;

/**
 * The first screen: the demo cluster as a mosaic, one field per workload. Failing fields turn
 * healthy one by one as their fixes land, and the caption names each root cause.
 */
export function Masthead() {
  const [fixed, setFixed] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const delay = fixed === 0 ? 2200 : fixed >= FAILING.length ? REST_MS : STEP_MS;
    const timer = setTimeout(() => setFixed((n) => (n >= FAILING.length ? 0 : n + 1)), delay);
    return () => clearTimeout(timer);
  }, [fixed]);

  const done = new Set(FAILING.slice(0, fixed));
  const last = fixed > 0 ? INCIDENTS.find((i) => i.workload === FAILING[fixed - 1]) : undefined;
  const left = FAILING.length - fixed;

  return (
    <section className="flex min-h-[calc(100svh-5rem)] flex-col">
      <div
        aria-label="Demo cluster: one field per workload"
        role="img"
        className="grid h-[38svh] min-h-60 grid-cols-3 sm:grid-cols-6 lg:grid-cols-9"
      >
        {WORKLOADS.map((w) => {
          const bad = w.failing && !done.has(w.name);
          return (
            <div
              key={w.name}
              className={`tile flex flex-col justify-start overflow-hidden px-5 py-2 text-field-ink lg:py-4 ${
                bad ? "bg-tile-bad" : "bg-field"
              } ${w.failing && done.has(w.name) && FAILING[fixed - 1] === w.name ? "just-fixed" : ""}`}
            >
              <span className="truncate text-[13px] font-semibold lg:text-sm">{w.name}</span>
              <span className="hidden truncate text-[13px] opacity-75 lg:block">
                {bad ? "Failing" : w.namespace}
              </span>
            </div>
          );
        })}
      </div>

      <div className="frame flex flex-1 flex-col gap-10 pb-12 pt-12 lg:flex-row-reverse lg:items-end lg:justify-between lg:gap-8 lg:pb-16">
        <div className="flex flex-col gap-8 lg:w-[calc(58vw-var(--m))]">
          <h1 className="t-display">
            <span className="mask-line">
              <span>Why it broke.</span>
            </span>
            <span className="mask-line">
              <span>How to fix it.</span>
            </span>
          </h1>
          <div className="after-mask flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link
              href="/install"
              className="rounded-md bg-primary px-7 py-4 font-semibold text-primary-ink transition-transform hover:-translate-y-0.5 active:translate-y-0"
            >
              Get Started
            </Link>
            <a
              href={GITHUB_URL}
              className="font-medium underline decoration-2 underline-offset-[6px] transition-colors hover:text-accent"
            >
              View on GitHub
            </a>
          </div>
        </div>
        <div className="after-mask flex max-w-[34ch] flex-col gap-6">
          <p className="text-[17px] text-fg">
            KubeiQ is open-source AI for Kubernetes. It reads your cluster, names the root cause in
            one line and hands you the exact commands to fix it.
          </p>
          <p className="min-h-[3lh] text-sm text-muted" aria-live="polite">
            {last ? (
              <>
                <span className="font-semibold text-fg">{last.workload}</span> fixed:{" "}
                {last.rootCause}. {left ? `${left} still failing` : "Every workload is healthy"}
              </>
            ) : (
              `${FAILING.length} of ${WORKLOADS.length} workloads failing in the demo cluster`
            )}
          </p>
        </div>
      </div>
    </section>
  );
}
