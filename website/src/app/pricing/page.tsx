import type { Metadata } from "next";
import Image from "next/image";

import { FieldHero } from "@/components/field-hero";
import { InstallBand } from "@/components/install-band";
import { Plans } from "@/components/plans";
import { rise } from "@/components/ui";

export const metadata: Metadata = {
  title: "Pricing",
  description: "KubeiQ core is free and open source. Pro and Enterprise add team and scale features.",
};

const FACTS = [
  {
    title: "One Install for Every Plan",
    text: "Paid features are switched on with a license key in the same installation. Nothing to migrate",
    picture: "/found/hms-dolphin-log-book-1.jpg",
    alt: "A page of the log book of HMS Dolphin, 1765",
  },
  {
    title: "The Core Stays Open",
    text: "Cluster Doctor, Cluster Map and Cluster Manager are Apache-2.0. Paid plans add teams and scale, never the tools themselves",
    picture: "/found/admiralty-chart-no-2613-france-n-coast.jpg",
    alt: "Admiralty chart of the French coast, 1894",
  },
  {
    title: "Your Servers, Your Model",
    text: "KubeiQ runs where you install it and talks to the AI model you choose, so the bill for tokens stays yours",
    picture: "/found/bell-rock-lighthouse-during-a-storm-from.jpg",
    alt: "Bell Rock Lighthouse in a storm, after J. M. W. Turner",
  },
];

export default function PricingPage() {
  return (
    <>
      <FieldHero
        lines={["Free to", "Steer"]}
        sentence="Every KubeiQ product is free and open source for up to 3 users. Pro and Enterprise are coming soon"
        figure={
          <Image
            src="/found/a-circle-of-winds-consisting-of-32.jpg"
            alt="Hand-coloured mariner's compass with 32 points, from 1747"
            width={1134}
            height={1142}
            priority
            sizes="(min-width: 768px) 30vw, 58vw"
            className="aspect-[2/3] h-auto w-full object-cover"
          />
        }
      />

      <Plans heading={false} />

      <section data-reveal className="frame grid gap-10 pt-[clamp(96px,12vw,200px)] md:grid-cols-3 md:gap-6">
        {FACTS.map((f, i) => (
          <div key={f.title} data-rise style={rise(i)} className="flex flex-col gap-4">
            <div className="relative aspect-[4/3] overflow-hidden bg-surface">
              <Image src={f.picture} alt={f.alt} fill sizes="(min-width: 768px) 33vw, 100vw" className="object-cover" />
            </div>
            <h2 className="text-[clamp(26px,2.4vw,38px)] font-extrabold leading-[1.05] tracking-[-0.03em]">{f.title}</h2>
            <p className="max-w-[38ch] text-lg leading-relaxed">{f.text}</p>
          </div>
        ))}
      </section>

      <InstallBand />
    </>
  );
}
