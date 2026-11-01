"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect } from "react";

import { openAssistant } from "@/components/assistant/assistant-panel";
import { CloseIcon, SparkleIcon } from "@/components/icons";
import { KindIcon } from "@/components/manager/kind-icons";
import { kindResource, objectHref, SeverityPill, targetLabel } from "@/components/security/shared";
import { CodeBlock, RichText, Terminal } from "@/components/ui";
import { api, type SecurityFinding } from "@/lib/api";

/**
 * One finding in a side panel: why it ranks where it does, what the scanners say, the fields to
 * change, and a fix written by AI against the live object. The fix is a patch to review; applying
 * it happens in Cluster Manager, behind the cluster-changes switch and a confirmation.
 */
export function FindingPanel({
  cluster,
  finding,
  aiEnabled,
  onClose,
}: {
  cluster: string;
  finding: SecurityFinding;
  aiEnabled: boolean;
  onClose: () => void;
}) {
  const fix = useMutation({ mutationFn: () => api.securityFix(cluster, finding.key) });
  const href = objectHref(cluster, finding.target);
  const frameworks = [...new Set(finding.checks.flatMap((c) => c.frameworks))];
  useEffect(() => {
    const escape = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [onClose]);

  const explain = () =>
    openAssistant(
      `Explain this security finding on ${finding.target.kind} ${targetLabel(finding.target)}: "${finding.title}" (${finding.checks
        .map((c) => `${c.tool} ${c.id}`)
        .join(", ")}). Is it a real risk in this cluster, and how do I fix it safely?`,
    );

  return (
    <aside
      role="dialog"
      aria-label={finding.title}
      className="fixed inset-0 z-40 flex flex-col bg-bg sm:inset-y-2 sm:left-auto sm:right-2 sm:w-[560px] sm:rounded-xl sm:border sm:border-border sm:shadow-2xl sm:shadow-black/20"
    >
      <header className="flex items-start gap-3 border-b border-border px-5 py-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <SeverityPill severity={finding.severity} />
            <span className="text-xs capitalize text-subtle">{finding.category}</span>
          </div>
          <h2 className="font-semibold leading-snug">{finding.title}</h2>
          <span className="flex items-center gap-1.5 text-sm text-muted">
            <KindIcon resource={kindResource(finding.target.kind)} width={14} height={14} className="text-subtle" />
            {finding.target.kind}
            <span className="truncate font-mono text-xs">{targetLabel(finding.target)}</span>
          </span>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1.5 text-subtle hover:bg-surface hover:text-fg">
          <CloseIcon />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-4 text-sm">
        <div className="flex flex-wrap gap-2">
          {aiEnabled && (
            <button
              type="button"
              onClick={() => fix.mutate()}
              disabled={fix.isPending}
              className="flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 font-semibold text-accent-ink transition-colors hover:bg-accent-strong disabled:opacity-60"
            >
              <SparkleIcon width={14} height={14} />
              {fix.isPending ? "Writing a fix" : fix.data ? "Write again" : "Fix with AI"}
            </button>
          )}
          {aiEnabled && (
            <button type="button" onClick={explain} className="h-8 rounded-lg border border-control px-3 font-medium hover:bg-surface">
              Explain
            </button>
          )}
          {href && (
            <Link href={href} className="flex h-8 items-center rounded-lg border border-control px-3 font-medium hover:bg-surface">
              Open in Cluster Manager
            </Link>
          )}
        </div>

        {fix.error && <p className="text-danger">{fix.error.message}</p>}
        {fix.data && (
          <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
            <h3 className="flex items-center gap-1.5 font-semibold">
              <SparkleIcon width={14} height={14} className="text-accent" /> Suggested fix
            </h3>
            <p className="text-muted">
              <RichText text={fix.data.summary} />
            </p>
            {fix.data.command && <Terminal commands={[fix.data.command]} />}
            {fix.data.patch && !fix.data.command && <CodeBlock text={JSON.stringify(fix.data.patch, null, 2)} />}
            {fix.data.steps.length > 0 && (
              <ol className="ml-4 list-decimal space-y-1 text-muted">
                {fix.data.steps.map((s) => (
                  <li key={s}>
                    <RichText text={s} />
                  </li>
                ))}
              </ol>
            )}
            {fix.data.caution && (
              <p className="rounded-md bg-warning-soft px-3 py-2 text-warning">
                <RichText text={fix.data.caution} />
              </p>
            )}
            <p className="text-xs text-subtle">
              Review it before running. KubeiQ does not apply it: changes go through Cluster Manager, where cluster changes need the admin
              switch and a confirmation.
            </p>
          </section>
        )}

        {finding.reasons.length > 0 && (
          <section className="flex flex-col gap-1.5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-subtle">Why it ranks here</h3>
            <ul className="flex flex-wrap gap-1.5">
              {finding.reasons.map((r) => (
                <li key={r} className="rounded-md bg-surface px-2 py-1 text-xs text-muted">
                  {r}
                </li>
              ))}
            </ul>
          </section>
        )}

        {finding.description && (
          <section className="flex flex-col gap-1.5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-subtle">What it means</h3>
            <p className="leading-relaxed text-muted">{finding.description}</p>
          </section>
        )}

        {finding.remediation && (
          <section className="flex flex-col gap-1.5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-subtle">How to fix it</h3>
            <p className="leading-relaxed text-muted">{finding.remediation}</p>
          </section>
        )}

        {finding.fixes.length > 0 && (
          <section className="flex flex-col gap-1.5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-subtle">Fields to change</h3>
            <ul className="flex flex-col gap-1 font-mono text-xs">
              {finding.fixes.map((f) => (
                <li key={f.path} className="break-all rounded-md bg-surface px-2.5 py-1.5">
                  {f.path}
                  <span className="text-subtle"> = </span>
                  {f.value || <span className="text-warning">&lt;choose a value&gt;</span>}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="flex flex-col gap-1.5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-subtle">Reported by</h3>
          <ul className="flex flex-col gap-1">
            {finding.checks.map((c) => (
              <li key={`${c.tool}:${c.id}`} className="flex items-baseline gap-2">
                <span className="w-20 shrink-0 capitalize text-subtle">{c.tool}</span>
                <span className="font-mono text-xs">{c.id}</span>
                <span className="min-w-0 truncate text-muted">{c.name}</span>
              </li>
            ))}
          </ul>
          {frameworks.length > 0 && <p className="text-xs text-subtle">In {frameworks.join(", ")}</p>}
        </section>
      </div>
    </aside>
  );
}
