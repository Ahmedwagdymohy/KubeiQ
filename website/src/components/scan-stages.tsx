"use client";

import Image from "next/image";
import { useState } from "react";

import { rise } from "@/components/ui";
import { SCAN } from "@/lib/voyage";

const STAGES = [
  {
    name: "Read the Cluster",
    text: `Pods, events, workloads, services, nodes and logs, read with the access your kubeconfig already has. Secret values are never read`,
    picture: "/screens/stage-read.jpg",
    alt: "Cluster Manager listing the pods of kubeiq-demo with their status and restarts",
    tone: "bg-tide-1 text-white",
  },
  {
    name: "Name the Cause",
    text: "Known failures are recognized in seconds and their symptoms grouped under one root cause: 126 restarts of payment become one missing variable",
    picture: "/screens/stage-cause.jpg",
    alt: "Cluster Doctor naming the root cause of payment: environment variable DATABASE_URL is missing",
    tone: "bg-tide-2 text-white",
  },
  {
    name: "Dig Deeper",
    text: "When the cause is unclear, an AI agent reads previous logs, ConfigMaps and related resources with read-only tools. Passwords and tokens are masked first",
    picture: "/screens/stage-dig.jpg",
    alt: "The investigation steps: evidence collected, problems found, and the agent checking orders and queue-worker",
    tone: "bg-tide-3 text-field-ink",
  },
  {
    name: "Fix and Check",
    text: "Commands with your real names, filled from the cluster, and the command that proves the fix rolled out. Changes stay off until an admin turns them on",
    picture: "/screens/stage-fix.jpg",
    alt: "The fix command for payment and the commands that check the rollout",
    tone: "bg-tide-4 text-field-ink",
  },
];

/** How a scan runs: four stages as one accordion, dark to light, like water getting shallower. */
export function ScanStages() {
  const [open, setOpen] = useState(0);
  return (
    <div className="flex flex-col gap-16">
      <div className="grid gap-6 md:grid-cols-12">
        <h2 data-rise className="text-[clamp(34px,4vw,60px)] font-extrabold leading-[0.98] tracking-[-0.035em] md:col-span-5">
          How a Scan Runs
        </h2>
        <p data-rise style={rise(1)} className="max-w-[52ch] text-lg leading-relaxed md:col-span-6 md:col-start-7">
          Every scan takes the same four steps, and none of them changes your cluster. The one on this
          page took {SCAN.seconds} seconds and checked {SCAN.checked.pods} pods, {SCAN.checked.workloads}{" "}
          workloads, {SCAN.checked.events} events and {SCAN.checked.logs} logs
        </p>
      </div>

      <div data-rise style={rise(2)} className="flex flex-col md:h-[540px] md:flex-row">
        {STAGES.map((stage, i) => {
          const on = i === open;
          return (
            <div
              key={stage.name}
              className={`${stage.tone} relative overflow-hidden transition-[flex-grow,flex-basis] duration-[450ms] ease-[cubic-bezier(.22,1,.36,1)] motion-reduce:transition-none md:min-w-[76px] ${
                on ? "md:flex-[1_1_58%]" : "md:flex-[0_1_14%]"
              }`}
            >
              <button
                type="button"
                aria-expanded={on}
                onClick={() => setOpen(i)}
                className={`press flex w-full items-center px-5 text-left text-lg font-extrabold md:absolute md:inset-0 md:items-end md:p-6 ${
                  on ? "h-16 md:pointer-events-none md:opacity-0" : "h-16 md:h-full"
                }`}
              >
                <span className={on ? "md:hidden" : "md:origin-bottom-left md:-rotate-90 md:translate-x-[1.6em] md:whitespace-nowrap md:text-xl"}>
                  {stage.name}
                </span>
              </button>
              <div
                className={`grid gap-6 px-5 pb-8 md:absolute md:inset-y-0 md:left-0 md:w-[min(58vw,900px)] md:grid-cols-2 md:p-8 ${
                  on ? "" : "hidden md:grid md:invisible"
                }`}
              >
                <div className="flex flex-col justify-between gap-6">
                  <h3 className="hidden text-[40px] font-extrabold leading-none tracking-[-0.03em] md:block">
                    {stage.name}
                  </h3>
                  <p className="max-w-[36ch] text-lg font-medium leading-relaxed md:text-lg">{stage.text}</p>
                </div>
                <div className="flex items-center md:h-full">
                  <Image
                    src={stage.picture}
                    alt={stage.alt}
                    width={1600}
                    height={900}
                    sizes="(min-width: 768px) 30vw, 90vw"
                    className="h-auto w-full rounded-md"
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
