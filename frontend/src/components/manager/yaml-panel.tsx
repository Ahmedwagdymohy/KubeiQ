"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { input, primaryButton, secondaryButton } from "@/components/settings/fields";
import { useCanEdit } from "@/hooks/use-can-edit";
import { api, type ApplyResult, type KindInfo, type KubeObject } from "@/lib/api";

/** Colours keys, strings, numbers and comments; the text itself is never changed. */
export function YamlCode({ text, className = "" }: { text: string; className?: string }) {
  return (
    <pre className={`overflow-auto rounded-lg bg-terminal p-4 font-mono text-xs leading-5 text-terminal-fg ${className}`}>
      {text.split("\n").map((line, i) => {
        const comment = line.match(/^(\s*)(#.*)$/);
        if (comment) return <div key={i} className="text-terminal-fg/45">{line || " "}</div>;
        const m = line.match(/^(\s*-?\s*)([^\s:#][^:#]*?)(:)(\s.*|)$/);
        if (!m) return <div key={i}>{valueSpan(line) || " "}</div>;
        return (
          <div key={i}>
            {m[1]}
            <span className="text-terminal-key">{m[2]}</span>
            {m[3]}
            {valueSpan(m[4])}
          </div>
        );
      })}
    </pre>
  );
}

function valueSpan(value: string) {
  const v = value.trim();
  if (!v) return value;
  if (/^['"].*['"]$/.test(v)) return <span className="text-terminal-string">{value}</span>;
  if (/^-?\d+(\.\d+)?$/.test(v) || v === "true" || v === "false" || v === "null")
    return <span className="text-terminal-number">{value}</span>;
  return value;
}

type DiffLine = { kind: "same" | "add" | "del"; text: string };

/** A line diff (longest common subsequence), with unchanged runs folded. */
export function diffLines(a: string, b: string): DiffLine[] {
  const x = a.split("\n");
  const y = b.split("\n");
  const n = x.length;
  const m = y.length;
  if (n * m > 9_000_000) return [...x.map((t) => ({ kind: "del" as const, text: t })), ...y.map((t) => ({ kind: "add" as const, text: t }))];
  const table = new Uint32Array((n + 1) * (m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      table[i * (m + 1) + j] = x[i] === y[j] ? table[(i + 1) * (m + 1) + j + 1] + 1 : Math.max(table[(i + 1) * (m + 1) + j], table[i * (m + 1) + j + 1]);
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) {
      out.push({ kind: "same", text: x[i] });
      i++;
      j++;
    } else if (table[(i + 1) * (m + 1) + j] >= table[i * (m + 1) + j + 1]) out.push({ kind: "del", text: x[i++] });
    else out.push({ kind: "add", text: y[j++] });
  }
  while (i < n) out.push({ kind: "del", text: x[i++] });
  while (j < m) out.push({ kind: "add", text: y[j++] });
  return out;
}

function Diff({ before, after }: { before: string; after: string }) {
  const lines = diffLines(before, after);
  const changed = lines.some((l) => l.kind !== "same");
  if (!changed) return <p className="text-sm text-muted">Nothing changes</p>;
  // Keep 3 lines of context around changes.
  const near = (i: number) => lines.slice(Math.max(0, i - 3), i + 4).some((l) => l.kind !== "same");
  const hidden = lines.map((l, i) => l.kind === "same" && !near(i));
  return (
    <pre className="max-h-[50vh] overflow-auto rounded-lg bg-terminal py-3 font-mono text-xs leading-5 text-terminal-fg">
      {lines.map((l, i) => {
        if (hidden[i]) {
          // One fold mark per run of unchanged lines.
          return i > 0 && hidden[i - 1] ? null : <div key={i} className="px-4 text-terminal-fg/40">⋯</div>;
        }
        return (
          <div key={i} className={`px-4 ${l.kind === "add" ? "bg-healthy/20" : l.kind === "del" ? "bg-danger/25" : ""}`}>
            <span className="mr-2 select-none text-terminal-fg/50">{l.kind === "add" ? "+" : l.kind === "del" ? "-" : " "}</span>
            {l.text}
          </div>
        );
      })}
    </pre>
  );
}

function flatten(value: unknown, prefix = "", out: Record<string, string> = {}): Record<string, string> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  } else out[prefix] = JSON.stringify(value);
  return out;
}

/** Fields of spec that something in the cluster set back after the save (an autoscaler, ...). */
export function reverted(saved: Record<string, unknown>, live: Record<string, unknown>): string[] {
  const a = flatten(saved.spec, "spec");
  const b = flatten(live.spec, "spec");
  return Object.keys(a)
    .filter((k) => k in b && a[k] !== b[k])
    .map((k) => `${k} was changed back to ${b[k]}`);
}

/**
 * The YAML tab: highlighted, copy and download; Edit (when changes are allowed) opens an editor,
 * Review shows the server's dry-run result as a diff, Apply saves, and a few seconds later KubeiQ
 * checks whether something in the cluster changed fields back.
 */
export function YamlPanel({ cluster, kind, detail, objectRef }: { cluster: string; kind: KindInfo; detail: KubeObject; objectRef: { namespace: string | null; name: string } }) {
  const canEdit = useCanEdit(cluster, objectRef.namespace);
  const queryClient = useQueryClient();
  const clusters = useQuery({ queryKey: ["clusters"], queryFn: api.clusters });
  const info = clusters.data?.find((c) => c.id === cluster);
  const production = info?.labels?.some((l) => l.name === "production") ? info.name : null;
  const [draft, setDraft] = useState<string | null>(null);
  const [review, setReview] = useState<ApplyResult | null>(null);
  const [typed, setTyped] = useState("");
  const [done, setDone] = useState<{ message: string; warnings: string[] } | null>(null);
  const editable = canEdit && !detail.values_hidden && kind.verbs.includes("update");

  const send = (dry_run: boolean) =>
    api.applyYaml({ cluster_id: cluster, yaml: draft ?? "", namespace: objectRef.namespace, existing: objectRef.name, dry_run, confirm: production ? typed : undefined });
  const check = useMutation({ mutationFn: () => send(true), onSuccess: setReview });
  const apply = useMutation({
    mutationFn: () => send(false),
    onSuccess: async (result) => {
      setDraft(null);
      setReview(null);
      setDone({ message: "Saved. Checking that it stays as saved", warnings: [] });
      queryClient.invalidateQueries({ queryKey: ["manager"] });
      await new Promise((r) => setTimeout(r, 4000));
      try {
        const live = await api.object(cluster, { group: kind.group, version: kind.version, resource: kind.resource, ...objectRef });
        const warnings = reverted(result.object, live.object);
        setDone({ message: warnings.length ? "Saved, but the cluster changed some fields back" : "Saved", warnings });
      } catch {
        setDone({ message: "Saved", warnings: [] });
      }
    },
  });
  const download = () => {
    const url = URL.createObjectURL(new Blob([detail.yaml], { type: "text/yaml" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${objectRef.name}.yaml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (draft !== null)
    return (
      <div className="flex flex-col gap-3 p-6">
        {review ? (
          <>
            <p className="text-sm font-medium">Review the change</p>
            <p className="text-[13px] text-subtle">What the API server would store (a dry run: nothing changed yet)</p>
            <Diff before={detail.yaml} after={review.yaml} />
          </>
        ) : (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
            aria-label="YAML"
            className="h-[60vh] w-full resize-y rounded-lg bg-terminal p-4 font-mono text-xs leading-5 text-terminal-fg outline-none ring-accent focus:ring-1"
          />
        )}
        {production && (
          <label className="flex flex-col gap-1.5 rounded-lg bg-danger-soft p-3 text-sm">
            <span>
              This is a production cluster. Type <span className="font-mono">{production}</span> to continue
            </span>
            <input className={input} value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Cluster name" />
          </label>
        )}
        {(check.error || apply.error) && <p className="text-sm text-danger">{((check.error ?? apply.error) as Error).message}</p>}
        <div className="flex flex-wrap gap-2">
          {review ? (
            <>
              <button type="button" className={primaryButton} disabled={apply.isPending || (production !== null && typed !== production)} onClick={() => apply.mutate()}>
                {apply.isPending ? "Saving" : "Apply"}
              </button>
              <button type="button" className={secondaryButton} onClick={() => setReview(null)}>
                Back to editing
              </button>
            </>
          ) : (
            <button type="button" className={primaryButton} disabled={check.isPending} onClick={() => check.mutate()}>
              {check.isPending ? "Checking" : "Review changes"}
            </button>
          )}
          <button
            type="button"
            className={secondaryButton}
            onClick={() => {
              setDraft(null);
              setReview(null);
            }}
          >
            Cancel
          </button>
        </div>
        <p className="text-[13px] text-subtle">Recorded in the activity log. Read-only fields such as status are ignored by the server</p>
      </div>
    );

  return (
    <div className="flex flex-col gap-3 p-6">
      {detail.values_hidden && <p className="text-sm text-muted">Secret values are never read. Only names and metadata are shown.</p>}
      {done && (
        <div className="rounded-lg bg-surface px-3 py-2 text-sm">
          <p className={done.warnings.length ? "text-warning" : "text-accent"}>{done.message}</p>
          {done.warnings.map((w) => (
            <p key={w} className="font-mono text-xs text-muted">
              {w}
            </p>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {editable && (
          <button type="button" className={secondaryButton} onClick={() => setDraft(detail.yaml)}>
            Edit
          </button>
        )}
        <button type="button" className={secondaryButton} onClick={() => navigator.clipboard?.writeText(detail.yaml).catch(() => undefined)}>
          Copy
        </button>
        <button type="button" className={secondaryButton} onClick={download}>
          Download
        </button>
      </div>
      <YamlCode text={detail.yaml.trimEnd()} />
    </div>
  );
}

/** Create objects from YAML: validated with a dry run first, then created. */
export function CreateFromYaml({ cluster, namespace, onDone }: { cluster: string; namespace: string | null; onDone: (message: string) => void }) {
  const [text, setText] = useState(
    `apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: example\n  namespace: ${namespace || "default"}\ndata:\n  key: value\n`,
  );
  const [checked, setChecked] = useState<ApplyResult | null>(null);
  const run = (dry_run: boolean) => api.applyYaml({ cluster_id: cluster, yaml: text, namespace, dry_run });
  const check = useMutation({ mutationFn: () => run(true), onSuccess: setChecked });
  const create = useMutation({
    mutationFn: () => run(false),
    onSuccess: (r) => onDone(`Created ${r.name}${r.namespace ? ` in ${r.namespace}` : ""}`),
  });
  return (
    <div className="flex flex-col gap-3 p-5">
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setChecked(null);
        }}
        spellCheck={false}
        aria-label="YAML"
        className="h-80 w-full resize-y rounded-lg bg-terminal p-4 font-mono text-xs leading-5 text-terminal-fg outline-none ring-accent focus:ring-1"
      />
      {checked && <p className="text-sm text-accent">Valid. The API server accepts {checked.name}</p>}
      {(check.error || create.error) && <p className="text-sm text-danger">{((check.error ?? create.error) as Error).message}</p>}
      <div className="flex gap-2">
        <button type="button" className={secondaryButton} disabled={check.isPending} onClick={() => check.mutate()}>
          {check.isPending ? "Checking" : "Validate"}
        </button>
        <button type="button" className={primaryButton} disabled={!checked || create.isPending} onClick={() => create.mutate()}>
          {create.isPending ? "Creating" : "Create"}
        </button>
      </div>
      <p className="text-[13px] text-subtle">One object at a time. Recorded in the activity log</p>
    </div>
  );
}
