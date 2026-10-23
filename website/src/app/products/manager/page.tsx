import type { Metadata } from "next";

import { ProductPage } from "@/components/product-page";

export const metadata: Metadata = {
  title: "Cluster Manager",
  description:
    "Browse every Kubernetes resource, including custom resources. Read YAML, events and logs, read-only by default.",
};

const FEATURES = [
  {
    title: "Every resource",
    description:
      "Workloads, networking, config, storage, access and your custom resources, found on the cluster itself",
  },
  {
    title: "YAML, events and logs",
    description:
      "Open any object to read its YAML and recent events. Pods show live logs, including the run before the last crash",
  },
  {
    title: "Safe by default",
    description:
      "Read-only until an admin turns changes on. Secret values are never read, only names and metadata",
  },
  {
    title: "Changes you can trust",
    description:
      "Scale, restart, cordon and delete with a confirmation, limited to project editors, and recorded in Activity",
  },
];

export default function ManagerProductPage() {
  return (
    <ProductPage
      name="Cluster Manager"
      standfirst="A read-only browser for every Kubernetes resource. Find anything, read its YAML, events and logs, and jump to the map or an investigation in one click"
      hero={{
        dark: "/screens/manager-pods-dark.png",
        light: "/screens/manager-object-light.png",
        alt: "Cluster Manager listing resources with one deployment open",
      }}
      strip={[
        {
          dark: "/screens/manager-object-light.png",
          alt: "A deployment open in Cluster Manager, light theme",
        },
        { dark: "/screens/map-dark.png", alt: "Show on map opens the workload in Cluster Map" },
      ]}
      features={FEATURES}
      sibling={{ href: "/products/doctor", label: "See Cluster Doctor" }}
      detail={{
        title: "Logs Without a Terminal",
        text: "Follow a pod's logs live, switch containers, or read the run before the last restart. When something looks wrong, Investigate opens Cluster Doctor on that workload",
        shot: {
          dark: "/screens/manager-logs-dark.png",
          alt: "Live logs of the payment pod in Cluster Manager",
        },
      }}
    />
  );
}
