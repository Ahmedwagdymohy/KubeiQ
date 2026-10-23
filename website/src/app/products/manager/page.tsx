import type { Metadata } from "next";
import Image from "next/image";

import { FeatureRows, Screen, Split } from "@/components/blocks";
import { FieldHero } from "@/components/field-hero";
import { InstallBand } from "@/components/install-band";
import { rise } from "@/components/ui";

export const metadata: Metadata = {
  title: "Cluster Manager",
  description:
    "Browse every Kubernetes resource, including custom resources. Read YAML, events and logs, read-only by default.",
};

const FEATURES = [
  {
    title: "Every Resource",
    text: "Workloads, networking, config, storage, access and your custom resources, found on the cluster itself",
  },
  {
    title: "YAML, Events and Logs",
    text: "Open any object to read its YAML and recent events. Pods show live logs, including the run before the last crash",
  },
  {
    title: "Safe by Default",
    text: "Read-only until an admin turns changes on. Secret values are never read, only names and metadata",
  },
  {
    title: "Changes You Can Trust",
    text: "Scale, restart, cordon and delete with a confirmation, limited to project editors, and recorded in Activity",
  },
];

/** Sample entries showing how Activity reads; each change and refusal gets one row. */
const ACTIVITY = [
  { time: "09:42", who: "maya", what: "Restarted", target: "checkout", ok: true },
  { time: "09:40", who: "omar", what: "Scaled to 3", target: "orders", ok: false },
  { time: "09:31", who: "maya", what: "Cordoned", target: "kind-worker", ok: true },
];

export default function ManagerProductPage() {
  return (
    <>
      <FieldHero
        lines={["Cluster", "Manager"]}
        size="title"
        shape="screen"
        sentence="Everything in your cluster in one place. Find any resource, read its YAML, events and logs, and jump to the map or an investigation"
        figure={
          <Screen
            dark="/screens/manager-dark.png"
            light="/screens/manager-light.png"
            alt="Cluster Manager listing deployments with one deployment open"
            priority
          />
        }
      />

      <FeatureRows
        title="The Whole Cluster, Read Safely"
        intro="One table per kind, built from the server's own columns, and a panel for the object you pick"
        rows={FEATURES}
      />

      <Split
        title="Logs Without a Terminal"
        picture={<Screen dark="/screens/manager-logs-dark.png" alt="Live logs of a pod in Cluster Manager" />}
      >
        <p>
          Follow a pod&apos;s logs live, switch containers, or read the run before the last restart. When
          something looks wrong, Investigate opens Cluster Doctor on that workload
        </p>
      </Split>

      <section data-reveal className="frame grid gap-10 pt-[clamp(96px,12vw,200px)] md:grid-cols-12 md:gap-6">
        <div className="flex flex-col gap-6 md:col-span-5">
          <h2 data-rise className="text-[clamp(34px,4vw,60px)] font-extrabold leading-[0.98] tracking-[-0.035em]">
            Every Change in the Log
          </h2>
          <p data-rise style={rise(1)} className="max-w-[44ch] text-lg leading-relaxed">
            A ship keeps a log of every course change. Cluster Manager does the same: every scale, restart,
            cordon or delete, and every attempt that was refused, lands in Activity with who, what and when
          </p>
          <figure data-rise style={rise(2)} className="flex flex-col gap-3">
            <div className="relative aspect-[4/3] overflow-hidden bg-surface">
              <Image
                src="/found/hms-dolphin-log-book-1.jpg"
                alt="A page of the log book of HMS Dolphin from 1765, with times, courses and remarks"
                fill
                sizes="(min-width: 768px) 40vw, 100vw"
                className="drift object-cover"
              />
            </div>
            <figcaption className="text-base text-muted">The log book of HMS Dolphin, 1765</figcaption>
          </figure>
        </div>
        <div className="flex flex-col gap-6 md:col-span-6 md:col-start-7">
          <div data-ui data-rise style={rise(2)} className="flex max-w-md flex-col gap-4 rounded-lg border border-border bg-bg p-6">
            <p className="font-semibold">Restart checkout?</p>
            <p className="text-sm text-muted">
              Kubernetes replaces its pods one by one, the same as kubectl rollout restart. This is recorded in
              the activity log.
            </p>
            <div className="flex justify-end gap-2">
              <span className="rounded-md border border-border px-4 py-2 text-sm font-medium">Cancel</span>
              <span className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink">Restart</span>
            </div>
          </div>
          <div data-ui data-rise style={rise(3)} className="rounded-lg border border-border bg-bg">
            <p className="border-b border-border px-5 py-3 text-sm font-semibold">Activity</p>
            <table className="w-full text-left text-sm">
              <thead className="text-muted">
                <tr>
                  <th className="px-5 py-2 font-normal">Time</th>
                  <th className="px-2 py-2 font-normal">Who</th>
                  <th className="px-2 py-2 font-normal">What</th>
                  <th className="px-5 py-2 text-right font-normal">Result</th>
                </tr>
              </thead>
              <tbody>
                {ACTIVITY.map((a) => (
                  <tr key={a.time} className="border-t border-border">
                    <td className="px-5 py-2.5 tabular-nums text-muted">{a.time}</td>
                    <td className="px-2 py-2.5">{a.who}</td>
                    <td className="px-2 py-2.5">
                      {a.what} <code className="font-mono text-[13px]">{a.target}</code>
                    </td>
                    <td className={`px-5 py-2.5 text-right font-medium ${a.ok ? "" : "text-danger"}`}>
                      {a.ok ? "Done" : "Refused"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <InstallBand sentence="Install KubeiQ once and Cluster Manager is ready under the Products menu" />
    </>
  );
}
