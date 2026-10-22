import type { Metadata } from "next";

import { PrimaryLink, SectionHeading } from "@/components/ui";
import { GITHUB_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Pricing",
  description: "KubeiQ core is free and open source. Pro and Enterprise add team and scale features.",
};

const PLANS = [
  {
    name: "Free",
    price: "$0",
    note: "Open source, Apache-2.0",
    features: [
      "Every core product, including Cluster Doctor",
      "Clusters from your kubeconfig",
      "Any AI model, or rules only",
      "Investigation history",
      "Community support on GitHub",
    ],
    available: true,
  },
  {
    name: "Pro",
    price: "Coming Soon",
    note: "For teams",
    features: [
      "Everything in Free",
      "Teams and shared workspaces",
      "Scheduled scans and alerts",
      "PDF investigation reports",
      "More cluster connections",
    ],
    available: false,
  },
  {
    name: "Enterprise",
    price: "Coming Soon",
    note: "For organizations",
    features: [
      "Everything in Pro",
      "SSO with OIDC and LDAP",
      "Role-based access per cluster",
      "Audit logs",
      "AI keys per team, managed hosting",
    ],
    available: false,
  },
];

export default function PricingPage() {
  return (
    <>
      <section className="bg-grid flex flex-col items-center px-6 py-24 text-center">
        <h1 className="text-4xl font-medium tracking-tight sm:text-6xl">Pricing</h1>
        <p className="mt-6 max-w-2xl text-lg text-muted">
          The core stays free and open source. Paid plans add what teams and organizations need
        </p>
      </section>

      <section className="grid gap-px border-t border-border bg-border lg:grid-cols-3">
        {PLANS.map((plan) => (
          <div key={plan.name} className="flex flex-col gap-6 bg-bg p-8 sm:p-12">
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-medium">{plan.name}</h2>
              <p className="text-sm text-subtle">{plan.note}</p>
            </div>
            <p
              className={`text-4xl font-medium tracking-tight ${plan.available ? "" : "text-muted"}`}
            >
              {plan.price}
            </p>
            <ul className="flex flex-col gap-3">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-baseline gap-3 text-fg/90">
                  <span className="h-1.5 w-1.5 shrink-0 translate-y-[-2px] rounded-full bg-accent" />
                  {feature}
                </li>
              ))}
            </ul>
            <div className="mt-auto pt-4">
              {plan.available ? (
                <PrimaryLink href="/install">Get Started</PrimaryLink>
              ) : (
                <a
                  href={GITHUB_URL}
                  className="text-sm text-muted transition-colors hover:text-fg"
                >
                  Watch the repository for updates
                </a>
              )}
            </div>
          </div>
        ))}
      </section>

      <section className="border-t border-border px-6 py-20 sm:px-12">
        <SectionHeading
          title="One Install for Every Plan"
          description="Paid features are switched on with a license key in the same installation. Nothing to migrate"
        />
      </section>
    </>
  );
}
