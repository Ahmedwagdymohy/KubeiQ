"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";

import { AnswerText } from "@/components/doctor/answer-text";
import { timeAgo } from "@/components/doctor/history-list";
import { Spinner } from "@/components/ui";
import { useMe } from "@/hooks/use-me";
import { api, askIncident, type ChatMessage, type ChatThread } from "@/lib/api";

const SUGGESTIONS = [
  "Why is this happening now?",
  "What else could this affect?",
  "How do I confirm the fix worked?",
];

type Pending = { question: string; step: string | null };

/** Follow-up questions on one incident, answered with its diagnosis and live cluster checks. */
export function IncidentChat({
  investigationId,
  incidentId,
}: {
  investigationId: string;
  incidentId: string;
}) {
  const key = ["chat", investigationId, incidentId];
  const queryClient = useQueryClient();
  const thread = useQuery({ queryKey: key, queryFn: () => api.chat(investigationId, incidentId) });
  const me = useMe();
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => () => abort.current?.abort(), []);

  // Grow with the text, up to about six lines.
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [draft]);

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || pending) return;
    setError(null);
    setDraft("");
    setPending({ question, step: null });
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
      if (!controller.signal.aborted) setPending(null);
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

  if (!thread.data) return null;

  if (!thread.data.ai_enabled) {
    return (
      <Section>
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-lg bg-surface px-4 py-3 text-sm">
          <p className="text-muted">Follow-up questions need an AI model</p>
          {me.data?.role === "admin" ? (
            <Link href="/settings#ai" className="font-medium text-accent hover:underline">
              Add a Model
            </Link>
          ) : (
            <span className="text-subtle">Ask an admin to add one</span>
          )}
        </div>
      </Section>
    );
  }

  const messages = thread.data.messages;
  return (
    <Section>
      {(messages.length > 0 || pending) && (
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

      <form onSubmit={submit} className="flex flex-col gap-2">
        <div className="flex items-end gap-2 rounded-lg border border-control bg-bg p-1.5 pl-3 transition-colors focus-within:border-accent">
          <textarea
            ref={input}
            rows={1}
            value={draft}
            maxLength={2000}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={messages.length ? "Ask another question" : "Ask a question about this issue"}
            aria-label="Question about this issue"
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
        {error && <p className="text-sm text-danger">{error}</p>}
        {!messages.length && !pending && (
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => void send(suggestion)}
                className="rounded-full border border-border px-3 py-1 text-sm text-muted transition-colors hover:border-control hover:text-fg"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
      </form>
    </Section>
  );
}

function Section({ children }: { children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-border pt-6">
      <h4 className="text-sm font-semibold text-fg">Ask About This Issue</h4>
      {children}
    </section>
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
    <li className="flex flex-col gap-2.5 border-b border-border py-4 first:pt-1 last:border-b-0">
      <div className="flex items-start gap-3">
        <span
          className="mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-control bg-bg text-[11px] font-semibold uppercase text-fg"
          title={author ?? undefined}
        >
          {(author ?? "?").slice(0, 1)}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="whitespace-pre-wrap break-words font-medium text-fg">{question}</p>
          <span className="text-xs text-subtle">
            {author ?? "Someone"} · {when}
          </span>
        </div>
      </div>
      <div className="pl-9 text-fg/90">{children}</div>
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
