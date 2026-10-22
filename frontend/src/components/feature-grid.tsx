import type { ReactNode } from "react";

function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-[3px] border border-fg/60 px-2 py-0.5 font-mono text-xs text-fg/90">
      {children}
    </span>
  );
}

function Pill({ children, dot }: { children: ReactNode; dot: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-0.5 text-xs text-muted">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {children}
    </span>
  );
}

const features: { title: string; description: string; visual: ReactNode }[] = [
  {
    title: "Evidence Collection",
    description: "Reads pods, events, logs and services without changing anything",
    visual: (
      <>
        <Tag>pods</Tag>
        <Tag>events</Tag>
        <Tag>logs</Tag>
      </>
    ),
  },
  {
    title: "Failure Detection",
    description: "Spots the common Kubernetes failures in seconds",
    visual: (
      <>
        <Pill dot="bg-danger">CrashLoopBackOff</Pill>
        <Pill dot="bg-warning">OOMKilled</Pill>
      </>
    ),
  },
  {
    title: "AI Investigation",
    description: "Digs into the unclear cases using read-only tools",
    visual: (
      <>
        <Tag>&lt;get_logs&gt;</Tag>
        <Tag>&lt;describe_node&gt;</Tag>
      </>
    ),
  },
  {
    title: "Root Cause and Fix",
    description: "A clear explanation with the exact commands to run",
    visual: <Tag>kubectl set image deploy/api</Tag>,
  },
  {
    title: "Multi-Cluster",
    description: "Switch between every cluster in your kubeconfig",
    visual: (
      <>
        <Pill dot="bg-accent">production</Pill>
        <Pill dot="bg-accent">staging</Pill>
      </>
    ),
  },
  {
    title: "Any Model",
    description: "Use OpenAI, Anthropic, OpenRouter or a local model",
    visual: (
      <>
        <Tag>openai</Tag>
        <Tag>anthropic</Tag>
        <Tag>ollama</Tag>
      </>
    ),
  },
  {
    title: "Secret Redaction",
    description: "Passwords and tokens are masked before they reach any model",
    visual: <Tag>DATABASE_URL=••••••••</Tag>,
  },
];

export function FeatureGrid() {
  return (
    <section className="grid gap-px border-t border-border bg-border md:grid-cols-2 lg:grid-cols-3">
      <div className="bg-grid flex flex-col bg-bg p-8 sm:p-12 md:col-span-2 lg:col-span-1 lg:row-span-2">
        <h2 className="text-3xl font-medium leading-tight tracking-tight sm:text-4xl">
          Everything You Need to Debug Kubernetes
        </h2>
        <p className="mt-6 text-lg text-muted">
          From a failing pod to a working fix, all on your own infrastructure
        </p>
      </div>
      {features.map((feature) => (
        <div
          key={feature.title}
          className="flex flex-col bg-bg p-8 sm:p-12 md:last:col-span-2 lg:last:col-span-1"
        >
          <h3 className="text-lg font-medium">{feature.title}</h3>
          <p className="mt-3 text-muted">{feature.description}</p>
          <div className="mt-6 flex flex-wrap gap-2">{feature.visual}</div>
        </div>
      ))}
    </section>
  );
}
