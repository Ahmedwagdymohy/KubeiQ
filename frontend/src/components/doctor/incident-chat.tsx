"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { AnswerText } from "@/components/doctor/answer-text";
import { timeAgo } from "@/components/doctor/history-list";
import { ChevronDownIcon, CloseIcon, SparkleIcon } from "@/components/icons";
import { Dot, Spinner } from "@/components/ui";
import { useMe } from "@/hooks/use-me";
import { api, askIncident, type ChatMessage, type ChatThread, type Diagnosis } from "@/lib/api";

const SUGGESTIONS = [
  "Why is this happening now?",
  "What else could this affect?",
  "How do I confirm the fix worked?",
];

const shortName = (workload: string) => workload.split("/").at(-1) ?? workload;

/**
 * Ask KubeiQ: a floating chat on the investigation for follow-up questions, one thread per
 * issue. Threads stay mounted while the popup is closed, so an answer keeps running.
 */
export function AskKubeiQ({
  investigationId,
  diagnoses,
  incidentId,
  onPick,
  open,
  onOpenChange,
}: {
  investigationId: string;
  diagnoses: Diagnosis[];
  incidentId: string;
  onPick: (incidentId: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [visited, setVisited] = useState<string[]>([incidentId]);
  const [busy, setBusy] = useState<Set<string>>(() => new Set());
  if (!visited.includes(incidentId)) setVisited([...visited, incidentId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const setThreadBusy = (id: string, value: boolean) =>
    setBusy((current) => {
      const next = new Set(current);
      if (value) next.add(id);
      else next.delete(id);
      return next;
    });

  return (
    <>
      <div
        role="dialog"
        aria-label="Ask KubeiQ"
        hidden={!open}
        className="fixed inset-0 z-40 flex flex-col bg-bg sm:inset-auto sm:bottom-24 sm:right-6 sm:h-[min(600px,calc(100dvh-8rem))] sm:w-[460px] sm:rounded-xl sm:border sm:border-border sm:shadow-2xl sm:shadow-black/20"
      >
        <header className="flex items-center gap-2 border-b border-border px-4 py-3">
          <SparkleIcon className="text-accent" />
          <h2 className="flex-1 text-sm font-semibold text-fg">Ask KubeiQ</h2>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
            className="rounded p-1 text-subtle transition-colors hover:bg-surface hover:text-fg"
          >
            <CloseIcon />
          </button>
        </header>
        <IssuePicker diagnoses={diagnoses} value={incidentId} onChange={onPick} busy={busy} />
        {visited.map((id) => {
          const diagnosis = diagnoses.find((d) => d.incident_id === id);
          return (
            diagnosis && (
              <Thread
                key={id}
                investigationId={investigationId}
                diagnosis={diagnosis}
                active={id === incidentId && open}
                onBusy={(value) => setThreadBusy(id, value)}
              />
            )
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-label={open ? "Close Ask KubeiQ" : "Ask KubeiQ about these issues"}
        title="Ask KubeiQ"
        className={`fixed bottom-6 right-6 z-40 h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-ink shadow-lg shadow-black/20 transition-transform hover:bg-accent-strong active:scale-95 ${
          open ? "hidden sm:flex" : "flex"
        }`}
      >
        {open ? <ChevronDownIcon width={20} height={20} /> : <SparkleIcon width={20} height={20} />}
        {busy.size > 0 && !open && (
          <span className="absolute right-0 top-0 h-3 w-3 animate-pulse rounded-full border-2 border-bg bg-accent" />
        )}
      </button>
    </>
  );
}

function IssuePicker({
  diagnoses,
  value,
  onChange,
  busy,
}: {
  diagnoses: Diagnosis[];
  value: string;
  onChange: (incidentId: string) => void;
  busy: Set<string>;
}) {
  const [open, setOpen] = useState(false);
  const current = diagnoses.find((d) => d.incident_id === value);
  if (!current) return null;
  return (
    <div className="relative border-b border-border px-4 py-2.5">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex max-w-full items-center gap-2 rounded-md border border-control px-2.5 py-1 text-sm text-fg transition-colors hover:bg-surface"
      >
        <Dot tone={current.severity} />
        <span className="truncate font-medium">{shortName(current.workload)}</span>
        <ChevronDownIcon className="shrink-0 text-subtle" />
      </button>
      {open && (
        <ul className="absolute inset-x-4 top-full z-10 mt-1 max-h-72 overflow-auto rounded-lg border border-border bg-bg p-1 shadow-lg shadow-black/10">
          {diagnoses.map((d) => (
            <li key={d.incident_id}>
              <button
                type="button"
                onClick={() => {
                  onChange(d.incident_id);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-surface ${
                  d.incident_id === value ? "bg-surface-2" : ""
                }`}
              >
                <Dot tone={d.severity} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-medium text-fg">{shortName(d.workload)}</span>
                  <span className="truncate text-xs text-subtle">{d.root_cause}</span>
                </span>
                {busy.has(d.incident_id) && <Spinner />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type Pending = { question: string; step: string | null };

function Thread({
  investigationId,
  diagnosis,
  active,
  onBusy,
}: {
  investigationId: string;
  diagnosis: Diagnosis;
  active: boolean;
  onBusy: (busy: boolean) => void;
}) {
  const incidentId = diagnosis.incident_id;
  const key = ["chat", investigationId, incidentId];
  const queryClient = useQueryClient();
  const thread = useQuery({ queryKey: key, queryFn: () => api.chat(investigationId, incidentId) });
  const me = useMe();
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const count = thread.data?.messages.length ?? 0;

  useEffect(() => () => abort.current?.abort(), []);

  useEffect(() => {
    if (active) input.current?.focus();
  }, [active]);

  // Keep the newest message in view.
  useEffect(() => {
    const el = scroller.current;
    if (el && active) el.scrollTop = el.scrollHeight;
  }, [active, count, pending]);

  // Grow with the text, up to about six lines.
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [draft]);

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || pending) return;
    setError(null);
    setDraft("");
    setPending({ question, step: null });
    onBusy(true);
    const controller = new AbortController();
    abort.current = controller;
    try {
      const added = await askIncident(
        investigationId,
        incidentId,
        question,
        (step) => setPending({ question, step }),
        controller.signal,
      );
      queryClient.setQueryData<ChatThread>(key, (old) => ({
        ai_enabled: true,
        messages: [...(old?.messages ?? []), ...added],
      }));
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : "Something went wrong");
      setDraft(question); // keep the question so it can be sent again
    } finally {
      if (!controller.signal.aborted) {
        setPending(null);
        onBusy(false);
      }
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void send(draft);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send(draft);
    }
  };

  const messages = thread.data?.messages ?? [];
  const empty = !messages.length && !pending;
  const name = shortName(diagnosis.workload);

  return (
    <div hidden={!active} className="flex min-h-0 flex-1 flex-col">
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-4">
        {!thread.data ? null : !thread.data.ai_enabled ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-sm">
            <p className="text-muted">Follow-up questions need an AI model</p>
            {me.data?.role === "admin" ? (
              <Link href="/settings#ai" className="font-medium text-accent hover:underline">
                Add a Model
              </Link>
            ) : (
              <span className="text-subtle">Ask an admin to add one</span>
            )}
          </div>
        ) : empty ? (
          <div className="flex h-full flex-col justify-end gap-4 pb-4">
            <div className="flex flex-col gap-1">
              <p className="font-semibold text-fg">Ask about {name}</p>
              <p className="text-sm text-muted">
                Answers start from the diagnosis and check the cluster as it is now
              </p>
            </div>
            <div className="flex flex-col items-start gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => void send(suggestion)}
                  className="rounded-full border border-border px-3 py-1 text-left text-sm text-muted transition-colors hover:border-control hover:text-fg"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ol className="flex flex-col">
            {pairs(messages).map(([question, reply]) => (
              <Exchange
                key={question.id}
                question={question.content}
                author={question.author}
                when={timeAgo(question.created_at)}
              >
                {reply && <AnswerText text={reply.content} />}
              </Exchange>
            ))}
            {pending && (
              <Exchange question={pending.question} author={me.data?.username ?? null} when="now">
                <span className="flex items-center gap-2.5 text-sm text-muted" aria-live="polite">
                  <Spinner />
                  {pending.step ?? "Looking into it"}
                </span>
              </Exchange>
            )}
          </ol>
        )}
      </div>

      {thread.data?.ai_enabled && (
        <form onSubmit={submit} className="flex flex-col gap-1.5 border-t border-border p-3">
          {error && <p className="px-1 text-sm text-danger">{error}</p>}
          <div className="flex items-end gap-2 rounded-lg border border-control bg-bg p-1.5 pl-3 transition-colors focus-within:border-accent">
            <textarea
              ref={input}
              rows={1}
              value={draft}
              maxLength={2000}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={`Ask about ${name}`}
              aria-label={`Question about ${name}`}
              className="min-h-8 flex-1 resize-none bg-transparent py-1.5 text-sm leading-5 text-fg outline-none placeholder:text-subtle"
            />
            <button
              type="submit"
              disabled={!draft.trim() || pending !== null}
              className="inline-flex h-8 shrink-0 items-center rounded-md border border-control bg-bg px-3 text-sm font-medium text-fg transition-colors hover:border-subtle hover:bg-surface active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
            >
              Ask
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function Exchange({
  question,
  author,
  when,
  children,
}: {
  question: string;
  author: string | null;
  when: string;
  children: ReactNode;
}) {
  return (
    <li className="flex flex-col gap-2.5 border-b border-border py-4 last:border-b-0">
      <div className="flex flex-col gap-0.5">
        <p className="whitespace-pre-wrap break-words text-sm font-semibold text-fg">{question}</p>
        <span className="text-xs text-subtle">
          {author ?? "Someone"} · {when}
        </span>
      </div>
      <div className="text-sm text-fg/90">{children}</div>
    </li>
  );
}

/** Groups the thread into question + answer pairs, oldest first. */
function pairs(messages: ChatMessage[]): [ChatMessage, ChatMessage | undefined][] {
  const result: [ChatMessage, ChatMessage | undefined][] = [];
  for (const message of messages) {
    if (message.role === "user") result.push([message, undefined]);
    else if (result.length && !result[result.length - 1][1]) result[result.length - 1][1] = message;
  }
  return result;
}
