import type { Metadata } from "next";
import type { ReactNode } from "react";

import Image from "next/image";

import { CommandBlock } from "@/components/command-block";
import { KubeMascot } from "@/components/kube-mascot";
import { DOCS_URL, GITHUB_URL, INSTALL_COMMAND } from "@/lib/site";

export const metadata: Metadata = {
  title: "Install",
  description: "Install KubeiQ with one command. Every product is included.",
};

/** What the install opens to. */
const AFTER = [
  { src: "/screens/overview-dark.png", alt: "The KubeiQ Overview right after install" },
  { src: "/screens/doctor-light.png", alt: "Cluster Doctor with a root cause and its fix" },
  { src: "/screens/map-dark.png", alt: "Cluster Map of the demo cluster" },
  { src: "/screens/manager-object-light.png", alt: "Cluster Manager with a deployment open" },
];

function Step({ title, children }: { title: string; children: ReactNode }) {
  return (
    <li data-reveal className="flex flex-col gap-5 py-14 odd:bg-surface md:flex-row md:gap-0 frame">
      <h2 className="t-statement font-medium md:w-[var(--axis)] md:shrink-0 md:pr-10">{title}</h2>
      <div className="flex min-w-0 max-w-[68ch] flex-1 flex-col gap-4 text-[17px] text-muted">
        {children}
      </div>
    </li>
  );
}

function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-sm text-fg">{children}</code>
  );
}

export default function InstallPage() {
  return (
    <>
      <section className="frame flex flex-col gap-10 pb-20 pt-16 md:pt-28">
        <div className="flex flex-col gap-8 lg:flex-row-reverse lg:items-end lg:justify-between">
          <h1 className="t-display lg:w-[calc(58vw-var(--m))]">
            <span className="mask-line">
              <span>One command.</span>
            </span>
            <span className="mask-line">
              <span>Every tool.</span>
            </span>
          </h1>
          <p className="after-mask max-w-[34ch] text-[17px]">
            One command installs every KubeiQ product on your laptop or server, with Docker
          </p>
        </div>
        <div className="after-mask relative mt-16 min-w-0 lg:ml-[var(--axis)]">
          <KubeMascot />
          <CommandBlock commands={[INSTALL_COMMAND]} />
        </div>
      </section>

      <div className="grid grid-cols-2 md:grid-cols-4">
        {AFTER.map((shot) => (
          <div key={shot.src} className="relative h-[28svh] overflow-hidden md:h-[40svh]">
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

      <ol className="flex flex-col pb-24">
        <Step title="Check the Requirements">
          <ul className="flex list-disc flex-col gap-2 pl-5">
            <li>Docker with Compose v2, running</li>
            <li>git</li>
            <li>
              A kubeconfig at <Code>~/.kube/config</Code> with access to your clusters. KubeiQ only
              needs read access
            </li>
          </ul>
        </Step>

        <Step title="Run the Installer">
          <CommandBlock commands={[INSTALL_COMMAND]} />
          <p>
            It downloads KubeiQ to <Code>~/kubeiq</Code>, builds it and starts it with Docker
            Compose. The first run takes a few minutes.
          </p>
          <p>Port 3000 already in use? Choose another one:</p>
          <CommandBlock commands={["export KUBEIQ_FRONTEND_PORT=3001", INSTALL_COMMAND]} />
        </Step>

        <Step title="Open KubeiQ">
          <p>
            Go to <Code>http://localhost:3000</Code>, sign in with the details the installer prints,
            open Cluster Doctor, pick a cluster and a namespace, and start an investigation.
          </p>
        </Step>

        <Step title="Add an AI Model">
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

        <Step title="Update or Remove">
          <p>To update, run the installer again. To stop KubeiQ:</p>
          <CommandBlock commands={["cd ~/kubeiq && docker compose down"]} />
        </Step>
      </ol>

      <section className="grid md:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-4 bg-terminal p-8 text-terminal-fg sm:p-12">
          <h2 className="t-statement font-medium">Install Manually</h2>
          <p className="text-terminal-fg/70">
            Prefer to see every step? The installer runs exactly this:
          </p>
          <CommandBlock
            commands={[
              `git clone ${GITHUB_URL}.git ~/kubeiq`,
              "cd ~/kubeiq && cp backend/.env.example backend/.env",
              "docker compose up --build -d",
            ]}
          />
        </div>
        <div className="flex flex-col gap-4 bg-field p-8 text-field-ink sm:p-12">
          <h2 className="t-statement font-medium">Kubernetes</h2>
          <p className="text-[17px]">
            A Helm chart and an in-cluster agent for private clusters are on the way. Follow the{" "}
            <a href={DOCS_URL} className="underline underline-offset-4">
              docs
            </a>{" "}
            for updates.
          </p>
        </div>
      </section>
    </>
  );
}
