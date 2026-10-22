import Link from "next/link";

import { AppHeader } from "@/components/app-header";
import { AINotice } from "@/components/home/ai-notice";
import { RecentInvestigations } from "@/components/home/recent-investigations";
import { SystemStatus } from "@/components/system-status";
import { PRODUCTS } from "@/lib/products";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <AppHeader />

      <main className="mx-auto flex w-full max-w-[1680px] flex-1 flex-col border-x border-border">
        <section className="bg-grid flex flex-col items-start gap-4 border-b border-border px-6 py-14 sm:px-12">
          <SystemStatus />
          <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">Welcome to KubeiQ</h1>
          <p className="max-w-2xl text-muted">Pick a product to start working on your clusters</p>
          <AINotice />
        </section>

        <section className="grid border-b border-border md:grid-cols-2 xl:grid-cols-3">
          {PRODUCTS.map(({ href, name, description, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="group -mb-px flex items-start gap-4 border-b border-border p-8 transition-colors hover:bg-surface md:border-r"
            >
              <span className="shrink-0 text-accent">
                <Icon width={28} height={28} />
              </span>
              <span className="flex flex-col gap-1">
                <span className="text-lg font-medium">{name}</span>
                <span className="text-muted">{description}</span>
                <span className="mt-3 text-sm text-accent group-hover:underline">Open</span>
              </span>
            </Link>
          ))}
        </section>

        <section className="flex flex-col">
          <h2 className="px-6 pb-2 pt-10 text-base font-semibold sm:px-12">Recent Investigations</h2>
          <div className="sm:px-6">
            <RecentInvestigations />
          </div>
        </section>
      </main>
    </div>
  );
}
