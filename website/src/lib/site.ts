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

/** Archival pictures of the helmsman's world used on the site (not KubeiQ product shots). */
export const PICTURE_CREDITS = [
  {
    title: "Smalls Lighthouse struck by a wave",
    creator: "engraving by Souchal, 1870",
    page: "https://commons.wikimedia.org/wiki/File:Engraving_of_Smalls_Lighthouse_near_Pembrokeshire,_Wales_being_struck_by_a_wave_during_a_storm.png",
  },
  {
    title: "Bell Rock Lighthouse during a storm",
    creator: "after J. M. W. Turner, 1824",
    page: "https://commons.wikimedia.org/wiki/File:Bell_Rock_Lighthouse_during_a_storm_cph.3b18344.jpg",
  },
  {
    title: "Admiralty Chart No 2613, Cape Levi to Fecamp",
    creator: "United Kingdom Hydrographic Office, 1894",
    page: "https://commons.wikimedia.org/wiki/File:Admiralty_Chart_No_2613_France_N._Coast_Sheet_XI_Cape_Levi_to_Fecamp,_Published_1894.jpg",
  },
  {
    title: "A Circle of Winds, the Mariner's Compass",
    creator: "Emanuel Bowen, 1747",
    page: "https://commons.wikimedia.org/wiki/File:Compass_rose_detail_from_1748_Bowen_Mariner%E2%80%99s_Compass_and_Armillary_Sphere_-_Geographicus_-_CircleofWinds-bowen-1747_(cropped).jpg",
  },
  {
    title: "HMS Dolphin log book",
    creator: "John Byron, 1765",
    page: "https://commons.wikimedia.org/wiki/File:HMS_Dolphin_-_Log_Book_1.jpg",
  },
  {
    title: "Darien nautical chart",
    creator: "W. Mount and T. Page, 1737",
    page: "https://commons.wikimedia.org/wiki/File:Darien_Nautical_Chart_1737.jpg",
  },
];
