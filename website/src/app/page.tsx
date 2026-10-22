import Link from "next/link";

import { CommandBlock } from "@/components/command-block";
import { FeatureGrid } from "@/components/feature-grid";
import { KubeMascot } from "@/components/kube-mascot";
import { Pill, PrimaryLink, SecondaryLink, SectionHeading } from "@/components/ui";
import { GITHUB_URL, INSTALL_COMMAND, PRODUCTS } from "@/lib/site";

export default function Home() {
  return (
    <>
      <section className="bg-grid flex flex-col items-center px-6 py-24 text-center sm:py-28">
        <Pill>Open source and self-hosted</Pill>
        <h1 className="mt-8 text-4xl font-medium leading-tight tracking-tight sm:text-6xl">
          <span className="text-accent">AI Tools</span>
          <br />
          for Kubernetes Operations
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted">
          KubeiQ reads your clusters, finds out why things break and shows you how to fix them. One
          install gives you every tool, on your own servers, with any AI model
        </p>
        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <PrimaryLink href="/install">Get Started</PrimaryLink>
          <SecondaryLink href={GITHUB_URL}>View on GitHub</SecondaryLink>
        </div>
        <div className="relative mt-28 w-full max-w-4xl">
          <KubeMascot />
          <CommandBlock commands={[INSTALL_COMMAND]} />
        </div>
      </section>

      <section className="flex flex-col gap-10 border-t border-border px-6 py-20 sm:px-12">
        <SectionHeading
          title="Products"
          description="Every product is included in the same install and shares your clusters and AI settings"
        />
        <div className="grid pl-px pt-px md:grid-cols-2 lg:grid-cols-3">
          {PRODUCTS.map(({ slug, name, description, icon: Icon }) => (
            <Link
              key={slug}
              href={`/products/${slug}`}
              className="group -ml-px -mt-px flex flex-col gap-4 border border-border p-8 transition-colors hover:bg-surface"
            >
              <span className="text-accent">
                <Icon width={28} height={28} />
              </span>
              <span className="flex flex-col gap-2">
                <span className="text-lg font-medium">{name}</span>
                <span className="text-muted">{description}</span>
              </span>
              <span className="mt-auto text-sm text-accent group-hover:underline">Learn more</span>
            </Link>
          ))}
          <div className="-ml-px -mt-px flex flex-col justify-center gap-2 border border-border p-8">
            <span className="text-lg font-medium text-muted">More Tools on the Way</span>
            <span className="text-subtle">New products arrive as updates to the same install</span>
          </div>
        </div>
      </section>

      <FeatureGrid />

      <section className="bg-grid flex flex-col items-center gap-6 border-t border-border px-6 py-24 text-center">
        <h2 className="text-3xl font-medium tracking-tight sm:text-4xl">Running in Minutes</h2>
        <p className="max-w-xl text-lg text-muted">
          You need Docker and a kubeconfig. KubeiQ only reads from your cluster and never changes it
        </p>
        <PrimaryLink href="/install">Get Started</PrimaryLink>
      </section>
    </>
  );
}
