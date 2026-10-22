import { FeatureGrid } from "@/components/feature-grid";
import { Logo } from "@/components/logo";
import { SystemStatus } from "@/components/system-status";

const GITHUB_URL = "https://github.com/Ahmedwagdymohy/KubeiQ";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Logo />
          <div className="flex items-center gap-6 text-sm text-muted">
            <a href={`${GITHUB_URL}#readme`} className="transition-colors hover:text-fg">
              Docs
            </a>
            <a href={GITHUB_URL} className="transition-colors hover:text-fg">
              GitHub
            </a>
          </div>
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col border-x border-border">
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
            <button
              type="button"
              disabled
              title="Available in an upcoming release"
              className="rounded-md bg-accent px-6 py-3 font-medium text-accent-ink transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
            >
              Investigate Cluster
            </button>
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
