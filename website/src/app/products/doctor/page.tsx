import type { Metadata } from "next";
import Image from "next/image";

import { Pill, PrimaryLink, SecondaryLink, SectionHeading } from "@/components/ui";

export const metadata: Metadata = {
  title: "Cluster Doctor",
  description: "Find out why Kubernetes workloads fail and how to fix them, with exact commands.",
};

const STEPS = [
  {
    title: "Collect Evidence",
    description: "Reads pods, events, workloads, services, nodes and logs, without changing anything",
  },
  {
    title: "Find the Problem",
    description: "Recognizes common failures in seconds and groups symptoms under one root cause",
  },
  {
    title: "Dig Deeper",
    description: "When the cause is unclear, an AI agent checks logs, configs and related resources",
  },
  {
    title: "Fix and Verify",
    description: "Exact commands with your real resource names, plus commands to confirm the fix worked",
  },
];

const DETECTS = [
  "CrashLoopBackOff",
  "OOMKilled",
  "ImagePullBackOff",
  "Pending pods",
  "Probe failures",
  "Missing config and secrets",
  "Service selectors",
  "Failed init containers",
  "Failed jobs",
  "Stuck rollouts",
  "Node problems",
];

export default function DoctorPage() {
  return (
    <>
      <section className="bg-grid flex flex-col items-center px-6 py-24 text-center">
        <Pill>Included in KubeiQ</Pill>
        <h1 className="mt-8 text-4xl font-medium leading-tight tracking-tight sm:text-6xl">
          Cluster <span className="text-accent">Doctor</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted">
          Pick a cluster and a namespace. Cluster Doctor finds what is broken, explains the root cause
          in one line and gives you the commands to fix it
        </p>
        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <PrimaryLink href="/install">Get Started</PrimaryLink>
          <SecondaryLink href="#how-it-works">How It Works</SecondaryLink>
        </div>
        <div className="mt-16 w-full max-w-5xl overflow-hidden rounded-lg border border-border shadow-2xl shadow-black/30">
          <Image
            src="/screens/doctor-incident-dark.png"
            alt="Cluster Doctor showing an image pull failure with the fix command"
            width={1100}
            height={640}
            className="show-in-dark h-auto w-full"
            priority
          />
          <Image
            src="/screens/doctor-incident-light.png"
            alt="Cluster Doctor showing a missing secret key with the fix command"
            width={1100}
            height={640}
            className="show-in-light h-auto w-full"
          />
        </div>
      </section>

      <section id="how-it-works" className="flex flex-col gap-10 border-t border-border px-6 py-20 sm:px-12">
        <SectionHeading title="How It Works" />
        <ol className="grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex flex-col gap-3 bg-bg p-8">
              <span className="font-mono text-sm text-accent">{i + 1}</span>
              <span className="text-lg font-medium">{step.title}</span>
              <span className="text-muted">{step.description}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-12 border-t border-border px-6 py-20 sm:px-12 lg:grid-cols-2">
        <SectionHeading
          title="What It Finds"
          description="Known failures are recognized instantly. Anything else goes to the AI agent, so an unhealthy pod is never reported as fine"
        />
        <div className="flex flex-wrap content-start gap-2">
          {DETECTS.map((item) => (
            <span
              key={item}
              className="rounded-full border border-border px-3 py-1.5 text-sm text-fg/90"
            >
              {item}
            </span>
          ))}
        </div>
      </section>

      <section className="grid gap-px border-t border-border bg-border md:grid-cols-3">
        {[
          ["Read-Only", "Uses read-only access and never reads secret values"],
          ["Private by Default", "Passwords and tokens are masked before anything reaches a model"],
          ["Your Model", "OpenAI, Anthropic, OpenRouter, Bedrock, a LiteLLM proxy or a local model"],
        ].map(([title, description]) => (
          <div key={title} className="flex flex-col gap-3 bg-bg p-8 sm:p-12">
            <h3 className="text-lg font-medium">{title}</h3>
            <p className="text-muted">{description}</p>
          </div>
        ))}
      </section>

      <section className="bg-grid flex flex-col items-center gap-6 border-t border-border px-6 py-24 text-center">
        <h2 className="text-3xl font-medium tracking-tight sm:text-4xl">Included in Every Install</h2>
        <p className="max-w-xl text-lg text-muted">
          Install KubeiQ once and Cluster Doctor is ready under the Products menu
        </p>
        <PrimaryLink href="/install">Get Started</PrimaryLink>
      </section>
    </>
  );
}
