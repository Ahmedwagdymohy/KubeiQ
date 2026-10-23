import type { Metadata } from "next";

import { MapProblems } from "@/components/fragments";
import { Block, Close, MarginList, PageIntro } from "@/components/page-parts";
import { PanelNotes } from "@/components/panel-notes";
import { PrimaryLink, Rise, Screen, TextLink } from "@/components/ui";

export const metadata: Metadata = {
  title: "Cluster Map",
  description:
    "A live picture of your Kubernetes namespace: every resource, how it connects and what is broken.",
};

export default function MapProductPage() {
  return (
    <>
      <PageIntro
        title={
          <>
            Cluster Map. <br className="hidden sm:block" />
            See what is red, and why.
          </>
        }
        lead="A live picture of your namespace. Every app and the resources behind it, how they connect and which ones are broken, with the reason"
        actions={
          <>
            <TextLink href="/products/doctor">Cluster Doctor</TextLink>
            <PrimaryLink href="/install">Get Started</PrimaryLink>
          </>
        }
      >
        <Rise>
          <Screen
            light="/screens/map-expanded-light.png"
            dark="/screens/map-overview-dark.png"
            alt="Cluster Map of kubeiq-demo: billing, payment, analytics and others in red, frontend and checkout healthy"
            width={1600}
            height={936}
            priority
          />
        </Rise>
      </PageIntro>

      <Block title="What You Can Do">
        <div className="grid12 gap-y-10">
          <div className="col-span-12 lg:col-span-6">
            <MarginList
              items={[
                ["See how it connects", "Deployments, pods, services, ingresses, volume claims, configs and secrets, linked the way Kubernetes links them"],
                ["Spot what is broken", "Red means broken, with the reason in one line, so you know where to look before you open a terminal"],
                ["Investigate in one click", "Click a broken resource and Cluster Doctor opens on it with the root cause and the commands to fix it"],
                ["Always current", "The map refreshes every few seconds, so you watch a fix roll out and the red turn cyan"],
              ]}
            />
          </div>
          <Rise delay={120} className="col-span-12 lg:col-span-5 lg:col-start-8">
            <MapProblems />
          </Rise>
        </div>
      </Block>

      <Block title="Click Any Resource" lead="The details panel holds its status, the reason, its facts and what it connects to, with Cluster Doctor one click away">
        <PanelNotes />
      </Block>

      <Block title="Details at a Glance">
        <div className="grid12 gap-y-8">
          <Rise className="col-span-12 lg:col-span-7">
            <Screen
              dark="/screens/map-details-dark.png"
              alt="Cluster Map with a broken pod selected and its details panel open"
              width={1600}
              height={936}
            />
          </Rise>
          <Rise as="p" delay={100} className="col-span-12 max-w-[40ch] text-lg leading-relaxed lg:col-span-4 lg:col-start-9">
            Health comes from the same checks Cluster Doctor runs, so the map and the diagnosis
            always agree on what is broken
          </Rise>
        </div>
      </Block>

      <Close sentence="Cluster Map comes with every install. Open it next to Cluster Doctor and watch the red turn cyan." />
    </>
  );
}
