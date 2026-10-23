import type { ComponentType } from "react";

import { ManagerIcon, MapIcon, StethoscopeIcon } from "@/components/icons";

export const GITHUB_URL = "https://github.com/Ahmedwagdymohy/KubeiQ";
export const DOCS_URL = `${GITHUB_URL}#readme`;

/** The one install command. Every "Get Started" leads to /install, which shows this. */
export const INSTALL_COMMAND =
  "curl -fsSL https://raw.githubusercontent.com/Ahmedwagdymohy/KubeiQ/main/deploy/install.sh | sh";

export type Product = {
  slug: string;
  name: string;
  description: string;
  icon: ComponentType<{ width?: number; height?: number }>;
};

/** Every product ships in the same install (ADR 0006). Add new products here and give them a page. */
export const PRODUCTS: Product[] = [
  {
    slug: "doctor",
    name: "Cluster Doctor",
    description: "Find out why workloads fail and how to fix them",
    icon: StethoscopeIcon,
  },
  {
    slug: "map",
    name: "Cluster Map",
    description: "See every resource, how it connects and what is unhealthy",
    icon: MapIcon,
  },
  {
    slug: "manager",
    name: "Cluster Manager",
    description: "Browse every resource, read YAML, events and logs",
    icon: ManagerIcon,
  },
];
