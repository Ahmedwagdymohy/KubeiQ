import type { ComponentType } from "react";

import { MapIcon, StethoscopeIcon } from "@/components/icons";

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
];
