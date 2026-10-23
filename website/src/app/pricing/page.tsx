import type { Metadata } from "next";

import { UsersPanel } from "@/components/fragments";
import { Block, Close, PageIntro } from "@/components/page-parts";
import { PrimaryLink, Rise, Screen, TextLink } from "@/components/ui";
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
      "Cluster Doctor, Cluster Map and Cluster Manager",
      "Up to 3 users, with access by project",
      "Read-only by default, opt-in changes with an activity log",
      "Any AI model, or rules only",
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
      "Unlimited users",
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
      "Custom roles and fine-grained access",
      "Audit log export and retention",
      "AI keys per team, managed hosting",
    ],
    available: false,
  },
];

const INCLUDED = [
  { name: "Cluster Doctor", light: "/screens/doctor-incident-light.png", dark: "/screens/doctor-incident-dark.png", w: 2576, h: 1528 },
  { name: "Cluster Map", light: "/screens/map-expanded-light.png", dark: "/screens/map-overview-dark.png", w: 1600, h: 936 },
  { name: "Cluster Manager", light: "/screens/manager-light.png", dark: "/screens/manager-dark.png", w: 1600, h: 1000 },
];

export default function PricingPage() {
  return (
    <>
      <PageIntro
        title={
          <>
            Pricing. <br className="hidden sm:block" />
            The core stays free.
          </>
        }
        lead="Every product is free and open source, for up to three people. Paid plans add what teams and organizations need, in the same install"
      >
        <div className="grid gap-x-16 gap-y-14 lg:grid-cols-3">
          {PLANS.map((plan, i) => (
            <Rise key={plan.name} delay={i * 90} className="flex flex-col gap-6">
              <div className="flex flex-col gap-1">
                <p className="flex items-baseline justify-between gap-4 text-[22px] font-medium">
                  <span>{plan.name}</span>
                  <span className={plan.available ? "tnum" : "text-lg text-muted"}>{plan.price}</span>
                </p>
                <p className="text-base text-muted">{plan.note}</p>
              </div>
              <ul className="flex flex-col gap-3 text-lg">
                {plan.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
              <div className="mt-auto pt-2">
                {plan.available ? (
                  <PrimaryLink href="/install">Get Started</PrimaryLink>
                ) : (
                  <TextLink href={GITHUB_URL}>Watch the repository for updates</TextLink>
                )}
              </div>
            </Rise>
          ))}
        </div>
      </PageIntro>

      <Block title="All Three Products, Free" lead="The free plan is not a trial. It is the whole open source core, with no limit on clusters, scans or time">
        <div className="grid gap-6 md:grid-cols-3">
          {INCLUDED.map((p, i) => (
            <Rise key={p.name} as="figure" delay={i * 80} className="flex flex-col gap-3">
              <div className="aspect-[4/3] overflow-hidden rounded-xl bg-surface">
                <Screen light={p.light} dark={p.dark} alt={`${p.name} screen`} width={p.w} height={p.h} className="h-full [&_img]:origin-top-left [&_img]:scale-[1.7]" />
              </div>
              <figcaption className="text-lg font-medium">{p.name}</figcaption>
            </Rise>
          ))}
        </div>
      </Block>

      <Block title="Three Seats, Real Access">
        <div className="grid12 gap-y-10">
          <Rise as="p" className="col-span-12 max-w-[42ch] text-lg leading-relaxed lg:col-span-5">
            The free plan has room for an admin and two more people. Projects decide which clusters
            and namespaces each one sees, and whether they may change anything. Paid features switch
            on with a license key in the same installation, so there is nothing to migrate
          </Rise>
          <Rise delay={120} className="col-span-12 lg:col-span-6 lg:col-start-7">
            <UsersPanel />
          </Rise>
        </div>
      </Block>

      <Close sentence="Start on the free plan today. When your team grows, the same install grows with it." />
    </>
  );
}
