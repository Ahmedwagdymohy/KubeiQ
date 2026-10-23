import type { Metadata } from "next";

import Image from "next/image";

import { PricingFields } from "@/components/home/pricing-fields";

/** Every plan runs the same app. */
const STRIP = [
  { src: "/screens/overview-light.png", alt: "KubeiQ Overview in the light theme" },
  { src: "/screens/manager-logs-dark.png", alt: "Live pod logs in Cluster Manager" },
  { src: "/screens/map-demo-light.png", alt: "Cluster Map of the demo namespace" },
  { src: "/screens/doctor-dark.png", alt: "Cluster Doctor with a root cause and its fix" },
];

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "KubeiQ core is free and open source. Pro and Enterprise add team and scale features.",
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

export default function PricingPage() {
  return (
    <>
      <section className="frame flex flex-col gap-8 pb-20 pt-16 lg:flex-row-reverse lg:items-end lg:justify-between md:pt-28">
        <h1 className="t-display lg:w-[calc(58vw-var(--m))]">
          <span className="mask-line">
            <span>Free to run.</span>
          </span>
          <span className="mask-line">
            <span>Paid to scale.</span>
          </span>
        </h1>
        <p className="after-mask max-w-[34ch] text-[17px]">
          The core stays free and open source. Paid plans add what teams and organizations need, in
          the same install
        </p>
      </section>

      <PricingFields />

      <div className="grid grid-cols-2 md:grid-cols-4">
        {STRIP.map((shot) => (
          <div key={shot.src} className="relative h-[30svh] overflow-hidden md:h-[42svh]">
            <Image
              src={shot.src}
              alt={shot.alt}
              width={1440}
              height={900}
              className="drift h-full w-full object-cover object-left-top"
            />
          </div>
        ))}
      </div>

      <section className="frame py-32 sm:py-44" aria-labelledby="compare">
        <div data-reveal className="flex flex-col gap-12">
          <h2 id="compare" className="t-title">
            Compare Plans
          </h2>
          <div className="grid gap-12 md:grid-cols-3">
            {PLANS.map((plan) => (
              <div key={plan.name} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <h3 className="t-statement font-medium">{plan.name}</h3>
                  <p className="text-sm text-muted">
                    {plan.note}
                    {plan.available ? "" : ", coming soon"}
                  </p>
                </div>
                <ul className="flex flex-col gap-3 text-[17px]">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex gap-3">
                      <span className="mt-[0.55em] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="t-statement max-w-[40ch] text-muted lg:ml-[var(--axis)]">
            Paid features switch on with a license key in the same installation. Nothing to migrate
          </p>
        </div>
      </section>
    </>
  );
}
