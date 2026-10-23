"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent, type ReactNode } from "react";

import { RESTARTABLE, SCALABLE } from "@/components/manager/kinds";
import { input, primaryButton, secondaryButton } from "@/components/settings/fields";
import { useCanEdit } from "@/hooks/use-can-edit";
import { api, type ClusterAction, type KindInfo, type KubeObject, type ObjectRef } from "@/lib/api";

const button =
  "rounded-md border border-border px-3 py-1.5 text-sm text-fg transition-colors hover:bg-surface-2";

type Dialog = "scale" | "restart" | "delete" | "cordon" | null;

export function ObjectActions({
  cluster,
  kind,
  objectRef,
  object,
  onDeleted,
}: {
  cluster: string;
  kind: KindInfo;
  objectRef: ObjectRef;
  object?: KubeObject["object"];
  onDeleted: () => void;
}) {
  const canEdit = useCanEdit(cluster, objectRef.namespace);
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [message, setMessage] = useState<string | null>(null);
  const key = `${kind.group}/${kind.resource}`;
  const spec = (object?.spec ?? {}) as { replicas?: number; unschedulable?: boolean };

  const run = useMutation({
    mutationFn: (body: Pick<ClusterAction, "action" | "replicas">) =>
      api.runAction({ ...objectRef, cluster_id: cluster, ...body }),
    onSuccess: (result, body) => {
      setMessage(result.message);
      setDialog(null);
      queryClient.invalidateQueries({ queryKey: ["manager"] });
      if (body.action === "delete") onDeleted();
    },
  });

  if (!canEdit) return null;
  const isNode = key === "/nodes";
  const canDelete = kind.verbs.includes("delete") && !isNode;

  return (
    <>
      <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
      {SCALABLE.has(key) && (
        <button type="button" className={button} onClick={() => setDialog("scale")}>
          Scale
        </button>
      )}
      {RESTARTABLE.has(key) && (
        <button type="button" className={button} onClick={() => setDialog("restart")}>
          Restart
        </button>
      )}
      {isNode && (
        <button type="button" className={button} onClick={() => setDialog("cordon")}>
          {spec.unschedulable ? "Uncordon" : "Cordon"}
        </button>
      )}
      {canDelete && (
        <button
          type="button"
          className={`${button} text-danger hover:border-danger/60`}
          onClick={() => setDialog("delete")}
        >
          Delete
        </button>
      )}
      {message && <span className="w-full text-sm text-accent">{message}</span>}

      {dialog === "scale" && (
        <ScaleDialog
          name={objectRef.name}
          current={spec.replicas ?? 1}
          pending={run.isPending}
          error={run.error?.message}
          onCancel={() => setDialog(null)}
          onConfirm={(replicas) => run.mutate({ action: "scale", replicas })}
        />
      )}
      {dialog === "restart" && (
        <Confirm
          title={`Restart ${objectRef.name}?`}
          body="Kubernetes replaces its pods one by one, the same as kubectl rollout restart. This is recorded in the activity log."
          action="Restart"
          pending={run.isPending}
          error={run.error?.message}
          onCancel={() => setDialog(null)}
          onConfirm={() => run.mutate({ action: "restart" })}
        />
      )}
      {dialog === "cordon" && (
        <Confirm
          title={`${spec.unschedulable ? "Uncordon" : "Cordon"} ${objectRef.name}?`}
          body={
            spec.unschedulable
              ? "New pods can be scheduled on this node again."
              : "No new pods will be scheduled on this node. Running pods keep running."
          }
          action={spec.unschedulable ? "Uncordon" : "Cordon"}
          pending={run.isPending}
          error={run.error?.message}
          onCancel={() => setDialog(null)}
          onConfirm={() => run.mutate({ action: spec.unschedulable ? "uncordon" : "cordon" })}
        />
      )}
      {dialog === "delete" && (
        <DeleteDialog
          kind={kind.kind}
          name={objectRef.name}
          pending={run.isPending}
          error={run.error?.message}
          onCancel={() => setDialog(null)}
          onConfirm={() => run.mutate({ action: "delete" })}
        />
      )}
    </>
  );
}

function Modal({ children, onCancel }: { children: ReactNode; onCancel: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 pt-[15vh]"
      onMouseDown={(e) => e.target === e.currentTarget && onCancel()}
      onKeyDown={(e) => e.key === "Escape" && onCancel()}
      role="dialog"
      aria-modal="true"
    >
      <div className="flex w-full max-w-md flex-col gap-4 rounded-lg border border-border bg-bg p-6 shadow-2xl shadow-black/40">
        {children}
      </div>
    </div>
  );
}

function Footer({
  action,
  danger = false,
  pending,
  disabled = false,
  error,
  onCancel,
}: {
  action: string;
  danger?: boolean;
  pending: boolean;
  disabled?: boolean;
  error?: string;
  onCancel: () => void;
}) {
  return (
    <>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className={secondaryButton} onClick={onCancel}>
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending || disabled}
          className={
            danger
              ? "rounded-md bg-danger px-4 py-2 text-sm font-medium text-bg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              : primaryButton
          }
        >
          {pending ? "Working" : action}
        </button>
      </div>
    </>
  );
}

function Confirm({
  title,
  body,
  action,
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: string;
  action: string;
  pending: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onConfirm();
  };
  return (
    <Modal onCancel={onCancel}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <h2 className="font-semibold">{title}</h2>
        <p className="text-sm text-muted">{body}</p>
        <Footer action={action} pending={pending} error={error} onCancel={onCancel} />
      </form>
    </Modal>
  );
}

function ScaleDialog({
  name,
  current,
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  name: string;
  current: number;
  pending: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: (replicas: number) => void;
}) {
  const [replicas, setReplicas] = useState(String(current));
  const value = Number(replicas);
  const valid = Number.isInteger(value) && value >= 0 && value <= 1000;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (valid) onConfirm(value);
  };
  return (
    <Modal onCancel={onCancel}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <h2 className="font-semibold">Scale {name}</h2>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted">Replicas (now {current})</span>
          <input
            className={input}
            type="number"
            min={0}
            max={1000}
            value={replicas}
            onChange={(e) => setReplicas(e.target.value)}
            autoFocus
          />
        </label>
        <Footer
          action="Scale"
          pending={pending}
          disabled={!valid || value === current}
          error={error}
          onCancel={onCancel}
        />
      </form>
    </Modal>
  );
}

function DeleteDialog({
  kind,
  name,
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  kind: string;
  name: string;
  pending: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [typed, setTyped] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (typed === name) onConfirm();
  };
  return (
    <Modal onCancel={onCancel}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <h2 className="font-semibold">
          Delete {kind} {name}?
        </h2>
        <p className="text-sm text-muted">
          This cannot be undone. If a controller owns it, Kubernetes may create it again.
        </p>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted">
            Type <span className="font-mono text-fg">{name}</span> to confirm
          </span>
          <input
            className={input}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoFocus
            spellCheck={false}
            autoCapitalize="none"
          />
        </label>
        <Footer
          action="Delete"
          danger
          pending={pending}
          disabled={typed !== name}
          error={error}
          onCancel={onCancel}
        />
      </form>
    </Modal>
  );
}
