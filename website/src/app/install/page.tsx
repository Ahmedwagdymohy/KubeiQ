import type { Metadata } from "next";
import type { ReactNode } from "react";

import { CommandBlock } from "@/components/command-block";
import { DOCS_URL, GITHUB_URL, INSTALL_COMMAND } from "@/lib/site";

export const metadata: Metadata = {
  title: "Install",
  description: "Install KubeiQ with one command. Every product is included.",
};

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="grid gap-4 border-t border-border px-6 py-12 sm:px-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,3fr)] lg:gap-12">
      <div className="flex items-baseline gap-4">
        <span className="font-mono text-sm text-accent">{n}</span>
        <h2 className="text-xl font-medium">{title}</h2>
      </div>
      <div className="flex min-w-0 flex-col gap-4 text-muted">{children}</div>
    </li>
  );
}

function Code({ children }: { children: ReactNode }) {
  return <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-sm text-fg">{children}</code>;
}

export default function InstallPage() {
  return (
    <>
      <section className="bg-grid flex flex-col items-center px-6 py-24 text-center">
        <h1 className="text-4xl font-medium tracking-tight sm:text-6xl">Install KubeiQ</h1>
        <p className="mt-6 max-w-2xl text-lg text-muted">
          One command installs every KubeiQ product on your laptop or server
        </p>
        <div className="mt-12 w-full max-w-4xl">
          <CommandBlock commands={[INSTALL_COMMAND]} />
        </div>
      </section>

      <ol className="flex flex-col">
        <Step n={1} title="Check the Requirements">
          <ul className="flex list-disc flex-col gap-2 pl-5">
            <li>Docker with Compose v2, running</li>
            <li>git</li>
            <li>
              A kubeconfig at <Code>~/.kube/config</Code> with access to your clusters. KubeiQ only
              needs read access
            </li>
          </ul>
        </Step>

        <Step n={2} title="Run the Installer">
          <CommandBlock commands={[INSTALL_COMMAND]} />
          <p>
            It downloads KubeiQ to <Code>~/kubeiq</Code>, builds it and starts it with Docker
            Compose. The first run takes a few minutes.
          </p>
          <p>Port 3000 already in use? Choose another one:</p>
          <CommandBlock commands={["export KUBEIQ_FRONTEND_PORT=3001", INSTALL_COMMAND]} />
        </Step>

        <Step n={3} title="Open KubeiQ">
          <p>
            Go to <Code>http://localhost:3000</Code>, open Cluster Doctor from the Products menu,
            pick a cluster and a namespace, and start an investigation.
          </p>
        </Step>

        <Step n={4} title="Add an AI Model">
          <p>
            Optional. Without a model, KubeiQ still finds known failures and gives you the fix. With
            one, it also investigates the unclear cases. Set your model in{" "}
            <Code>~/kubeiq/backend/.env</Code>, for example:
          </p>
          <CommandBlock
            commands={["KUBEIQ_LLM_MODEL=openai/gpt-4.1", "KUBEIQ_LLM_API_KEY=<your-api-key>"]}
          />
          <p>Then apply it:</p>
          <CommandBlock commands={["cd ~/kubeiq && docker compose up -d"]} />
          <p>
            Anthropic, OpenRouter, Azure, Bedrock, Gemini, Ollama and LiteLLM proxies work too. The
            file lists an example for each.
          </p>
        </Step>

        <Step n={5} title="Update or Remove">
          <p>To update, run the installer again. To stop KubeiQ:</p>
          <CommandBlock commands={["cd ~/kubeiq && docker compose down"]} />
        </Step>
      </ol>

      <section className="grid gap-px border-t border-border bg-border md:grid-cols-2">
        <div className="flex flex-col gap-3 bg-bg p-8 sm:p-12">
          <h2 className="text-lg font-medium">Install Manually</h2>
          <p className="text-muted">Prefer to see every step? The installer runs exactly this:</p>
          <CommandBlock
            commands={[
              `git clone ${GITHUB_URL}.git ~/kubeiq`,
              "cd ~/kubeiq && cp backend/.env.example backend/.env",
              "docker compose up --build -d",
            ]}
          />
        </div>
        <div className="flex flex-col gap-3 bg-bg p-8 sm:p-12">
          <h2 className="text-lg font-medium">Kubernetes</h2>
          <p className="text-muted">
            A Helm chart and an in-cluster agent for private clusters are on the way. Follow the{" "}
            <a href={DOCS_URL} className="text-accent hover:underline">
              docs
            </a>{" "}
            for updates.
          </p>
        </div>
      </section>
    </>
  );
}
