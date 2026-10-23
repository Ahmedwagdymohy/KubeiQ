import type { Metadata } from "next";

import { BearingFinder } from "@/components/bearing-finder";
import { FeatureRows, Screen } from "@/components/blocks";
import { FailureBand } from "@/components/failure-band";
import { FieldHero } from "@/components/field-hero";
import { InstallBand } from "@/components/install-band";
import { ScanStages } from "@/components/scan-stages";

export const metadata: Metadata = {
  title: "Cluster Doctor",
  description: "Find out why Kubernetes workloads fail and how to fix them, with exact commands.",
};

const SAFE = [
  {
    title: "Read-Only",
    text: "Cluster Doctor uses read-only access and never reads secret values, only their names and metadata",
  },
  {
    title: "Private by Default",
    text: "Passwords, tokens and keys in logs and config are masked before anything reaches a model",
  },
  {
    title: "Your Model, or None",
    text: "OpenAI, Anthropic, OpenRouter, Bedrock, Azure, a LiteLLM proxy or a local model. Without one, known failures are still found and fixed",
  },
];

export default function DoctorPage() {
  return (
    <>
      <FieldHero
        lines={["Cluster", "Doctor"]}
        size="title"
        shape="screen"
        sentence="Pick a cluster and a namespace. Cluster Doctor finds what is broken, names the root cause in one line and gives you the commands to fix it"
        figure={
          <Screen
            dark="/screens/doctor-incident-dark.png"
            light="/screens/doctor-incident-light.png"
            alt="Cluster Doctor showing a failing workload with its root cause and the fix command"
            priority
          />
        }
      />

      <section data-reveal className="frame pt-[clamp(96px,12vw,200px)]">
        <BearingFinder />
      </section>

      <section data-reveal className="frame pt-[clamp(96px,12vw,200px)]">
        <ScanStages />
      </section>

      <FailureBand />

      <FeatureRows
        title="Safe to Point at Production"
        intro="Cluster Doctor looks and explains. Changes happen only when you run the commands yourself, or in Cluster Manager once an admin allows them"
        rows={SAFE}
      />

      <InstallBand sentence="Install KubeiQ once and Cluster Doctor is ready under the Products menu" />
    </>
  );
}
