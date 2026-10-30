"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState, type FormEvent } from "react";

import { AnswerText } from "@/components/doctor/answer-text";
import { SparkleIcon } from "@/components/icons";
import { StatusPill } from "@/components/manager/columns";
import { Terminal } from "@/components/ui";
import { useMe } from "@/hooks/use-me";
import { api, postStream, type AnalyzedLogs } from "@/lib/api";

const STATUS = { healthy: "ok", degraded: "warning", failing: "bad" } as const;
const SEVERITY = { critical: "text-danger", warning: "text-warning", info: "text-muted" } as const;

type Turn = { role: "user" | "assistant"; content: string };

/**
 * AI analysis of the logs on screen: summary, the lines that matter (click one to jump to it),
 * root cause, fix steps with complete commands, what to watch next, and follow-up questions.
 */
export function LogAnalysisPanel({
  cluster,
  namespace,
  pod,
  container,
  previous,
  onJump,
  onClose,
}: {
  cluster: string;
  namespace: string;
  pod: string;
  container?: string;
  previous: boolean;
  onJump: (line: string) => void;
  onClose: () => void;
}) {
  const status = useQuery({ queryKey: ["ai-status"], queryFn: api.aiStatus, staleTime: 60_000 });
  const admin = useMe().data?.role === "admin";
  const run = useQuery({
    queryKey: ["log-analysis", cluster, namespace, pod, container, previous],
    queryFn: () => api.analyzeLogs({ cluster_id: cluster, namespace, pod, container, previous }),
    enabled: status.data?.enabled === true,
    staleTime: Infinity,
    retry: false,
  });

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border p-4">
      <header className="flex items-center gap-2">
        <SparkleIcon className="text-accent" />
        <h3 className="flex-1 text-sm font-semibold">Log analysis</h3>
        {run.data && <StatusPill text={run.data.analysis.status} tone={STATUS[run.data.analysis.status]} />}
        <button type="button" onClick={() => run.refetch()} disabled={run.isFetching} className="text-sm text-subtle hover:text-fg disabled:opacity-50">
          Again
        </button>
        <button type="button" onClick={onClose} className="text-sm text-subtle hover:text-fg">
          Close
        </button>
      </header>
      {status.data && !status.data.enabled && (
        <p className="text-sm text-muted">
          Analysis needs an AI model.{" "}
          {admin && (
            <Link href="/settings#ai" className="font-medium text-accent hover:underline">
              Add a Model
            </Link>
          )}
        </p>
      )}
      {run.isFetching && !run.data && (
        <p className="flex items-center gap-2 text-sm text-muted">
          <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
          Reading the logs, the pod&apos;s status and its events
        </p>
      )}
      {run.error && <p className="text-sm text-danger">{(run.error as Error).message}</p>}
      {run.data && <Result data={run.data} cluster={cluster} onJump={onJump} />}
    </section>
  );
}

function Result({ data, cluster, onJump }: { data: AnalyzedLogs; cluster: string; onJump: (line: string) => void }) {
  const a = data.analysis;
  const owner = data.pod.replace(/-[a-z0-9]{5,10}-[a-z0-9]{5}$/, "");
  return (
    <div className="flex flex-col gap-4 text-sm">
      <p>{a.summary}</p>
      {a.errors.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium text-subtle">Lines that matter</p>
          <ul className="flex flex-col gap-1">
            {a.errors.map((e) => (
              <li key={e.line}>
                <button type="button" onClick={() => onJump(data.lines[e.line] ?? "")} className="flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-surface">
                  <span className="truncate font-mono text-xs text-muted">{data.lines[e.line]}</span>
                  <span className={SEVERITY[e.severity]}>{e.meaning}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {a.root_cause && (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-subtle">Root cause</p>
          <p className="font-medium">{a.root_cause}</p>
        </div>
      )}
      {a.fix_steps.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-subtle">How to fix</p>
          <ol className="flex list-decimal flex-col gap-1 pl-5">
            {a.fix_steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </div>
      )}
      {a.commands.length > 0 && <Terminal commands={a.commands} />}
      {a.watch.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-subtle">Watch next</p>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-muted">
            {a.watch.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      )}
      <Link
        href={`/doctor?${new URLSearchParams({ cluster, namespace: data.namespace, focus: `Pod/${data.namespace}/${data.pod}` })}`}
        className="self-start text-sm font-medium text-accent hover:underline"
        title={`Investigate ${owner} with Cluster Doctor`}
      >
        Investigate this workload
      </Link>
      <FollowUp data={data} cluster={cluster} />
    </div>
  );
}

function FollowUp({ data, cluster }: { data: AnalyzedLogs; cluster: string }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [step, setStep] = useState<string | null>(null);
  const ask = useMutation({
    mutationFn: (message: string) =>
      postStream<{ answer: string }>(
        "/api/v1/ai/logs/ask",
        {
          cluster_id: cluster,
          namespace: data.namespace,
          pod: data.pod,
          container: data.container,
          previous: data.previous,
          analysis: data.analysis,
          history: turns,
          message,
        },
        setStep,
      ),
    onSuccess: (r, message) => {
      setTurns((t) => [...t, { role: "user", content: message }, { role: "assistant", content: r.answer }]);
      setStep(null);
    },
    onError: () => setStep(null),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    ask.mutate(text.trim());
    setText("");
  };
  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3">
      {turns.map((t, i) =>
        t.role === "user" ? (
          <p key={i} className="self-end rounded-lg bg-surface-2 px-3 py-2">
            {t.content}
          </p>
        ) : (
          <AnswerText key={i} text={t.content} />
        ),
      )}
      {ask.isPending && (
        <p className="flex items-center gap-2 text-muted">
          <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
          {step ?? "Thinking"}
        </p>
      )}
      {ask.error && <p className="text-danger">{(ask.error as Error).message}</p>}
      <form onSubmit={submit} className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ask about these logs"
          aria-label="Ask about these logs"
          className="h-9 min-w-0 flex-1 rounded-lg border border-control bg-bg px-3 text-sm outline-none focus:border-accent"
        />
        <button type="submit" disabled={!text.trim() || ask.isPending} className="h-9 rounded-lg border border-control px-3 text-sm font-medium disabled:opacity-50">
          Ask
        </button>
      </form>
    </div>
  );
}
