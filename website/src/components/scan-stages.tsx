"use client";

import { useEffect, useRef, useState } from "react";

import { CLUSTER, DIAGNOSES, NAMESPACE } from "@/lib/demo";

/** How a scan works: three statements scroll past a pinned piece of the app that changes with them. */

const STATEMENTS = [
  {
    title: "Pick a cluster and a namespace.",
    line: "Clusters come from your kubeconfig. Projects decide who sees which namespaces",
  },
  {
    title: "Then KubeiQ reads, and never writes.",
    line: "Pods, events, logs and workloads, capped and bounded. Secret values are masked before any model sees them",
  },
  {
    title: "Then you get one line, and one command.",
    line: "Known failures are recognized in seconds. The rest go to the AI model you chose",
  },
];

const READ = [
  ["Pods", "9 read"],
  ["Warning events", "24 read"],
  ["Logs", "last 200 lines per container"],
  ["Workloads and services", "11 read"],
  ["Secrets", "names only"],
];

function Stage({ step }: { step: number }) {
  return (
    <div data-ui className="flex h-full flex-col rounded-xl bg-bg p-6">
      {step === 0 && (
        <div key="scope" className="line-in flex flex-col gap-5">
          <p className="text-sm font-medium text-muted">Clusters</p>
          <div className="flex flex-col gap-1 rounded-lg bg-surface-2 px-4 py-3">
            <span className="flex items-center gap-2 text-[15px] font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-healthy" />
              <code className="font-mono text-[14px]">{CLUSTER}</code>
            </span>
            <span className="text-[13px] text-muted">Kubernetes v1.37.0</span>
          </div>
          <p className="text-sm font-medium text-muted">Namespace</p>
          <div className="flex items-center justify-between rounded-lg px-4 py-3 ring-1 ring-control">
            <code className="font-mono text-[14px]">{NAMESPACE}</code>
            <span className="text-muted">▾</span>
          </div>
          <span className="mt-2 rounded-lg bg-accent px-4 py-3 text-center text-[15px] font-medium text-accent-ink">
            Investigate Cluster
          </span>
        </div>
      )}
      {step === 1 && (
        <div key="read" className="flex flex-col gap-4">
          <p className="line-in text-sm font-medium text-muted">Reading {NAMESPACE}</p>
          <ul className="flex flex-col gap-3">
            {READ.map(([what, how], i) => (
              <li
                key={what}
                className="line-in flex items-baseline justify-between gap-4 text-[15px]"
                style={{ animationDelay: `${i * 120}ms` }}
              >
                <span className="flex items-center gap-2.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-healthy" />
                  {what}
                </span>
                <span className="tnum text-muted">{how}</span>
              </li>
            ))}
          </ul>
          <p className="line-in mt-2 text-sm text-muted" style={{ animationDelay: "650ms" }}>
            Masked before the model
          </p>
          <code
            className="line-in block rounded-lg bg-terminal px-4 py-3 font-mono text-[13px] leading-6 text-terminal-fg"
            style={{ animationDelay: "750ms" }}
          >
            DATABASE_URL=••••
            <br />
            DB_PASSWORD=••••
            <br />
            Authorization: Bearer ••••
          </code>
        </div>
      )}
      {step === 2 && (
        <div key="result" className="flex flex-col gap-1">
          <p className="line-in pb-3 text-[17px] font-semibold">{DIAGNOSES.length} Issues Found</p>
          {DIAGNOSES.slice(0, 4).map((item, i) => (
            <div
              key={item.name}
              className="line-in flex items-start gap-3 rounded-lg px-1 py-2"
              style={{ animationDelay: `${i * 110}ms` }}
            >
              <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-danger" />
              <span className="flex min-w-0 flex-col">
                <span className="text-[15px] font-medium">{item.name}</span>
                <span className="truncate text-sm text-muted">{item.cause}</span>
              </span>
            </div>
          ))}
          <p className="line-in pt-2 text-sm text-muted" style={{ animationDelay: "500ms" }}>
            and {DIAGNOSES.length - 4} more, each with its fix
          </p>
        </div>
      )}
    </div>
  );
}

export function ScanStages() {
  const [step, setStep] = useState(0);
  const blocks = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    if (!("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setStep(Number((entry.target as HTMLElement).dataset.step));
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    blocks.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <>
      {/* Narrow screens: each statement with its own state, nothing pinned over the text. */}
      <ol className="flex flex-col gap-14 pt-10 lg:hidden">
        {STATEMENTS.map((s, i) => (
          <li key={s.title} className="rise flex flex-col gap-3">
            <p className="text-[22px] font-medium leading-[1.2] tracking-[-0.01em] sm:text-[30px]">
              {s.title}
            </p>
            <p className="max-w-[42ch] text-base text-muted">{s.line}</p>
            <div className="mt-3 h-[24rem] rounded-2xl bg-surface p-2">
              <Stage step={i} />
            </div>
          </li>
        ))}
      </ol>
      <div className="hidden lg:grid lg:grid-cols-12 lg:gap-8">
      <div className="sticky top-[14vh] z-10 order-2 col-span-6 col-start-7 h-[30rem] rounded-2xl bg-surface p-2">
        <Stage step={step} />
      </div>
      <ol className="order-1 col-span-5 flex flex-col">
        {STATEMENTS.map((s, i) => (
          <li
            key={s.title}
            ref={(el) => {
              blocks.current[i] = el;
            }}
            data-step={i}
            className={`flex min-h-[60vh] flex-col gap-3 ${i === 0 ? "justify-start pt-16" : "justify-center"}`}
          >
            <p
              className={`text-[30px] font-medium leading-[1.2] tracking-[-0.01em] transition-colors duration-500 ${
                step === i ? "text-fg" : "text-muted"
              }`}
            >
              {s.title}
            </p>
            <p className="max-w-[42ch] text-base text-muted">{s.line}</p>
          </li>
        ))}
      </ol>
      </div>
    </>
  );
}
