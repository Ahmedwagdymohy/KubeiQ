import Link from "next/link";

import { AppHeader, GITHUB_URL } from "@/components/app-header";
import { FeatureGrid } from "@/components/feature-grid";
import { SystemStatus } from "@/components/system-status";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <AppHeader />

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col border-x border-border">
        <section className="bg-grid flex flex-col items-center px-6 py-28 text-center">
          <SystemStatus />
          <h1 className="mt-8 text-4xl font-medium leading-tight tracking-tight sm:text-6xl">
            <span className="text-accent">AI Troubleshooting</span>
            <br />
            for Kubernetes Clusters
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-muted">
            Find out why your workloads are failing. KubeiQ reads your cluster, finds the root cause
            and shows you how to fix it, running on your own servers with any AI model
          </p>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/dashboard"
              className="rounded-md bg-accent px-6 py-3 font-medium text-accent-ink transition-colors hover:bg-accent-strong"
            >
              Investigate Cluster
            </Link>
            <a
              href={`${GITHUB_URL}#readme`}
              className="rounded-md border border-fg/80 px-6 py-3 font-medium transition-colors hover:bg-surface-2"
            >
              Read Docs
            </a>
          </div>
        </section>

        <FeatureGrid />
      </main>
    </div>
  );
}
