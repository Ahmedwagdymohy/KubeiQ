import type { Metadata } from "next";

import { PodDistribution } from "@/components/insights/pod-distribution";

export const metadata: Metadata = { title: "Pod Distribution · KubeiQ" };

export default function DistributionPage() {
  return <PodDistribution />;
}
