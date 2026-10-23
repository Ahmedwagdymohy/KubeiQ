import type { Metadata } from "next";
import Image from "next/image";

import { Pill, PrimaryLink, SecondaryLink, SectionHeading } from "@/components/ui";

export const metadata: Metadata = {
  title: "Cluster Manager",
  description:
    "Browse every Kubernetes resource, including custom resources. Read YAML, events and logs, read-only by default.",
};

const FEATURES = [
  {
    title: "Every Resource",
    description: "Workloads, networking, config, storage, access and your custom resources, found on the cluster itself",
  },
  {
    title: "YAML, Events and Logs",
    description: "Open any object to read its YAML and recent events. Pods show live logs, including the run before the last crash",
  },
  {
    title: "Safe by Default",
    description: "Read-only until an admin turns changes on. Secret values are never read, only names and metadata",
  },
  {
    title: "Changes You Can Trust",
    description: "Scale, restart, cordon and delete with a confirmation, limited to project editors, and recorded in Activity",
  },
];

export default function ManagerProductPage() {
  return (
    <>
      <section className="bg-grid flex flex-col items-center px-6 py-24 text-center">
        <Pill>Included in KubeiQ</Pill>
        <h1 className="mt-8 text-4xl font-medium leading-tight tracking-tight sm:text-6xl">
          Cluster <span className="text-accent">Manager</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted">
          Everything in your cluster in one place. Find any resource, read its YAML, events and
          logs, and jump to the map or an investigation in one click
        </p>
        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <PrimaryLink href="/install">Get Started</PrimaryLink>
          <SecondaryLink href="/products/map">Cluster Map</SecondaryLink>
        </div>
        <div className="mt-16 w-full max-w-5xl overflow-hidden rounded-lg border border-border shadow-2xl shadow-black/30">
          <Image
            src="/screens/manager-dark.png"
            alt="Cluster Manager listing deployments with one deployment open"
            width={1600}
            height={1000}
            className="show-in-dark h-auto w-full"
            priority
          />
          <Image
            src="/screens/manager-light.png"
            alt="Cluster Manager listing deployments with one deployment open"
            width={1600}
            height={1000}
            className="show-in-light h-auto w-full"
          />
        </div>
      </section>

      <section className="grid gap-px border-t border-border bg-border md:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((f) => (
          <div key={f.title} className="flex flex-col gap-3 bg-bg p-8">
            <h3 className="text-lg font-medium">{f.title}</h3>
            <p className="text-muted">{f.description}</p>
          </div>
        ))}
      </section>

      <section className="grid items-center gap-12 border-t border-border px-6 py-20 sm:px-12 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <SectionHeading
          title="Logs Without a Terminal"
          description="Follow a pod's logs live, switch containers, or read the run before the last restart. When something looks wrong, Investigate opens Cluster Doctor on that workload"
        />
        <div className="overflow-hidden rounded-lg border border-border shadow-2xl shadow-black/30">
          <Image
            src="/screens/manager-logs-dark.png"
            alt="Live logs of a pod in Cluster Manager"
            width={1600}
            height={1000}
            className="h-auto w-full"
          />
        </div>
      </section>

      <section className="bg-grid flex flex-col items-center gap-6 border-t border-border px-6 py-24 text-center">
        <h2 className="text-3xl font-medium tracking-tight sm:text-4xl">Included in Every Install</h2>
        <p className="max-w-xl text-lg text-muted">
          Install KubeiQ once and Cluster Manager is ready under the Products menu
        </p>
        <PrimaryLink href="/install">Get Started</PrimaryLink>
      </section>
    </>
  );
}
