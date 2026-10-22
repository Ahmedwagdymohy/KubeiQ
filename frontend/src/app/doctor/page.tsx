import { Suspense } from "react";

import { Dashboard } from "@/components/dashboard/dashboard";

export default function DashboardPage() {
  return (
    <Suspense>
      <Dashboard />
    </Suspense>
  );
}
