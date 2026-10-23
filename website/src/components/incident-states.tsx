"use client";

import { useState } from "react";

import { ChevronDownIcon } from "@/components/icons";
import { CommandText, CopyButton } from "@/components/command-block";
import { DIAGNOSES, NAMESPACE } from "@/lib/demo";

/** The payment incident three times: as it arrives, opened, and after the fix. The middle one works. */

const d = DIAGNOSES[0];

function Head({ open, onToggle }: { open?: boolean; onToggle?: () => void }) {
  return (
    <div className="flex items-start gap-4">
      <span className="mt-2.5 h-2 w-2 shrink-0 rounded-full bg-danger" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex flex-wrap items-baseline gap-x-3">
          <span className="text-[17px] font-semibold">{d.name}</span>
          <span className="text-sm text-muted">
            {d.kind} in {NAMESPACE}
          </span>
        </p>
        <p className="text-[15px]">{d.cause}</p>
      </div>
      <span className="tnum pt-0.5 text-sm text-muted">{d.confidence}%</span>
      {onToggle ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={open ? "Collapse incident" : "Expand incident"}
          className="rounded p-1 text-muted transition-[color,transform] hover:text-fg active:scale-90"
        >
          <ChevronDownIcon className={`transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      ) : (
        <span className="p-1 text-muted">
          <ChevronDownIcon />
        </span>
      )}
    </div>
  );
}

export function IncidentStates() {
  const [open, setOpen] = useState(true);
  const rows = [
    {
      word: "Found",
      body: (
        <div data-ui className="rounded-xl bg-bg p-5">
          <Head />
        </div>
      ),
    },
    {
      word: "Read",
      body: (
        <div data-ui className="rounded-xl bg-bg p-5 ring-1 ring-control">
          <Head open={open} onToggle={() => setOpen((v) => !v)} />
          {open && (
            <div className="line-in mt-5 flex flex-col gap-3 pl-6">
              <p className="text-sm font-medium">How to Fix</p>
              <p className="text-sm text-muted">{d.step}</p>
              <div className="flex items-start gap-3 rounded-lg bg-terminal px-4 py-3">
                <code aria-hidden className="select-none font-mono text-[13px] leading-6 text-accent">
                  $
                </code>
                <code className="min-w-0 flex-1 whitespace-pre-wrap break-all font-mono text-[13px] leading-6 text-terminal-fg">
                  <CommandText command={d.fix[0]} />
                </code>
                <CopyButton text={d.fix[0]} />
              </div>
              <p className="text-sm text-muted">Replace the highlighted value with your database URL</p>
            </div>
          )}
        </div>
      ),
    },
    {
      word: "Fixed",
      body: (
        <div data-ui className="flex items-start gap-4 rounded-xl bg-bg p-5">
          <span className="mt-2.5 h-2 w-2 shrink-0 rounded-full bg-healthy" />
          <div className="flex flex-col gap-1">
            <p className="text-[17px] font-semibold">No Issues Found</p>
            <p className="text-[15px] text-muted">
              Checked 2 pods, 1 workload and 14 warning events in namespace {NAMESPACE}. payment
              is running
            </p>
          </div>
        </div>
      ),
    },
  ];

  return (
    <ol className="flex flex-col gap-10 lg:gap-14">
      {rows.map((row, i) => (
        <li
          key={row.word}
          className="rise grid gap-3 lg:grid-cols-[minmax(0,3fr)_minmax(0,7fr)_minmax(0,2fr)] lg:items-start lg:gap-8"
          style={{ "--d": `${i * 90}ms` } as React.CSSProperties}
        >
          <p className="order-2 text-[17px] text-muted lg:order-1 lg:pt-4 lg:text-right lg:text-[22px]">
            {row.word}
          </p>
          <div className="order-1 min-w-0 rounded-2xl bg-surface p-2 lg:order-2">{row.body}</div>
        </li>
      ))}
    </ol>
  );
}
