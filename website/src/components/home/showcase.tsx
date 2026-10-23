"use client";

import { useState, type ReactNode } from "react";

import { INCIDENTS } from "@/lib/incidents";

const payment = INCIDENTS[0];

function Row({ children, active = false }: { children: ReactNode; active?: boolean }) {
  return (
    <div
      data-ui
      className={`w-full max-w-[640px] rounded-lg border bg-bg text-left transition-colors ${
        active ? "border-control" : "border-border"
      }`}
    >
      {children}
    </div>
  );
}

function Head({ dot, status }: { dot: string; status: string }) {
  return (
    <div className="flex items-center gap-3 px-5 py-4">
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} />
      <span className="font-semibold">{payment.workload}</span>
      <span className="truncate text-sm text-muted">Deployment in kubeiq-demo</span>
      <span className="ml-auto shrink-0 text-sm text-muted">{status}</span>
    </div>
  );
}

function Command({ text }: { text: string }) {
  return (
    <pre className="overflow-x-auto rounded-md bg-terminal px-4 py-3 text-[13px] leading-6 text-terminal-fg">
      <code>
        <span className="select-none text-accent">$ </span>
        {text.split(/(<[a-z-]+>)/).map((part, i) =>
          i % 2 ? (
            <span key={i} className="text-terminal-warn">
              {part}
            </span>
          ) : (
            part
          ),
        )}
      </code>
    </pre>
  );
}

function Fixed() {
  return (
    <Row>
      <Head dot="bg-accent" status={`${payment.confidence}% sure`} />
      <div className="flex flex-col gap-3 px-5 pb-5">
        <p className="text-[17px] font-medium">{payment.rootCause}</p>
        <Command text={payment.commands[0]} />
        <p className="text-sm text-muted">Then check it worked</p>
        <Command text={payment.verify[0]} />
      </div>
    </Row>
  );
}

function State({ word, children }: { word: string; children: ReactNode }) {
  return (
    <div className="grid gap-3 md:grid-cols-12 md:items-start md:gap-6">
      <p className="t-statement order-2 text-muted md:order-none md:col-span-3 md:pt-3 md:text-right">
        {word}
      </p>
      <div className="min-w-0 md:col-span-7 lg:col-span-6">{children}</div>
    </div>
  );
}

/** The product's central row, three times: as it arrives, being investigated, and fixed. */
export function Showcase() {
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");
  const investigate = () => {
    setPhase("running");
    setTimeout(() => setPhase("done"), 1800);
  };

  return (
    <section className="frame py-32 sm:py-44">
      <div data-reveal className="flex flex-col gap-14">
        <div className="md:grid md:grid-cols-12 md:gap-6">
          <h2 className="t-title md:col-span-9 md:col-start-4">One Incident, Three States</h2>
        </div>

        <State word="It breaks at 3 a.m.">
          <Row>
            <Head dot="bg-danger" status="2 min ago" />
            <p className="px-5 pb-4 text-[15px] text-muted">{payment.symptom}</p>
          </Row>
        </State>

        <State word="You press one button">
          {phase === "done" ? (
            <div className="flex flex-col items-start gap-3">
              <Fixed />
              <button
                type="button"
                onClick={() => setPhase("idle")}
                className="text-sm text-muted underline-offset-4 hover:text-fg hover:underline"
              >
                Run it again
              </button>
            </div>
          ) : (
            <Row active>
              <Head dot="bg-danger" status="2 min ago" />
              <div className="flex flex-wrap items-center gap-3 px-5 pb-4">
                <p className="mr-auto text-[15px] text-muted">{payment.symptom}</p>
                <button
                  type="button"
                  onClick={investigate}
                  disabled={phase === "running"}
                  className="rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-ink transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-70"
                >
                  {phase === "running" ? "Investigating" : "Investigate"}
                </button>
              </div>
              {phase === "running" && (
                <div className="relative mx-5 mb-5 h-0.5 overflow-hidden rounded-full bg-surface-2">
                  <div className="scan-bar absolute inset-y-0 w-1/4 rounded-full bg-accent" />
                </div>
              )}
            </Row>
          )}
        </State>

        <State word="You get the fix">
          <Fixed />
        </State>
      </div>
    </section>
  );
}
