import type { Metadata } from "next";
import type { ReactNode } from "react";

import { CommandBlock } from "@/components/command-block";
import { AIModelPanel, RequirementsCheck } from "@/components/fragments";
import { KubeMascot } from "@/components/kube-mascot";
import { Block, MarginList, PageIntro } from "@/components/page-parts";
import { Rise, Screen } from "@/components/ui";
import { DOCS_URL, GITHUB_URL, INSTALL_COMMAND } from "@/lib/site";

export const metadata: Metadata = {
  title: "Install",
  description: "Install KubeiQ with one command. Every product is included.",
};

function Code({ children }: { children: ReactNode }) {
  return <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[15px] text-fg">{children}</code>;
}

export default function InstallPage() {
  return (
    <>
      <PageIntro
        title={
          <>
            Install KubeiQ. <br className="hidden sm:block" />
            One command, every product.
          </>
        }
        lead="Run this on your laptop or a server. It downloads KubeiQ, builds it and starts it with Docker Compose"
      >
        <div className="grid12 gap-y-8 pt-16">
          <div className="relative col-span-12 lg:col-span-8">
            <KubeMascot />
            <CommandBlock commands={[INSTALL_COMMAND]} wrap />
          </div>
          <p className="col-span-12 text-base text-muted lg:col-span-3 lg:col-start-10">
            The first run takes a few minutes. Sign in as admin with the master key it prints
          </p>
        </div>
      </PageIntro>

      <Block title="Check the Requirements" lead="Docker with Compose v2, git, and a kubeconfig at ~/.kube/config with access to your clusters. KubeiQ only needs read access">
        <div className="grid12 gap-y-8">
          <Rise className="col-span-12 lg:col-span-6">
            <RequirementsCheck />
          </Rise>
          <div className="col-span-12 flex flex-col gap-4 text-lg leading-relaxed lg:col-span-5 lg:col-start-8">
            <Rise as="p">Port 3000 already in use? Choose another one before you run the installer:</Rise>
            <Rise delay={80}>
              <CommandBlock commands={["export KUBEIQ_FRONTEND_PORT=3001", INSTALL_COMMAND]} wrap />
            </Rise>
          </div>
        </div>
      </Block>

      <Block title="Open KubeiQ" lead="Go to http://localhost:3000, sign in, pick a cluster and a namespace in Cluster Doctor and start an investigation">
        <div className="grid gap-6 md:grid-cols-2">
          <Rise as="figure" className="flex flex-col gap-3">
            <Screen
              light="/screens/doctor-incident-light.png"
              dark="/screens/doctor-incident-dark.png"
              alt="Cluster Doctor showing an incident with its fix"
              width={2576}
              height={1528}
            />
            <figcaption className="text-base text-muted">Cluster Doctor after a scan</figcaption>
          </Rise>
          <Rise as="figure" delay={90} className="flex flex-col gap-3">
            <Screen
              light="/screens/map-expanded-light.png"
              dark="/screens/map-overview-dark.png"
              alt="Cluster Map of the demo namespace"
              width={1600}
              height={936}
            />
            <figcaption className="text-base text-muted">Cluster Map of the same namespace</figcaption>
          </Rise>
        </div>
      </Block>

      <Block title="Add an AI Model" lead="Optional. Without a model, KubeiQ still finds known failures and gives you the fix. With one, it also investigates the unclear cases">
        <div className="grid12 gap-y-8">
          <div className="col-span-12 flex flex-col gap-4 text-lg leading-relaxed lg:col-span-5">
            <Rise as="p">
              Add it in Settings, AI Model, or set it in <Code>~/kubeiq/backend/.env</Code>:
            </Rise>
            <Rise delay={60}>
              <CommandBlock
                commands={["KUBEIQ_LLM_MODEL=openai/gpt-4.1", "KUBEIQ_LLM_API_KEY=<your-api-key>"]}
                wrap
              />
            </Rise>
            <Rise as="p" delay={100}>
              Then apply it with <Code>cd ~/kubeiq && docker compose up -d</Code>. Anthropic,
              OpenRouter, Azure, Bedrock, Gemini, Ollama and LiteLLM proxies work too
            </Rise>
          </div>
          <Rise delay={140} className="col-span-12 lg:col-span-6 lg:col-start-7">
            <AIModelPanel />
          </Rise>
        </div>
      </Block>

      <Block title="Update, Remove or Do It by Hand">
        <MarginList
          items={[
            ["Update", <p key="update">Run the installer again. It pulls the new version and keeps your settings</p>],
            ["Stop", <CommandBlock key="stop" commands={["cd ~/kubeiq && docker compose down"]} wrap />],
            [
              "Install manually",
              <CommandBlock
                key="manual"
                commands={[
                  `git clone ${GITHUB_URL}.git ~/kubeiq`,
                  "cd ~/kubeiq && cp backend/.env.example backend/.env",
                  "docker compose up --build -d",
                ]}
                wrap
              />,
            ],
            [
              "Kubernetes",
              <p key="k8s">
                A Helm chart and an in-cluster agent for private clusters are on the way. Follow the{" "}
                <a href={DOCS_URL} className="font-medium text-fg underline underline-offset-4 hover:text-accent">
                  docs
                </a>{" "}
                for updates
              </p>,
            ],
          ]}
        />
      </Block>

      <div className="pb-[14svh]" />
    </>
  );
}
