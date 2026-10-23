"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { Field, input, primaryButton, secondaryButton, Section } from "@/components/settings/fields";
import {
  api,
  type Cluster,
  type Project,
  type ProjectInput,
  type ProjectRole,
  type User,
} from "@/lib/api";

const EMPTY: ProjectInput = { name: "", description: null, scopes: [], members: [] };

export function ProjectsSection() {
  const projects = useQuery({ queryKey: ["projects"], queryFn: api.projects });
  const users = useQuery({ queryKey: ["users"], queryFn: api.users });
  const clusters = useQuery({ queryKey: ["clusters"], queryFn: api.clusters });
  // "new" for the add form, a project id while editing, null when closed
  const [editing, setEditing] = useState<string | null>(null);

  const people = (users.data?.users ?? []).filter((u) => u.role !== "admin");

  return (
    <Section
      id="projects"
      title="Projects"
      description="A project gives its members access to clusters and namespaces. Viewers can look and investigate; editors can also make changes when changes are turned on"
    >
      <div className="flex max-w-3xl flex-col gap-4">
        {projects.data?.map((project) =>
          editing === project.id ? (
            <ProjectForm
              key={project.id}
              project={project}
              clusters={clusters.data ?? []}
              people={people}
              onDone={() => setEditing(null)}
            />
          ) : (
            <ProjectCard
              key={project.id}
              project={project}
              clusters={clusters.data ?? []}
              onEdit={() => setEditing(project.id)}
            />
          ),
        )}
        {projects.data?.length === 0 && editing !== "new" && (
          <p className="text-sm text-muted">
            No projects yet. Admins see everything; add a project to give other users access.
          </p>
        )}
        {projects.error && <p className="text-sm text-danger">{projects.error.message}</p>}
        {editing === "new" ? (
          <ProjectForm
            clusters={clusters.data ?? []}
            people={people}
            onDone={() => setEditing(null)}
          />
        ) : (
          <div>
            <button type="button" className={secondaryButton} onClick={() => setEditing("new")}>
              Add project
            </button>
          </div>
        )}
      </div>
    </Section>
  );
}

function clusterName(clusters: Cluster[], id: string) {
  return clusters.find((c) => c.id === id)?.name ?? id;
}

function ProjectCard({
  project,
  clusters,
  onEdit,
}: {
  project: Project;
  clusters: Cluster[];
  onEdit: () => void;
}) {
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: () => api.deleteProject(project.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
  return (
    <div className="flex flex-col gap-3 rounded-md border border-border px-4 py-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">{project.name}</span>
          {project.description && (
            <span className="text-xs text-muted">{project.description}</span>
          )}
        </div>
        <div className="flex gap-4 text-sm">
          <button type="button" onClick={onEdit} className="text-subtle hover:text-fg">
            Edit
          </button>
          <button
            type="button"
            disabled={remove.isPending}
            onClick={() => {
              if (window.confirm(`Delete ${project.name}? Its members lose this access.`))
                remove.mutate();
            }}
            className="text-subtle hover:text-danger"
          >
            Delete
          </button>
        </div>
      </div>
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-subtle">Access</span>
          {project.scopes.length === 0 && <span className="text-muted">No clusters yet</span>}
          {project.scopes.map((scope) => (
            <span key={scope.cluster_id}>
              {clusterName(clusters, scope.cluster_id)}
              <span className="text-muted">
                {" · "}
                {scope.namespaces.length ? scope.namespaces.join(", ") : "All namespaces"}
              </span>
            </span>
          ))}
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-subtle">Members</span>
          {project.members.length === 0 && <span className="text-muted">No members yet</span>}
          {project.members.map((m) => (
            <span key={m.user_id}>
              {m.username}
              <span className="text-muted"> · {m.role === "editor" ? "Editor" : "Viewer"}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

type ScopeDraft = { cluster_id: string; namespaces: string };

function ProjectForm({
  project,
  clusters,
  people,
  onDone,
}: {
  project?: Project;
  clusters: Cluster[];
  people: User[];
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const initial = project ?? EMPTY;
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description ?? "");
  const [scopes, setScopes] = useState<ScopeDraft[]>(
    initial.scopes.map((s) => ({ cluster_id: s.cluster_id, namespaces: s.namespaces.join(", ") })),
  );
  const [members, setMembers] = useState<Record<string, ProjectRole | "">>(
    Object.fromEntries(initial.members.map((m) => [m.user_id, m.role])),
  );

  const save = useMutation({
    mutationFn: () => {
      const body: ProjectInput = {
        name: name.trim(),
        description: description.trim() || null,
        scopes: scopes
          .filter((s) => s.cluster_id)
          .map((s) => ({
            cluster_id: s.cluster_id,
            namespaces: s.namespaces
              .split(",")
              .map((n) => n.trim())
              .filter(Boolean),
          })),
        members: Object.entries(members)
          .filter(([, role]) => role)
          .map(([user_id, role]) => ({ user_id, role: role as ProjectRole })),
      };
      return project ? api.updateProject(project.id, body) : api.createProject(body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
      onDone();
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };
  const setScope = (index: number, patch: Partial<ScopeDraft>) =>
    setScopes(scopes.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  const unused = clusters.filter((c) => !scopes.some((s) => s.cluster_id === c.id));

  return (
    <form onSubmit={submit} className="flex flex-col gap-5 rounded-md border border-border p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name">
          <input
            className={input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
            autoFocus
          />
        </Field>
        <Field label="Description">
          <input
            className={input}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional"
          />
        </Field>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-muted">Clusters and namespaces</span>
        {scopes.map((scope, index) => (
          <div key={index} className="grid items-center gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <select
              className={input}
              value={scope.cluster_id}
              onChange={(e) => setScope(index, { cluster_id: e.target.value })}
              aria-label="Cluster"
            >
              <option value="">Choose a cluster</option>
              {clusters
                .filter((c) => c.id === scope.cluster_id || unused.includes(c))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
            <input
              className={input}
              value={scope.namespaces}
              onChange={(e) => setScope(index, { namespaces: e.target.value })}
              placeholder="All namespaces, or e.g. shop, payments"
              aria-label="Namespaces"
            />
            <button
              type="button"
              className="px-2 text-sm text-subtle hover:text-danger"
              onClick={() => setScopes(scopes.filter((_, i) => i !== index))}
            >
              Remove
            </button>
          </div>
        ))}
        {unused.length > 0 && (
          <div>
            <button
              type="button"
              className="text-sm text-accent hover:underline"
              onClick={() => setScopes([...scopes, { cluster_id: "", namespaces: "" }])}
            >
              Add cluster
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-muted">Members</span>
        {people.length === 0 && (
          <span className="text-sm text-subtle">
            Add users first. Admins already have access to everything.
          </span>
        )}
        {people.map((user) => (
          <div key={user.id} className="flex items-center justify-between gap-3">
            <span className="text-sm">{user.username}</span>
            <select
              className={`${input} w-40`}
              value={members[user.id] ?? ""}
              onChange={(e) =>
                setMembers({ ...members, [user.id]: e.target.value as ProjectRole | "" })
              }
              aria-label={`Role for ${user.username}`}
            >
              <option value="">No access</option>
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
            </select>
          </div>
        ))}
      </div>

      {save.error && <p className="text-sm text-danger">{save.error.message}</p>}
      <div className="flex gap-2">
        <button type="submit" className={primaryButton} disabled={save.isPending || !name.trim()}>
          {save.isPending ? "Saving" : project ? "Save project" : "Add project"}
        </button>
        <button type="button" className={secondaryButton} onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}
