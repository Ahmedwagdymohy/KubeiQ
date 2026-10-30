"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Logo } from "@/components/logo";
import { AddCluster } from "@/components/settings/add-cluster";
import { Field, input, primaryButton } from "@/components/settings/fields";
import { Dot } from "@/components/ui";
import { api, type Cluster, type Project } from "@/lib/api";

/**
 * First sign-in of an admin: create the project, then add the clusters KubeiQ should work with
 * (ADR 0012). Reloading resumes at the right step.
 */
export function Welcome() {
  const projects = useQuery({ queryKey: ["projects"], queryFn: api.projects });
  const project = projects.data?.[0];
  const step = project ? 2 : 1;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-bg">
      <header className="flex items-center justify-between px-6 py-5">
        <Logo />
        <ol className="flex items-center gap-3 text-sm" aria-label="Setup steps">
          <StepDot n={1} label="Project" state={step === 1 ? "current" : "done"} />
          <span className="h-px w-8 bg-border" />
          <StepDot n={2} label="Clusters" state={step === 2 ? "current" : "todo"} />
        </ol>
      </header>
      <main className="mx-auto flex w-full max-w-[720px] flex-col gap-8 px-4 pb-16 pt-6 sm:px-6">
        {projects.isPending ? null : project ? <AddClusters project={project} /> : <CreateProject />}
      </main>
    </div>
  );
}

function StepDot({ n, label, state }: { n: number; label: string; state: "done" | "current" | "todo" }) {
  return (
    <li className="flex items-center gap-2" aria-current={state === "current" ? "step" : undefined}>
      <span
        className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
          state === "todo" ? "bg-surface-2 text-muted" : "bg-accent text-accent-ink"
        }`}
      >
        {state === "done" ? "✓" : n}
      </span>
      <span className={state === "todo" ? "text-muted" : "text-fg"}>{label}</span>
    </li>
  );
}

function Heading({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-[15px] text-muted">{text}</p>
    </div>
  );
}

function CreateProject() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const create = useMutation({
    mutationFn: () =>
      api.createProject({ name: name.trim(), description: description.trim() || null, scopes: [], members: [] }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["plan"] });
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim()) create.mutate();
  };

  return (
    <>
      <Heading
        title="Welcome to KubeiQ"
        text="Start with a project. It holds the clusters KubeiQ works with, and later the people who can use them."
      />
      <form onSubmit={submit} className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-5 sm:p-6">
        <Field label="Project Name" hint="For example the team or the environment: Platform, Payments, Production">
          <input
            className={input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Platform"
            maxLength={80}
            autoFocus
          />
        </Field>
        <Field label="Description" hint="Optional">
          <input
            className={input}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Clusters the platform team runs"
            maxLength={200}
          />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className={primaryButton} disabled={create.isPending || !name.trim()}>
            {create.isPending ? "Creating" : "Create Project"}
          </button>
          {create.error && <span className="text-sm text-danger">{(create.error as Error).message}</span>}
        </div>
      </form>
    </>
  );
}

function AddClusters({ project }: { project: Project }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const all = useQuery({ queryKey: ["clusters", "all"], queryFn: api.allClusters });
  const plan = useQuery({ queryKey: ["plan"], queryFn: api.plan });
  const gke = useQuery({ queryKey: ["settings", "gke"], queryFn: api.gke });
  const inProject = new Set(project.scopes.map((s) => s.cluster_id));
  const max = plan.data?.clusters.max ?? 3;
  const used = plan.data?.clusters.used ?? inProject.size;

  const save = useMutation({
    mutationFn: (ids: string[]) =>
      api.updateProject(project.id, {
        name: project.name,
        description: project.description,
        members: project.members,
        // Keep namespace limits already set for clusters that stay.
        scopes: ids.map((id) => project.scopes.find((s) => s.cluster_id === id) ?? { cluster_id: id, namespaces: [] }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["plan"] });
      queryClient.invalidateQueries({ queryKey: ["clusters"] });
    },
  });
  const toggle = (id: string) =>
    save.mutate(inProject.has(id) ? [...inProject].filter((x) => x !== id) : [...inProject, id]);

  // A pasted kubeconfig goes straight into the project, as far as the plan allows. (The connect
  // command already adds its cluster on the server, so read the project again first.)
  const addKubeconfig = async (name?: string) => {
    const [fresh, projects] = await Promise.all([
      queryClient.fetchQuery({ queryKey: ["clusters", "all"], queryFn: api.allClusters }),
      queryClient.fetchQuery({ queryKey: ["projects"], queryFn: api.projects }),
    ]);
    const current = new Set(
      (projects.find((p) => p.id === project.id) ?? project).scopes.map((s) => s.cluster_id),
    );
    const added = fresh.map((c) => c.id).filter((id) => id.startsWith(`upload:${name}/`) && !current.has(id));
    const room = Math.max(0, max - current.size);
    if (added.length && room) save.mutate([...current, ...added.slice(0, room)]);
  };

  return (
    <>
      <Heading
        title={`Add Clusters to ${project.name}`}
        text="Pick the clusters KubeiQ should work with, or connect a new one. You can change this any time in Settings."
      />

      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-medium">Connected Clusters</h2>
          {plan.data && (
            <span className={`text-sm tabular-nums ${used >= max ? "text-warning" : "text-muted"}`}>
              {used} of {max} clusters on the {plan.data.plan} plan
            </span>
          )}
        </div>
        {all.isPending ? (
          <p className="text-sm text-muted">Looking for clusters</p>
        ) : (all.data ?? []).length === 0 ? (
          <p className="text-sm text-muted">No clusters connected yet. Connect one below.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-bg">
            {all.data?.map((cluster) => (
              <ClusterChoice
                key={cluster.id}
                cluster={cluster}
                checked={inProject.has(cluster.id)}
                disabled={save.isPending || (!inProject.has(cluster.id) && used >= max)}
                onToggle={() => toggle(cluster.id)}
              />
            ))}
          </ul>
        )}
        {save.error && <p className="text-sm text-danger">{(save.error as Error).message}</p>}
        {used >= max && (
          <p className="text-[13px] text-subtle">
            The {plan.data?.plan} plan includes {max} clusters. Remove one to pick another, or upgrade
            to Pro for more.
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
        <AddCluster
          title="Connect a New Cluster"
          gkeAvailable={Boolean(gke.data?.identity.email && !gke.data.identity.error)}
          onAdded={addKubeconfig}
        />
      </section>

      <div className="flex flex-wrap items-center gap-4">
        <button type="button" className={primaryButton} onClick={() => router.replace("/")}>
          {inProject.size ? "Open KubeiQ" : "Skip for Now"}
        </button>
        {!inProject.size && (
          <span className="text-sm text-muted">KubeiQ shows clusters once they are in the project</span>
        )}
      </div>
    </>
  );
}

function ClusterChoice({
  cluster,
  checked,
  disabled,
  onToggle,
}: {
  cluster: Cluster;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const { status } = cluster;
  return (
    <li>
      <label className={`flex items-center gap-3 px-4 py-3 ${disabled ? "opacity-60" : "cursor-pointer hover:bg-surface"}`}>
        <input type="checkbox" checked={checked} disabled={disabled} onChange={onToggle} className="h-4 w-4 accent-[var(--accent)]" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium">{cluster.name}</span>
          <span className="truncate text-xs text-subtle">{SOURCE[cluster.method] ?? cluster.method}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2 text-xs text-subtle">
          <Dot tone={!status ? "info" : status.reachable ? "healthy" : "critical"} />
          {!status ? "Checking" : status.reachable ? `Kubernetes ${status.version}` : "Unreachable"}
        </span>
      </label>
    </li>
  );
}

const SOURCE: Record<string, string> = {
  kubeconfig: "Server kubeconfig",
  upload: "Added kubeconfig",
  gke: "Google Cloud",
};
