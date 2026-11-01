import type { Metadata } from "next";

import { ClusterSecurity } from "@/components/security/cluster-security";

export const metadata: Metadata = { title: "Cluster Security · KubeiQ" };

export default function SecurityPage() {
  return <ClusterSecurity />;
}
