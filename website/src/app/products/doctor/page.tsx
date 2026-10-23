import type { Metadata } from "next";

import { Redaction } from "@/components/fragments";
import { IncidentStates } from "@/components/incident-states";
import { Block, Close, MarginList, PageIntro } from "@/components/page-parts";
import { Readout } from "@/components/readout";
import { RecognizeTable } from "@/components/recognize-table";
import { PrimaryLink, Rise, Screen, TextLink } from "@/components/ui";

export const metadata: Metadata = {
  title: "Cluster Doctor",
  description: "Find out why Kubernetes workloads fail and how to fix them, with exact commands.",
};

export default function DoctorPage() {
  return (
    <>
      <PageIntro
        title={
          <>
            Cluster Doctor. <br className="hidden sm:block" />
            The cause and the fix.
          </>
        }
        lead="Pick a cluster and a namespace. Cluster Doctor finds what is broken, names the root cause in one line and gives you the commands to fix it"
        actions={
          <>
            <TextLink href="#how-it-works">How it works</TextLink>
            <PrimaryLink href="/install">Get Started</PrimaryLink>
          </>
        }
      >
        <Rise>
          <Screen
            light="/screens/doctor-incident-light.png"
            dark="/screens/doctor-incident-dark.png"
            alt="Cluster Doctor with report-worker open: memory limit 64Mi is too low, the fix command and the check"
            width={2576}
            height={1528}
            priority
          />
        </Rise>
      </PageIntro>

      <Block
        title="Try It on the Demo"
        lead="The broken workloads that ship with KubeiQ, and what Cluster Doctor says about each. Pick one"
      >
        <Readout />
      </Block>

      <Block id="how-it-works" title="How It Works">
        <MarginList
          items={[
            ["Collect evidence", "Reads pods, events, workloads, services, nodes and logs, without changing anything. Logs are capped, so a scan never drags the whole cluster along"],
            ["Find the problem", "Recognizes common failures in seconds and groups the symptoms under one root cause, so five failing pods are one incident, not five"],
            ["Dig deeper", "When the cause is unclear, an AI agent checks logs, configs and related resources with read-only tools, then writes its answer the same way"],
            ["Fix and verify", "Exact commands with your real resource names, then commands that check the fix on the workload, never on a pod that is about to be replaced"],
          ]}
        />
      </Block>

      <Block title="From Red to Running" lead="The same incident as it arrives, opened, and after the fix">
        <IncidentStates />
      </Block>

      <Block title="What It Finds" lead="Known failures are recognized instantly. Anything else goes to the AI agent, so an unhealthy pod is never reported as fine">
        <Rise>
          <RecognizeTable />
        </Rise>
      </Block>

      <Block title="Safe by Design">
        <div className="grid12 gap-y-10">
          <div className="col-span-12 lg:col-span-5">
            <MarginList
              items={[
                ["Read-only", "Uses read access only and never reads secret values"],
                ["Masked", "Passwords and tokens are masked before anything reaches a model"],
                ["Your model", "OpenAI, Anthropic, OpenRouter, Bedrock, a LiteLLM proxy or a local model"],
              ]}
            />
          </div>
          <Rise delay={120} className="col-span-12 lg:col-span-6 lg:col-start-7">
            <Redaction />
          </Rise>
        </div>
      </Block>

      <Close sentence="Install KubeiQ once and Cluster Doctor is ready in the sidebar, next to your clusters." />
    </>
  );
}
