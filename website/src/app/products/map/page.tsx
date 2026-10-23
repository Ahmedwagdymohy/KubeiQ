import type { Metadata } from "next";

import { ProductPage } from "@/components/product-page";

export const metadata: Metadata = {
  title: "Cluster Map",
  description:
    "A live picture of your Kubernetes namespace: every resource, how it connects and what is broken.",
};

const FEATURES = [
  {
    title: "See how it connects",
    description:
      "Deployments, pods, services, ingresses, volume claims, configs and secrets, linked the way Kubernetes links them",
  },
  {
    title: "Spot what is broken",
    description:
      "Red means broken, with the reason in one line, so you know where to look before you open a terminal",
  },
  {
    title: "Investigate in one click",
    description:
      "Click a broken resource and Cluster Doctor opens on it with the root cause and the commands to fix it",
  },
  {
    title: "Always current",
    description:
      "The map refreshes every few seconds, so you watch a fix roll out and the red turn into cyan",
  },
];

export default function MapProductPage() {
  return (
    <ProductPage
      name="Cluster Map"
      standfirst="A live map of your Kubernetes resources. Every app and what runs behind it, how it connects and which parts are broken, with the reason"
      hero={{
        dark: "/screens/map-dark.png",
        alt: "Cluster Map of the demo cluster, broken apps in red",
      }}
      strip={[
        {
          dark: "/screens/overview-light.png",
          alt: "Workload health per namespace on the KubeiQ Overview",
        },
        {
          dark: "/screens/doctor-dark.png",
          alt: "Cluster Doctor opened from a broken node on the map",
        },
      ]}
      features={FEATURES}
      sibling={{ href: "/products/manager", label: "See Cluster Manager" }}
      extra={
        <section className="frame bg-surface py-16">
          <p className="max-w-2xl text-sm text-muted lg:ml-[var(--axis)]">
            Cluster Map builds on the resource map of{" "}
            <a
              href="https://github.com/kubernetes-sigs/headlamp"
              className="text-fg underline underline-offset-4"
            >
              Headlamp
            </a>
            , the Kubernetes project, with health and investigations from KubeiQ
          </p>
        </section>
      }
      detail={{
        title: "From Red Node to Fix",
        text: "Click a broken pod and see why it fails in one line. One more click opens Cluster Doctor on that workload with the exact commands to fix it and to check that it worked",
        shot: {
          dark: "/screens/map-demo-light.png",
          alt: "Cluster Map of the kubeiq-demo namespace in the light theme",
        },
      }}
    />
  );
}
