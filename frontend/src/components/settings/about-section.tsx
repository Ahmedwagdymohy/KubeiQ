"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { timeAgo } from "@/components/doctor/history-list";
import { secondaryButton, Section } from "@/components/settings/fields";
import { api } from "@/lib/api";
import { GITHUB_URL } from "@/lib/products";

export function AboutSection() {
  const about = useQuery({ queryKey: ["settings", "about"], queryFn: api.about });
  const [copied, setCopied] = useState(false);
  const a = about.data;
  const rows: [string, string][] = a
    ? [
        ["Version", a.version],
        ...(a.build ? ([["Build", a.build]] as [string, string][]) : []),
        ["Database", a.database],
        ["Secrets", a.secrets],
        ["Running since", a.started_at ? `${new Date(a.started_at).toLocaleString()} (${timeAgo(a.started_at).replace(" ago", "")})` : "Unknown"],
        ["Clusters", `${a.clusters} connected`],
        ["Users", String(a.users)],
        ["Server kubeconfig", a.local_kubeconfig.error ? a.local_kubeconfig.error : `${a.local_kubeconfig.contexts} contexts`],
      ]
    : [];
  // Support details without secrets: versions, counts and states only.
  const diagnostics = a
    ? [
        `KubeiQ ${a.version}${a.build ? ` (${a.build})` : ""}`,
        `Python ${a.python ?? "?"}`,
        `Database ${a.database}`,
        `Running since ${a.started_at ?? "?"}`,
        `Clusters ${a.clusters}, users ${a.users}`,
        `Server kubeconfig: ${a.local_kubeconfig.error ?? `${a.local_kubeconfig.contexts} contexts`}`,
        `Browser ${typeof navigator === "undefined" ? "" : navigator.userAgent}`,
      ].join("\n")
    : "";
  return (
    <Section id="about" title="About" description="This KubeiQ installation">
      <div className="flex flex-col gap-5">
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-10 gap-y-2 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-subtle">{k}</dt>
              <dd className="break-words text-fg">{v}</dd>
            </div>
          ))}
          <dt className="text-subtle">Docs</dt>
          <dd>
            <a href={`${GITHUB_URL}#readme`} className="text-accent hover:underline">
              github.com/Ahmedwagdymohy/KubeiQ
            </a>
          </dd>
          <dt className="text-subtle">Changelog</dt>
          <dd>
            <a href={`${GITHUB_URL}/blob/main/CHANGELOG.md`} className="text-accent hover:underline">
              What changed in each version
            </a>
          </dd>
        </dl>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className={secondaryButton}
            disabled={!a}
            onClick={() =>
              navigator.clipboard
                ?.writeText(diagnostics)
                .then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                })
                .catch(() => undefined)
            }
          >
            {copied ? "Copied" : "Copy diagnostics"}
          </button>
          <span className="text-[13px] text-subtle">For support. Versions and counts only, no secrets</span>
        </div>
      </div>
    </Section>
  );
}
