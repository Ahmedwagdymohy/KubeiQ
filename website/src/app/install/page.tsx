import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Screen } from "@/components/blocks";
import { CommandBlock } from "@/components/command-block";
import { FieldHero } from "@/components/field-hero";
import { rise } from "@/components/ui";
import { DOCS_URL, GITHUB_URL, INSTALL_COMMAND, UNINSTALL_COMMAND } from "@/lib/site";

export const metadata: Metadata = {
  title: "Install",
  description: "Install KubeiQ with one command. Every product is included.",
};

function Step({ title, children, i }: { title: string; children: ReactNode; i: number }) {
  return (
    <li data-rise style={rise(i)} className="flex flex-col gap-4 py-10 first:pt-0">
      <h2 className="text-[clamp(26px,2.4vw,38px)] font-extrabold leading-[1.05] tracking-[-0.03em]">{title}</h2>
      <div className="flex min-w-0 flex-col gap-4 text-lg leading-relaxed">{children}</div>
    </li>
  );
}

function Code({ children }: { children: ReactNode }) {
  return <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-base">{children}</code>;
}

export default function InstallPage() {
  return (
    <>
      <FieldHero
        lines={["Install", "KubeiQ"]}
        size="title"
        stack
        shape="screen"
        action={null}
        sentence="One command installs every KubeiQ product on your laptop or server"
        figure={
          <Screen
            dark="/screens/doctor-incident-dark.jpg"
            light="/screens/doctor-incident-light.jpg"
            alt="Cluster Doctor with a root cause and the commands to fix it"
            priority
            sizes="(min-width: 768px) 44vw, 86vw"
          />
        }
      >
        <div data-rise className="relative w-full md:max-w-[56%] lg:max-w-[52vw]">
          <CommandBlock commands={[INSTALL_COMMAND]} />
        </div>
      </FieldHero>

      <section data-reveal className="frame grid gap-12 pt-[clamp(96px,12vw,200px)] md:grid-cols-12 md:gap-6">
        <div className="md:col-span-5">
          <div className="flex flex-col gap-4 md:sticky md:top-8">
            <Screen dark="/screens/fact-open.jpg" alt="The KubeiQ Overview you open after the install" />
            <p className="text-base text-muted">Five steps to this Overview, the same on a laptop or a server</p>
          </div>
        </div>

        <ol className="flex min-w-0 flex-col md:col-span-6 md:col-start-7">
          <Step i={0} title="Check the Requirements">
            <ul className="flex list-disc flex-col gap-2 pl-5">
              <li>Docker with Compose v2, running</li>
              <li>git</li>
              <li>
                A kubeconfig at <Code>~/.kube/config</Code> with access to your clusters. KubeiQ only needs
                read access
              </li>
            </ul>
          </Step>

          <Step i={1} title="Run the Installer">
            <CommandBlock commands={[INSTALL_COMMAND]} />
            <p>
              It downloads KubeiQ to <Code>~/kubeiq</Code>, builds it and starts it with Docker Compose. The
              first run takes a few minutes.
            </p>
            <p>Port 3000 already in use? Choose another one:</p>
            <CommandBlock commands={["export KUBEIQ_FRONTEND_PORT=3001", INSTALL_COMMAND]} />
          </Step>

          <Step i={2} title="Open KubeiQ">
            <p>
              Go to <Code>http://localhost:3000</Code> and sign in as <Code>admin</Code> with the master key
              the installer prints. Open Cluster Doctor, pick a cluster and a namespace, and start a scan.
            </p>
            <Screen
              dark="/screens/doctor-incident-dark.jpg"
              light="/screens/doctor-incident-light.jpg"
              alt="Cluster Doctor after a scan, showing a failing workload and the fix"
            />
          </Step>

          <Step i={3} title="Add an AI Model">
            <p>
              Optional. Without a model, KubeiQ still finds known failures and gives you the fix. With one, it
              also investigates the unclear cases. Add it in Settings, or set it in{" "}
              <Code>~/kubeiq/backend/.env</Code>, for example:
            </p>
            <CommandBlock commands={["KUBEIQ_LLM_MODEL=openai/gpt-4.1", "KUBEIQ_LLM_API_KEY=<your-api-key>"]} />
            <p>Then apply it:</p>
            <CommandBlock commands={["cd ~/kubeiq && docker compose up -d"]} />
            <p>
              Anthropic, OpenRouter, Azure, Bedrock, Gemini, Ollama and LiteLLM proxies work too. The file lists
              an example for each.
            </p>
          </Step>

          <Step i={4} title="Update or Remove">
            <p>To update, run the installer again. To stop KubeiQ:</p>
            <CommandBlock commands={["cd ~/kubeiq && docker compose down"]} />
            <p>
              To remove it, with its data, run the uninstaller. It asks first, keeps the images and tools
              other software uses, and never touches your clusters. Add --keep-data to install again later
              as it was.
            </p>
            <CommandBlock commands={[UNINSTALL_COMMAND]} />
          </Step>
        </ol>
      </section>

      <section data-reveal className="mt-[clamp(96px,12vw,200px)] grid md:grid-cols-2">
        <div className="frame flex flex-col gap-4 bg-surface py-12 md:py-16">
          <h2 data-rise className="text-[clamp(26px,2.4vw,38px)] font-extrabold leading-[1.05] tracking-[-0.03em]">
            Install Manually
          </h2>
          <p data-rise className="text-lg">Prefer to see every step? The installer runs exactly this:</p>
          <CommandBlock
            commands={[
              `git clone ${GITHUB_URL}.git ~/kubeiq`,
              "cd ~/kubeiq && cp backend/.env.example backend/.env",
              "docker compose up --build -d",
            ]}
          />
        </div>
        <div className="frame flex flex-col gap-4 bg-surface-2 py-12 md:py-16">
          <h2 data-rise className="text-[clamp(26px,2.4vw,38px)] font-extrabold leading-[1.05] tracking-[-0.03em]">
            Kubernetes
          </h2>
          <p data-rise className="max-w-[44ch] text-lg leading-relaxed">
            A Helm chart and an in-cluster agent for private clusters are on the way. Follow the{" "}
            <a href={DOCS_URL} className="font-semibold underline decoration-2 underline-offset-4">
              docs
            </a>{" "}
            for updates.
          </p>
        </div>
      </section>
    </>
  );
}
