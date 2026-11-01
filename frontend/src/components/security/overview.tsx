"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { SparkleIcon } from "@/components/icons";
import { SeverityCounts, SeverityPill, targetLabel } from "@/components/security/shared";
import { RichText } from "@/components/ui";
import { api, type SecurityFinding, type SecurityOverview } from "@/lib/api";

function verdict(score: number) {
  if (score >= 80) return { text: "Good", tone: "text-healthy" };
  if (score >= 50) return { text: "Needs work", tone: "text-warning" };
  return { text: "At risk", tone: "text-danger" };
}

const REFUSED: Record<string, string> = {
  "Scanners are read-only": "writes",
  "Secrets are not available to scanners": "Secret reads",
  "Scanners may not reach into workloads": "exec or proxy requests",
};

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-border p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-subtle">{title}</h2>
      {children}
    </section>
  );
}

/** Score history as a small line on a fixed 0-100 scale, one point per scan. */
function Trend({ history }: { history: SecurityOverview["history"] }) {
  const points = history.filter((p): p is { at: string; score: number } => p.score !== null);
  if (points.length < 2) return <span className="text-xs text-subtle">The trend appears after the next scan</span>;
  const width = 200;
  const height = 36;
  const x = (i: number) => (i / (points.length - 1)) * width;
  const y = (v: number) => height - 2 - (v / 100) * (height - 4);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.score).toFixed(1)}`).join(" ");
  const change = points[points.length - 1].score - points[0].score;
  return (
    <span className="flex items-center gap-3">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-9 w-40" role="img" aria-label={`Score over the last ${points.length} scans`}>
        <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="text-xs text-muted">
        {change === 0 ? "No change" : `${change > 0 ? "+" : ""}${change}`} over {points.length} scans
      </span>
    </span>
  );
}

export function OverviewView({
  cluster,
  aiEnabled,
  onOpen,
  onTab,
}: {
  cluster: string;
  aiEnabled: boolean;
  onOpen: (f: SecurityFinding) => void;
  onTab: (tab: "findings" | "vulnerabilities" | "compliance") => void;
}) {
  const queryClient = useQueryClient();
  const data = useQuery({ queryKey: ["security-overview", cluster], queryFn: () => api.securityOverview(cluster) });
  const summary = useMutation({
    mutationFn: () => api.securitySummary(cluster),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["security-overview", cluster] }),
  });
  if (data.isPending) return <p className="text-sm text-muted">Reading the last scan</p>;
  if (data.error) return <p className="text-sm text-danger">{data.error.message}</p>;
  const o = data.data;
  const score = o.scan.score;
  const v = score !== null ? verdict(score) : null;
  const blocked = Object.entries(o.refused);
  const ai = o.ai_summary ?? summary.data ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card title="Score">
          {score !== null && v ? (
            <span className="flex items-baseline gap-2">
              <span className="text-3xl font-semibold tabular-nums">{score}</span>
              <span className="text-sm text-subtle">/ 100</span>
              <span className={`text-sm font-medium ${v.tone}`}>{v.text}</span>
            </span>
          ) : (
            <span className="text-sm text-muted">No score</span>
          )}
          <Trend history={o.history} />
        </Card>
        <Card title="Findings">
          <button type="button" onClick={() => onTab("findings")} className="text-left text-3xl font-semibold tabular-nums hover:text-accent">
            {Object.values(o.findings).reduce((a, b) => a + b, 0)}
          </button>
          <SeverityCounts counts={o.findings} />
        </Card>
        <Card title="Vulnerabilities">
          <button type="button" onClick={() => onTab("vulnerabilities")} className="text-left text-3xl font-semibold tabular-nums hover:text-accent">
            {Object.values(o.vulnerabilities).reduce((a, b) => a + b, 0)}
          </button>
          <span className="text-xs text-subtle">
            {o.images === 0 ? "No images were scanned" : `in ${o.images} ${o.images === 1 ? "image" : "images"}`}
            {o.cluster_wide && o.fixable ? `, ${o.fixable} with a fix` : ""}
          </span>
        </Card>
        <Card title="Frameworks">
          {o.frameworks.length === 0 ? (
            <span className="text-sm text-muted">Framework scores need access to the whole cluster</span>
          ) : (
            <button type="button" onClick={() => onTab("compliance")} className="flex flex-col gap-2 text-left">
              {o.frameworks.map((f) => (
                <span key={f.name} className="flex flex-col gap-1">
                  <span className="flex justify-between text-xs">
                    <span className="text-muted">{f.name}</span>
                    <span className="tabular-nums">{Math.round(f.score)}%</span>
                  </span>
                  <span className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <span className="block h-full rounded-full bg-accent" style={{ width: `${f.score}%` }} />
                  </span>
                </span>
              ))}
            </button>
          )}
        </Card>
      </div>

      {o.cluster_wide && (aiEnabled || ai) && (
        <section className="flex flex-col gap-3 rounded-lg border border-border p-5">
          <h2 className="flex items-center gap-2 font-semibold">
            <SparkleIcon width={15} height={15} className="text-accent" /> What this means
          </h2>
          {ai ? (
            <>
              <p className="font-medium">
                <RichText text={ai.headline} />
              </p>
              <p className="text-sm leading-relaxed text-muted">
                <RichText text={ai.summary} />
              </p>
              {ai.priorities.length > 0 && (
                <ol className="flex flex-col gap-2 text-sm">
                  {ai.priorities.map((p, i) => (
                    <li key={p.title} className="flex gap-3">
                      <span className="w-4 shrink-0 font-semibold tabular-nums text-subtle">{i + 1}</span>
                      <span className="flex flex-col gap-0.5">
                        <span className="font-medium">
                          <RichText text={p.title} />
                          {p.target && <span className="ml-2 font-mono text-xs text-subtle">{p.target}</span>}
                        </span>
                        <span className="text-muted">
                          <RichText text={p.why} />
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
              {ai.quick_wins.length > 0 && (
                <div className="flex flex-col gap-1 text-sm">
                  <span className="text-xs font-semibold uppercase tracking-wide text-subtle">Quick wins</span>
                  <ul className="ml-4 list-disc space-y-0.5 text-muted">
                    {ai.quick_wins.map((w) => (
                      <li key={w}>
                        <RichText text={w} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-muted">Get a plain summary of the risks and what to fix first.</p>
              <button
                type="button"
                onClick={() => summary.mutate()}
                disabled={summary.isPending}
                className="h-8 rounded-lg border border-control px-3 text-sm font-medium hover:bg-surface disabled:opacity-60"
              >
                {summary.isPending ? "Summarizing" : "Summarize with AI"}
              </button>
              {summary.error && <p className="w-full text-sm text-danger">{summary.error.message}</p>}
            </div>
          )}
        </section>
      )}

      <section className="flex flex-col rounded-lg border border-border">
        <div className="flex items-center justify-between px-4 py-3">
          <h2 className="font-semibold">Highest risk</h2>
          <button type="button" onClick={() => onTab("findings")} className="text-sm text-accent hover:underline">
            All findings
          </button>
        </div>
        <ul className="flex flex-col border-t border-border">
          {o.top.length === 0 && <li className="px-4 py-3 text-sm text-muted">Nothing found</li>}
          {o.top.map((f) => (
            <li key={f.key} className="border-t border-border/70 first:border-t-0">
              <button type="button" onClick={() => onOpen(f)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-surface">
                <SeverityPill severity={f.severity} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{f.title}</span>
                <span className="hidden min-w-0 truncate font-mono text-xs text-subtle sm:block">
                  {f.target.kind}/{targetLabel(f.target)}
                </span>
                {f.reasons[0] && <span className="hidden shrink-0 text-xs text-muted lg:block">{f.reasons[0]}</span>}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-xs leading-relaxed text-subtle">
        {o.tools
          .map((t) => `${t.tool === "trivy" ? "Trivy" : "Kubescape"} ${t.version} ${t.ok ? `ran in ${Math.round(t.seconds)}s` : `failed: ${t.error}`}`)
          .join(". ")}
        .{" "}
        {blocked.length > 0 &&
          `KubeiQ refused ${blocked
            .map(([reason, n]) => {
              const what = REFUSED[reason] ?? reason.toLowerCase();
              return `${n} ${n === 1 ? what.replace(/s$/, "").replace(/s or /, " or ") : what}`;
            })
            .join(" and ")} from the scanners.`}
      </p>
    </div>
  );
}
