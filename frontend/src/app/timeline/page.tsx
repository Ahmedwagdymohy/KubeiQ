import type { Metadata } from "next";

import { Timeline } from "@/components/insights/timeline";

export const metadata: Metadata = { title: "Timeline · KubeiQ" };

export default function TimelinePage() {
  return <Timeline />;
}
