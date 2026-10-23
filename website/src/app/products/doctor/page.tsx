import type { Metadata } from "next";

import { ProductPage } from "@/components/product-page";

export const metadata: Metadata = {
  title: "Cluster Doctor",
  description: "Find out why Kubernetes workloads fail and how to fix them, with exact commands.",
};

const FEATURES = [
  {
    title: "Collect evidence",
    description:
      "Reads pods, events, workloads, services, nodes and logs, without changing anything",
  },
  {
    title: "Find the problem",
    description: "Recognizes common failures in seconds and groups symptoms under one root cause",
  },
  {
    title: "Dig deeper",
    description:
      "When the cause is unclear, an AI agent checks logs, configs and related resources",
  },
  {
    title: "Fix and verify",
    description:
      "Exact commands with your real resource names, plus commands to confirm the fix worked",
  },
];

const DETECTS = [
  "CrashLoopBackOff",
  "OOMKilled",
  "ImagePullBackOff",
  "Pending pods",
  "Probe failures",
  "Missing config and secrets",
  "Service selectors",
  "Failed init containers",
  "Failed jobs",
  "Stuck rollouts",
  "Node problems",
];

export default function DoctorPage() {
  return (
    <ProductPage
      name="Cluster Doctor"
      standfirst="The AI troubleshooter for Kubernetes. Pick a cluster and a namespace: it finds what is broken, names the root cause in one line and gives you the commands to fix it"
      hero={{
        dark: "/screens/doctor-dark.png",
        light: "/screens/doctor-light.png",
        alt: "Cluster Doctor with the payment incident open: root cause, fix command and the check",
      }}
      video={{ src: "/video/doctor-tour.mp4", poster: "/video/doctor-tour-poster.jpg" }}
      strip={[
        { dark: "/screens/doctor-light.png", alt: "Cluster Doctor in the light theme" },
        {
          dark: "/screens/overview-dark.png",
          alt: "KubeiQ Overview with the failing workloads to investigate",
        },
      ]}
      features={FEATURES}
      sibling={{ href: "/products/map", label: "See Cluster Map" }}
      extra={
        <section className="frame bg-surface py-28 sm:py-36" aria-labelledby="finds">
          <div data-reveal className="grid gap-10 lg:grid-cols-12">
            <h2 id="finds" className="t-title lg:col-span-4">
              What It Finds
            </h2>
            <p className="t-statement flex flex-wrap gap-x-8 gap-y-3 lg:col-span-8">
              {DETECTS.map((item) => (
                <span key={item}>{item}</span>
              ))}
              <span className="font-semibold">and anything else, with a model</span>
            </p>
          </div>
        </section>
      }
      detail={{
        title: "Private by Default",
        text: "Read-only access, secret values never read, and passwords and tokens masked before anything reaches a model. Use OpenAI, Anthropic, OpenRouter, Bedrock, a LiteLLM proxy or a local model",
        shot: {
          dark: "/screens/manager-logs-dark.png",
          alt: "Live logs of the payment pod showing DATABASE_URL is not set",
        },
      }}
    />
  );
}
