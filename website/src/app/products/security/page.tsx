import type { Metadata } from "next";

import { FeatureRows, Screen, Split } from "@/components/blocks";
import { FieldHero } from "@/components/field-hero";
import { InstallBand } from "@/components/install-band";
import { rise } from "@/components/ui";

export const metadata: Metadata = {
  title: "Cluster Security",
  description:
    "Scan Kubernetes clusters with Trivy and Kubescape: misconfigurations, vulnerable images and NSA, MITRE and CIS compliance in one ranked list, with fixes written by AI.",
};

const FEATURES = [
  {
    title: "Two Scanners, One List",
    text: "Trivy checks images for known vulnerabilities and workloads for risky settings. Kubescape checks the cluster against NSA-CISA, MITRE ATT&CK and CIS. The same problem found by both shows once",
  },
  {
    title: "Ranked by Real Risk",
    text: "A workload behind a load balancer that runs as root comes before a theoretical issue in an internal job. Kubernetes' own objects stay out of the way until you ask",
  },
  {
    title: "Fixes You Review",
    text: "Fix with AI reads the live object and writes the patch and the complete kubectl command. Nothing is applied for you",
  },
  {
    title: "Scanners That Only Read",
    text: "KubeiQ puts a read-only window between the scanners and your cluster. Every write, every Secret and every exec is refused, and each scan shows what was refused",
  },
];

/** Requests one scan of a test cluster tried to make, as each scan reports them. */
const REFUSED = [
  { what: "Create an Event", count: 125 },
  { what: "List Secrets", count: 1 },
  { what: "Start a node Job", count: 0 },
];

export default function SecurityProductPage() {
  return (
    <>
      <FieldHero
        lines={["Cluster", "Security"]}
        size="title"
        shape="screen"
        sentence="Know how exposed your cluster is and what to fix first. Misconfigurations, vulnerable images and compliance in one list, with fixes you can run"
        figure={
          <Screen
            dark="/screens/security-dark.jpg"
            light="/screens/security-light.jpg"
            alt="Cluster Security overview with the score, findings by severity, framework scores and the highest risks"
            priority
          />
        }
      />

      <FeatureRows
        title="Open-Source Scanners, Made Useful"
        intro="Trivy and Kubescape do the checking. KubeiQ merges, ranks and explains what they find"
        rows={FEATURES}
      />

      <Split
        title="Every Finding Explained"
        picture={<Screen dark="/screens/security-finding-dark.jpg" alt="A finding open in Cluster Security with its fields to change and the checks that reported it" />}
      >
        <p>
          Open a finding to see why it ranks where it does, what it means, the exact fields to change and every check that
          reported it. Ask the assistant whether it matters in your cluster, or let AI write the fix
        </p>
      </Split>

      <section data-reveal className="frame grid gap-10 pt-[clamp(96px,12vw,200px)] md:grid-cols-12 md:gap-6">
        <div className="flex flex-col gap-6 md:col-span-5">
          <h2 data-rise className="text-[clamp(34px,4vw,60px)] font-extrabold leading-[0.98] tracking-[-0.035em]">
            Read-Only, Proven Every Scan
          </h2>
          <p data-rise style={rise(1)} className="max-w-[44ch] text-lg leading-relaxed">
            Scanners are written to be helpful, not careful. On our test cluster one tried to write events and list Secrets.
            KubeiQ refuses both before they reach the cluster, even with an admin kubeconfig, and tells you how often it did
          </p>
        </div>
        <div className="flex flex-col gap-6 md:col-span-6 md:col-start-7">
          <div data-ui data-rise style={rise(2)} className="rounded-lg border border-border bg-bg">
            <p className="border-b border-border px-5 py-3 text-sm font-semibold">Refused during one scan</p>
            <table className="w-full text-left text-sm">
              <tbody>
                {REFUSED.map((r) => (
                  <tr key={r.what} className="border-t border-border first:border-t-0">
                    <td className="px-5 py-2.5">{r.what}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-muted">{r.count === 0 ? "Never tried: turned off" : r.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <InstallBand sentence="Install KubeiQ once and Cluster Security is ready under the Products menu" />
    </>
  );
}
