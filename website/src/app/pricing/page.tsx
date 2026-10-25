import type { Metadata } from "next";
import Image from "next/image";

import { Screen } from "@/components/blocks";
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
    picture: "/screens/fact-install.jpg",
    alt: "Settings, About: the version, database and encrypted secrets of this installation",
  },
  {
    title: "The Core Stays Open",
    text: "Cluster Doctor, Cluster Map and Cluster Manager are Apache-2.0. Paid plans add teams and scale, never the tools themselves",
    picture: "/screens/fact-open.jpg",
    alt: "The KubeiQ Overview with the cluster ledger and the failing workloads",
  },
  {
    title: "Your Servers, Your Model",
    text: "KubeiQ runs where you install it and talks to the AI model you choose, so the bill for tokens stays yours",
    picture: "/screens/fact-model.jpg",
    alt: "Settings, AI Model: pick OpenAI, Anthropic, OpenRouter, Azure, Bedrock, Gemini, Ollama or a LiteLLM proxy",
  },
];

export default function PricingPage() {
  return (
    <>
      <FieldHero
        lines={["Free to", "Steer"]}
        shape="screen"
        sentence="Every KubeiQ product is free and open source for up to 3 users and 3 clusters. Pro and Enterprise are coming soon"
        figure={
          <Screen
            dark="/screens/plan-seats.jpg"
            alt="Settings, Users: 1 of 3 users on the Free plan"
            priority
            sizes="(min-width: 768px) 44vw, 86vw"
          />
        }
      />

      <Plans heading={false} />

      <section data-reveal className="frame grid gap-10 pt-[clamp(96px,12vw,200px)] md:grid-cols-3 md:gap-6">
        {FACTS.map((f, i) => (
          <div key={f.title} data-rise style={rise(i)} className="flex flex-col gap-4">
            <div className="relative aspect-[4/3] overflow-hidden bg-surface">
              <Image src={f.picture} alt={f.alt} fill sizes="(min-width: 768px) 33vw, 100vw" className="object-contain p-4" />
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
