import type { Metadata } from "next";
import { Suspense } from "react";

import { Doctor } from "@/components/doctor/doctor";

export const metadata: Metadata = { title: "Cluster Doctor · KubeiQ" };

export default function DoctorPage() {
  return (
    <Suspense>
      <Doctor />
    </Suspense>
  );
}
