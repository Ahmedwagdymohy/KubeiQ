"use client";

import { useQuery } from "@tanstack/react-query";

import { Section } from "@/components/settings/fields";
import { api } from "@/lib/api";
import { GITHUB_URL } from "@/lib/products";

export function AboutSection() {
  const about = useQuery({ queryKey: ["settings", "about"], queryFn: api.about });
  const rows: [string, string][] = about.data
    ? [
        ["Version", about.data.version],
        ["Database", about.data.database],
        ["Secrets", about.data.secrets],
      ]
    : [];
  return (
    <Section id="about" title="About" description="This KubeiQ installation">
      <dl className="grid max-w-3xl grid-cols-[auto_minmax(0,1fr)] gap-x-10 gap-y-2 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-subtle">{k}</dt>
            <dd className="text-fg">{v}</dd>
          </div>
        ))}
        <dt className="text-subtle">Docs</dt>
        <dd>
          <a href={`${GITHUB_URL}#readme`} className="text-accent hover:underline">
            github.com/Ahmedwagdymohy/KubeiQ
          </a>
        </dd>
      </dl>
    </Section>
  );
}
