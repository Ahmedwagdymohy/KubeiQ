import type { Metadata } from "next";
import { Suspense } from "react";

import { ClusterManager } from "@/components/manager/cluster-manager";

export const metadata: Metadata = { title: "Cluster Manager · KubeiQ" };

export default function ManagerPage() {
  return (
    <Suspense>
      <ClusterManager />
    </Suspense>
  );
}
