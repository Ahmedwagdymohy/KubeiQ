import type { Metadata } from "next";
import Image from "next/image";

import { FeatureRows, Screen, Split } from "@/components/blocks";
import { FieldHero } from "@/components/field-hero";
import { InstallBand } from "@/components/install-band";
import { rise } from "@/components/ui";

export const metadata: Metadata = {
  title: "Cluster Map",
  description:
    "A live picture of your Kubernetes namespace: every resource, how it connects and what is broken.",
};

const FEATURES = [
  {
    title: "See How It Connects",
    text: "Deployments, pods, services, ingresses, volume claims, configs and secrets, linked the way Kubernetes links them",
  },
  {
    title: "Spot What Is Broken",
    text: "Red means broken, with the reason in one line, so you know where to look before you open a terminal",
  },
  {
    title: "Investigate in One Click",
    text: "Click a broken resource and Cluster Doctor opens on it with the root cause and the commands to fix it",
  },
  {
    title: "Always Current",
    text: "The map refreshes every few seconds, so you watch a fix roll out and the red turn into cyan",
  },
];

export default function MapProductPage() {
  return (
    <>
      <FieldHero
        lines={["Cluster", "Map"]}
        size="title"
        shape="screen"
        sentence="A live chart of your namespace. Every app and the resources behind it, how they connect and which ones are broken, with the reason"
        figure={
          <Screen
            dark="/screens/map-overview-dark.jpg"
            light="/screens/map-expanded-light.jpg"
            alt="Cluster Map with each app and its resources, broken ones in red"
            priority
          />
        }
      />

      <section data-reveal className="frame flex flex-col gap-12 pt-[clamp(96px,12vw,200px)]">
        <div className="grid gap-5 md:grid-cols-12">
          <h2 data-rise className="text-[clamp(34px,4vw,60px)] font-extrabold leading-[0.98] tracking-[-0.035em] md:col-span-6">
            Charted Like a Coast
          </h2>
          <p data-rise style={rise(1)} className="max-w-[46ch] text-lg leading-relaxed md:col-span-5 md:col-start-8 md:self-end">
            A sea chart shows the soundings, the rocks and the safe passage. Cluster Map does the same for
            a namespace: what is there, how it links up and where it is broken
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <figure data-rise style={rise(2)} className="flex flex-col gap-3">
            <div className="relative aspect-[4/3] overflow-hidden bg-surface">
              <Image
                src="/screens/map-overview-dark.jpg"
                alt="Cluster Map of kubeiq-demo: each app as a card, broken ones in red"
                fill
                sizes="(min-width: 768px) 50vw, 100vw"
                className="object-cover object-left-top"
              />
            </div>
            <figcaption className="text-base text-muted">kubeiq-demo on Cluster Map: what is there and what is broken</figcaption>
          </figure>
          <figure data-rise style={rise(3)} className="flex flex-col gap-3">
            <div className="relative aspect-[4/3] overflow-hidden bg-surface">
              <Image
                src="/screens/doctor-incident-dark.jpg"
                alt="Cluster Doctor opened from a broken node, with the root cause and the fix"
                fill
                sizes="(min-width: 768px) 50vw, 100vw"
                className="object-cover object-left-top"
              />
            </div>
            <figcaption className="text-base text-muted">One click on a red node opens Cluster Doctor on it</figcaption>
          </figure>
        </div>
      </section>

      <FeatureRows
        title="What the Map Shows"
        intro="Built for the moment something is wrong and you need the whole picture before you touch anything"
        rows={FEATURES}
      />

      <Split
        title="From Red Node to Fix"
        picture={
          <Screen
            dark="/screens/map-expanded-light.jpg"
            alt="A broken pod selected on the map, showing the missing environment variable and the Investigate button"
          />
        }
      >
        <p>
          Click a broken pod and see why it fails in one line. One more click opens Cluster Doctor on that
          workload with the commands to fix it and to check that it worked
        </p>
        <p className="text-base text-muted">
          Cluster Map builds on the resource map of{" "}
          <a href="https://github.com/kubernetes-sigs/headlamp" className="font-semibold text-accent hover:underline">
            Headlamp
          </a>
          , the Kubernetes project, with health and investigations from KubeiQ
        </p>
      </Split>

      <InstallBand sentence="Install KubeiQ once and Cluster Map is ready under the Products menu" />
    </>
  );
}
