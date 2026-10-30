import type { ComponentType } from "react";

import { DistributionIcon, ManagerIcon, MapIcon, StethoscopeIcon, TimelineIcon } from "@/components/icons";

export const GITHUB_URL = "https://github.com/Ahmedwagdymohy/KubeiQ";

export type Product = {
  href: string;
  name: string;
  description: string;
  icon: ComponentType<{ width?: number; height?: number }>;
};

/** Product modules in this install (ADR 0006). Shown in the Products menu and on Home. */
export const PRODUCTS: Product[] = [
  {
    href: "/doctor",
    name: "Cluster Doctor",
    description: "Find out why workloads fail and how to fix them",
    icon: StethoscopeIcon,
  },
  {
    href: "/map",
    name: "Cluster Map",
    description: "See every resource, how it connects and what is unhealthy",
    icon: MapIcon,
  },
  {
    href: "/manager",
    name: "Cluster Manager",
    description: "Browse every resource, read YAML, events and logs",
    icon: ManagerIcon,
  },
];

/** Views across a cluster's resources, in the sidebar's Insights group. */
export const INSIGHTS: Product[] = [
  {
    href: "/timeline",
    name: "Timeline",
    description: "What happened in the cluster: events and KubeiQ's own activity",
    icon: TimelineIcon,
  },
  {
    href: "/distribution",
    name: "Pod Distribution",
    description: "How pods spread across nodes, and nodes you could remove",
    icon: DistributionIcon,
  },
];
