"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { AnswerText } from "@/components/doctor/answer-text";
import { CloseIcon, PlusIcon, SparkleIcon } from "@/components/icons";
import { useScopedClusters } from "@/components/shell/status-bar";
import { useMe } from "@/hooks/use-me";
import { api, postStream, type AssistantMessage } from "@/lib/api";

export const ASSIST_EVENT = "kubeiq:assist";

/** Open the assistant, optionally with a question to ask right away (Explain buttons use this). */
export function openAssistant(question?: string) {
  window.dispatchEvent(new CustomEvent<{ question?: string }>(ASSIST_EVENT, { detail: { question } }));
}

/**
 * The cluster assistant: a panel on the right for the cluster in scope. It answers with the
 * read-only tools it picks (each check shows while it runs), and keeps conversations per user.
 */
export function AssistantPanel() {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  useEffect(() => {
    const show = (event: Event) => {
      setOpen(true);
      const question = (event as CustomEvent<{ question?: string }>).detail?.question;
      if (question) setPending(question);
    };
    window.addEventListener(ASSIST_EVENT, show);
    return () => window.removeEventListener(ASSIST_EVENT, show);
  }, []);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label="Assistant"
        title="Ask the assistant about this cluster"
        className={`flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm transition-colors ${
          open ? "bg-frame-hover text-fg" : "text-muted hover:bg-frame-hover hover:text-fg"
        }`}
      >
        <SparkleIcon width={15} height={15} className="text-accent" />
        <span className="hidden md:inline">Assistant</span>
      </button>
      {open && <Panel onClose={() => setOpen(false)} pending={pending} onPendingUsed={() => setPending(null)} />}
    </>
  );
}

function Panel({ onClose, pending, onPendingUsed }: { onClose: () => void; pending: string | null; onPendingUsed: () => void }) {
  const { current } = useScopedClusters();
  const status = useQuery({ queryKey: ["ai-status"], queryFn: api.aiStatus, staleTime: 60_000 });
  const admin = useMe().data?.role === "admin";
  const queryClient = useQueryClient();
  const cluster = current?.id ?? null;
  const list = useQuery({
    queryKey: ["conversations", cluster],
    queryFn: () => api.conversations(cluster!),
    enabled: Boolean(cluster),
  });
  const [active, setActive] = useState<string | null>(null);
  const [showList, setShowList] = useState(false);
  // Changes only when the user opens another thread. Creating the conversation for a first
  // question must not remount the thread, or the question in flight and its answer are lost.
  const [view, setView] = useState(0);
  const conversationId = active;
  const open = (id: string | null) => {
    setActive(id);
    setView((v) => v + 1);
    setShowList(false);
  };

  const create = useMutation({
    mutationFn: () => api.createConversation(cluster!),
    onSuccess: (c) => {
      queryClient.invalidateQueries({ queryKey: ["conversations", cluster] });
      setActive(c.id);
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteConversation(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["conversations", cluster] });
      if (id === active) open(null);
    },
  });

  return (
    <aside
      role="dialog"
      aria-label="Assistant"
      className="fixed inset-0 z-50 flex flex-col bg-bg sm:inset-y-2 sm:left-auto sm:right-2 sm:w-[460px] sm:rounded-xl sm:border sm:border-border sm:shadow-2xl sm:shadow-black/20"
    >
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <SparkleIcon className="text-accent" />
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 className="text-sm font-semibold">Assistant</h2>
          {current && <span className="truncate font-mono text-xs text-subtle">{current.name}</span>}
        </div>
        <button type="button" onClick={() => setShowList(!showList)} className="rounded-md px-2 py-1 text-sm text-muted hover:bg-surface hover:text-fg">
          {showList ? "Back" : "History"}
        </button>
        <button
          type="button"
          onClick={() => open(null)}
          aria-label="New conversation"
          title="New conversation"
          className="rounded-md p-1.5 text-muted hover:bg-surface hover:text-fg"
        >
          <PlusIcon width={15} height={15} />
        </button>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1.5 text-subtle hover:bg-surface hover:text-fg">
          <CloseIcon />
        </button>
      </header>

      {status.data && !status.data.enabled ? (
        <div className="m-4 flex flex-col gap-2 rounded-lg bg-surface p-4 text-sm">
          <p className="font-medium">AI is off</p>
          <p className="text-muted">The assistant needs an AI model. Known problems still get root causes in Cluster Doctor</p>
          {admin && (
            <Link href="/settings#ai" onClick={onClose} className="self-start font-medium text-accent hover:underline">
              Add a Model
            </Link>
          )}
        </div>
      ) : !cluster ? (
        <p className="p-4 text-sm text-muted">Connect a cluster first</p>
      ) : showList ? (
        <ul className="flex min-h-0 flex-1 flex-col overflow-y-auto p-2">
          {list.data?.length === 0 && <li className="p-3 text-sm text-muted">No conversations yet</li>}
          {list.data?.map((c) => (
            <ConversationRow
              key={c.id}
              id={c.id}
              title={c.title}
              active={c.id === active}
              onOpen={() => open(c.id)}
              onDelete={() => remove.mutate(c.id)}
            />
          ))}
        </ul>
      ) : (
        <Thread
          key={view}
          cluster={cluster}
          conversationId={conversationId}
          ensure={async () => conversationId ?? (await create.mutateAsync()).id}
          pending={pending}
          onPendingUsed={onPendingUsed}
        />
      )}
    </aside>
  );
}

function ConversationRow({ id, title, active, onOpen, onDelete }: { id: string; title: string; active: boolean; onOpen: () => void; onDelete: () => void }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const rename = useMutation({
    mutationFn: () => api.renameConversation(id, value.trim() || title),
    onSuccess: () => {
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
  return (
    <li className={`group flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${active ? "bg-surface-2" : "hover:bg-surface"}`}>
      {editing ? (
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") rename.mutate();
            if (e.key === "Escape") setEditing(false);
          }}
          onBlur={() => rename.mutate()}
          aria-label="Conversation name"
          className="h-7 min-w-0 flex-1 rounded-md border border-control bg-bg px-2 outline-none focus:border-accent"
        />
      ) : (
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 truncate text-left">
          {title}
        </button>
      )}
      <button type="button" onClick={() => setEditing(true)} className="text-xs text-subtle opacity-0 hover:text-fg group-hover:opacity-100">
        Rename
      </button>
      <button type="button" onClick={onDelete} className="text-xs text-subtle opacity-0 hover:text-danger group-hover:opacity-100">
        Delete
      </button>
    </li>
  );
}

function Thread({
  cluster,
  conversationId,
  ensure,
  pending,
  onPendingUsed,
}: {
  cluster: string;
  conversationId: string | null;
  ensure: () => Promise<string>;
  pending: string | null;
  onPendingUsed: () => void;
}) {
  const queryClient = useQueryClient();
  const thread = useQuery({
    queryKey: ["conversation", conversationId],
    queryFn: () => api.conversation(conversationId!),
    enabled: Boolean(conversationId),
  });
  const suggestions = useQuery({
    queryKey: ["assistant-suggestions", cluster],
    queryFn: () => api.suggestions(cluster),
    enabled: !conversationId,
    staleTime: 60_000,
  });
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [text, setText] = useState("");
  const [step, setStep] = useState<string | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const saved = thread.data?.messages ?? [];
  const shown = [...saved, ...messages.filter((m) => !saved.some((s) => s.id === m.id))];

  const ask = async (question: string) => {
    if (!question.trim() || asking) return;
    setError(null);
    setAsking(question);
    setText("");
    try {
      const id = await ensure();
      const stored = await postStream<AssistantMessage[]>(`/api/v1/ai/conversations/${id}/ask`, { message: question }, setStep);
      setMessages((m) => [...m, ...stored]);
      queryClient.invalidateQueries({ queryKey: ["conversations", cluster] });
    } catch (e) {
      setError((e as Error).message);
      setText(question);
    } finally {
      setAsking(null);
      setStep(null);
    }
  };

  useEffect(() => {
    if (!pending) return;
    // Ask the question handed over by an Explain button once (after this render).
    const timer = setTimeout(() => {
      onPendingUsed();
      void ask(pending);
    });
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);
  useEffect(() => bottom.current?.scrollIntoView({ block: "end" }), [shown.length, step]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void ask(text);
  };

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-4">
        {shown.length === 0 && !asking && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted">Ask about this cluster. The assistant looks at it live, read-only</p>
            <div className="flex flex-col gap-1.5">
              {(suggestions.data ?? []).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void ask(s)}
                  className="rounded-lg border border-border px-3 py-2 text-left text-sm text-fg transition-colors hover:border-subtle hover:bg-surface"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {shown.map((m) =>
          m.role === "user" ? (
            <p key={m.id} className="self-end rounded-lg bg-surface-2 px-3 py-2 text-sm">
              {m.content}
            </p>
          ) : (
            <div key={m.id} className="flex flex-col gap-2 text-sm">
              {m.steps.length > 0 && <p className="text-xs text-subtle">Looked at: {m.steps.join(" · ")}</p>}
              <AnswerText text={m.content} />
            </div>
          ),
        )}
        {asking && (
          <>
            <p className="self-end rounded-lg bg-surface-2 px-3 py-2 text-sm">{asking}</p>
            <p className="flex items-center gap-2 text-sm text-muted">
              <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
              {step ?? "Thinking"}
            </p>
          </>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
        <div ref={bottom} />
      </div>
      <form onSubmit={submit} className="flex items-end gap-2 border-t border-border p-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void ask(text);
            }
          }}
          rows={2}
          maxLength={2000}
          placeholder="Why is checkout slow? Which pods restarted today?"
          aria-label="Question"
          className="min-h-11 flex-1 resize-none rounded-lg border border-control bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={!text.trim() || Boolean(asking)}
          className="h-11 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-strong disabled:opacity-50"
        >
          Ask
        </button>
      </form>
    </>
  );
}
