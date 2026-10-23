import { Fragment } from "react";

import { KubeMascot } from "@/components/kube-mascot";
import { rise } from "@/components/ui";

const FAILURES = [
  "CrashLoopBackOff",
  "OOMKilled",
  "ImagePullBackOff",
  "Pending pods",
  "Probe failures",
  "Missing config",
  "Service selectors",
  "Init containers",
  "Failed jobs",
  "Stuck rollouts",
  "Node pressure",
];

function Line() {
  return (
    <span className="flex shrink-0 items-center">
      {FAILURES.map((name) => (
        <Fragment key={name}>
          <span className="whitespace-nowrap px-[0.35em]">{name}</span>
          <span aria-hidden className="h-[0.22em] w-[0.22em] shrink-0 rounded-full bg-field" />
        </Fragment>
      ))}
    </span>
  );
}

/** The failures recognized on sight, as one line of names running off both edges. */
export function FailureBand({ walker = true }: { walker?: boolean }) {
  return (
    <section data-reveal className="flex flex-col pt-[clamp(96px,12vw,200px)]">
      <div className="relative">
        {walker && <KubeMascot />}
        <div className="marquee-wrap flex h-[22svh] min-h-[150px] items-center overflow-hidden bg-inverse text-inverse-ink md:h-[34svh] md:min-h-[240px]">
          <div
            className="marquee flex w-max text-[15vw] font-extrabold leading-none tracking-[-0.04em] md:text-[8vw]"
            aria-hidden
          >
            <Line />
            <Line />
          </div>
        </div>
      </div>
      <div className="frame grid gap-4 pt-8 md:grid-cols-12 md:pt-10">
        <h2 data-rise className="text-[clamp(28px,2.6vw,40px)] font-extrabold leading-[1.05] tracking-[-0.03em] md:col-span-5">
          Known on Sight
        </h2>
        <p data-rise style={rise(1)} className="max-w-[56ch] text-lg leading-relaxed md:col-span-6 md:col-start-7">
          The failures Cluster Doctor recognizes in seconds: {FAILURES.join(", ")}. Anything else goes
          to the AI agent, so an unhealthy pod is never reported as fine
        </p>
      </div>
    </section>
  );
}
