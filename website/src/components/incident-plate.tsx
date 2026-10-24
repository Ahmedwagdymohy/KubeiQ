"use client";

import { useState } from "react";
import type { ReactNode } from "react";

import { CommandLines } from "@/components/command-block";
import { rise } from "@/components/ui";
import { FINDINGS, SCAN } from "@/lib/voyage";

const finding = FINDINGS[0];

type Part = "cause" | "confidence" | "fix" | "placeholder" | "check" | "affected";

const NOTES: Record<Part, { title: string; text: string }> = {
  cause: {
    title: "Root Cause in One Line",
    text: "The exact resource and setting, no essay. Here, one missing variable behind 126 restarts",
  },
  confidence: {
    title: "A Number You Can Weigh",
    text: "Confidence from the evidence: how certain the check was and how many pods agree",
  },
  fix: {
    title: "Commands You Can Paste",
    text: "Real names from your cluster: the deployment, the container, the namespace",
  },
  placeholder: {
    title: "Only What It Cannot Know",
    text: "A value KubeiQ cannot see is named for what it holds and highlighted",
  },
  check: {
    title: "Proof the Fix Landed",
    text: "Checks run against the workload, never a pod name the fix will replace",
  },
  affected: {
    title: "Everything It Touched",
    text: "The deployment and each failing pod, ready to open in Cluster Manager or on the map",
  },
};

/** One plate from the product (an incident as Cluster Doctor shows it) with notes in both margins. */
export function IncidentPlate() {
  const [hot, setHot] = useState<Part | null>(null);

  const note = (part: Part, align: "left" | "right") => (
    <button
      type="button"
      onMouseEnter={() => setHot(part)}
      onMouseLeave={() => setHot(null)}
      onFocus={() => setHot(part)}
      onBlur={() => setHot(null)}
      className={`flex max-w-[26ch] flex-col gap-1.5 text-left lg:max-w-[24ch] ${
        align === "left" ? "lg:ml-auto lg:items-end lg:text-right" : ""
      }`}
    >
      <span className={`text-lg font-bold leading-snug transition-colors ${hot === part ? "text-accent" : ""}`}>
        {NOTES[part].title}
      </span>
      <span className="text-base leading-relaxed text-muted">{NOTES[part].text}</span>
    </button>
  );

  const ring = (part: Part) =>
    `rounded-md outline outline-2 outline-offset-4 transition-[outline-color] duration-150 ${
      hot === part ? "outline-accent" : "outline-transparent"
    }`;

  /** One row: a note left, a slice of the panel, a note right. On a phone both notes go under it. */
  const row = (left: Part, right: Part, edge: "top" | "middle" | "bottom", align: string, slice: ReactNode) => (
    <>
      <div className={`hidden lg:block ${align}`}>{note(left, "left")}</div>
      <div
        data-ui
        className={`w-full max-w-[400px] justify-self-center border-x border-border bg-bg px-5 ${
          edge === "top" ? "rounded-t-lg border-t pt-5" : ""
        } ${edge === "bottom" ? "rounded-b-lg border-b pb-5" : ""}`}
      >
        {slice}
      </div>
      <div className={`hidden lg:block ${align}`}>{note(right, "right")}</div>
      <div className="mx-auto mb-10 mt-6 grid w-full max-w-[400px] grid-cols-2 gap-5 lg:hidden">
        {note(left, "right")}
        {note(right, "right")}
      </div>
    </>
  );

  return (
    <div className="flex flex-col gap-12">
      <div className="grid lg:grid-cols-[1fr_400px_1fr] lg:gap-x-12">
        <h2
          data-rise
          className="text-[clamp(30px,3vw,44px)] font-extrabold leading-[1.02] tracking-[-0.03em] lg:text-right"
        >
          One Finding, Start to Finish
        </h2>
        <p data-rise style={rise(1)} className="mt-4 max-w-[40ch] text-lg leading-relaxed lg:col-start-3 lg:mt-0">
          This is how Cluster Doctor reports the payment deployment. Point at a note to find its part
        </p>
      </div>

      <div data-rise style={rise(2)} className="grid lg:grid-cols-[1fr_400px_1fr] lg:gap-x-12">
        {row(
          "cause",
          "confidence",
          "top",
          "self-start pt-16",
          <>
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="flex items-center gap-2 text-lg font-bold">
                  <span className="h-2.5 w-2.5 rounded-full bg-danger" aria-hidden />
                  {finding.name}
                </span>
                <span className="text-sm text-muted">
                  {finding.kind} in {SCAN.namespace}
                </span>
              </div>
              <span className={`px-1 text-sm text-muted ${ring("confidence")}`}>
                <span className="text-xl font-bold tabular-nums text-fg">{finding.confidence}</span> confidence
              </span>
            </div>
            <p className={`mt-4 text-lg font-bold leading-snug ${ring("cause")}`}>{finding.rootCause}</p>
            <p className="mt-2 pb-5 text-sm leading-relaxed text-muted">{finding.explanation}</p>
          </>,
        )}
        {row(
          "fix",
          "placeholder",
          "middle",
          "self-center",
          <div className="border-t border-border pb-5 pt-5">
            <p className="text-sm font-semibold">How to fix</p>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{finding.fix[0]}</p>
            <div className={`mt-3 ${ring("fix")}`}>
              <CommandLines commands={finding.commands} />
            </div>
            <p className={`mt-3 inline-block px-1 pb-0.5 text-[13px] text-muted ${ring("placeholder")}`}>
              Replace the highlighted values
            </p>
          </div>,
        )}
        {row(
          "check",
          "affected",
          "bottom",
          "self-center",
          <div className="border-t border-border pt-5">
            <p className="text-sm font-semibold">Check that it worked</p>
            <div className={`mt-3 ${ring("check")}`}>
              <CommandLines commands={finding.verify} />
            </div>
            <p className="mt-5 text-sm font-semibold">Affected resources</p>
            <ul className={`mt-2 flex flex-col gap-1 text-[13px] leading-6 text-muted ${ring("affected")}`}>
              {finding.affected.map((ref) => (
                <li key={ref} className="truncate">
                  <code className="font-mono">{ref}</code>
                </li>
              ))}
            </ul>
          </div>,
        )}
      </div>
    </div>
  );
}
