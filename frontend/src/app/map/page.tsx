import type { Metadata } from "next";
import { Suspense } from "react";

import { ClusterMapView } from "@/components/map/cluster-map";

export const metadata: Metadata = { title: "Cluster Map · KubeiQ" };

export default function MapPage() {
  return (
    <Suspense>
      <ClusterMapView />
    </Suspense>
  );
}
