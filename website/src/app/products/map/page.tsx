import type { Metadata } from "next";
import Image from "next/image";

import { Pill, PrimaryLink, SecondaryLink, SectionHeading } from "@/components/ui";

export const metadata: Metadata = {
  title: "Cluster Map",
  description:
    "A live picture of your Kubernetes namespace: every resource, how it connects and what is broken.",
};

const FEATURES = [
  {
    title: "See How It Connects",
    description: "Deployments, pods, services, ingresses, volume claims, configs and secrets, linked the way Kubernetes links them",
  },
  {
    title: "Spot What Is Broken",
    description: "Red means broken, with the reason in one line, so you know where to look before you open a terminal",
  },
  {
    title: "Investigate in One Click",
    description: "Click a broken resource and Cluster Doctor opens on it with the root cause and the commands to fix it",
  },
  {
    title: "Always Current",
    description: "The map refreshes every few seconds, so you watch a fix roll out and the red turn into cyan",
  },
];

export default function MapProductPage() {
  return (
    <>
      <section className="bg-grid flex flex-col items-center px-6 py-24 text-center">
        <Pill>Included in KubeiQ</Pill>
        <h1 className="mt-8 text-4xl font-medium leading-tight tracking-tight sm:text-6xl">
          Cluster <span className="text-accent">Map</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted">
          A live picture of your namespace. Every app and the resources behind it, how they connect
          and which ones are broken, with the reason
        </p>
        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <PrimaryLink href="/install">Get Started</PrimaryLink>
          <SecondaryLink href="/products/doctor">Cluster Doctor</SecondaryLink>
        </div>
        <div className="mt-16 w-full max-w-5xl overflow-hidden rounded-lg border border-border shadow-2xl shadow-black/30">
          <Image
            src="/screens/map-overview-dark.png"
            alt="Cluster Map overview with each app as a card, broken apps in red"
            width={1600}
            height={936}
            className="show-in-dark h-auto w-full"
            priority
          />
          <Image
            src="/screens/map-expanded-light.png"
            alt="Cluster Map with every app expanded into deployments, pods and configs"
            width={1600}
            height={936}
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
          title="From Red Node to Fix"
          description="Click a broken pod and see why it fails in one line. One more click opens Cluster Doctor on that workload with the exact commands to fix it and to check that it worked"
        />
        <div className="overflow-hidden rounded-lg border border-border shadow-2xl shadow-black/30">
          <Image
            src="/screens/map-details-dark.png"
            alt="A broken pod selected on the map, showing the missing environment variable and the Investigate button"
            width={1600}
            height={936}
            className="h-auto w-full"
          />
        </div>
      </section>

      <section className="border-t border-border px-6 py-16 text-center sm:px-12">
        <p className="mx-auto max-w-2xl text-sm text-subtle">
          Cluster Map builds on the resource map of{" "}
          <a href="https://github.com/kubernetes-sigs/headlamp" className="text-accent hover:underline">
            Headlamp
          </a>
          , the Kubernetes project, with health and investigations from KubeiQ
        </p>
      </section>

      <section className="bg-grid flex flex-col items-center gap-6 border-t border-border px-6 py-24 text-center">
        <h2 className="text-3xl font-medium tracking-tight sm:text-4xl">Included in Every Install</h2>
        <p className="max-w-xl text-lg text-muted">
          Install KubeiQ once and Cluster Map is ready under the Products menu
        </p>
        <PrimaryLink href="/install">Get Started</PrimaryLink>
      </section>
    </>
  );
}
