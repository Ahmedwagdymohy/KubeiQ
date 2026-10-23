import type { Metadata } from "next";

import { Overview } from "@/components/overview/overview";

export const metadata: Metadata = { title: "Overview · KubeiQ" };

export default function Home() {
  return <Overview />;
}
