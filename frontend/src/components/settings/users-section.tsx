"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { PlanUsage } from "@/components/settings/plan-usage";
import { Field, input, primaryButton, Section } from "@/components/settings/fields";
import { SecretOnce } from "@/components/settings/secret-once";
import { timeAgo } from "@/components/doctor/history-list";
import { useMe } from "@/hooks/use-me";
import { api, type InviteRole, type Role, type User } from "@/lib/api";

export function UsersSection() {
  const queryClient = useQueryClient();
  const users = useQuery({ queryKey: ["users"], queryFn: api.users });
  const [secret, setSecret] = useState<{ username: string; password: string } | null>(null);
  const [allowed, setAllowed] = useState<string | null>(null);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["users"] });
    queryClient.invalidateQueries({ queryKey: ["projects"] });
  };
  const showPassword = (user: User) => {
    if (user.password) setSecret({ username: user.username, password: user.password });
    refresh();
  };

  const data = users.data;
  const full = !!data && data.users.length >= data.max_users;

  return (
    <Section
      id="users"
      title="Users"
      description="People allowed to sign in. Allow someone by email and give them a role; nobody else can sign in"
      aside={
        data && (
          <PlanUsage used={data.users.length} max={data.max_users} plan={data.plan} noun={["user", "users"]} />
        )
      }
    >
      <div className="flex flex-col gap-4">
        {secret && (
          <SecretOnce label={`Password for ${secret.username}`} value={secret.password} />
        )}
        {allowed && <p className="text-sm text-fg">{allowed} can now sign in with Google.</p>}
        <div className="flex flex-col divide-y divide-border rounded-lg border border-border bg-bg">
          {data?.users.map((user) => (
            <UserRow key={user.id} user={user} onChanged={showPassword} />
          ))}
        </div>
        {users.error && <p className="text-sm text-danger">{users.error.message}</p>}
        {full ? (
          <p className="text-sm text-muted">
            The {data.plan} plan includes up to {data.max_users} users. Upgrade to Pro to add
            more.
          </p>
        ) : (
          <AllowUser
            onAdded={(user) => {
              setAllowed(user.password ? null : user.username);
              showPassword(user);
            }}
          />
        )}
      </div>
    </Section>
  );
}

function UserRow({ user, onChanged }: { user: User; onChanged: (user: User) => void }) {
  const me = useMe();
  const queryClient = useQueryClient();
  const update = useMutation({
    mutationFn: (body: { role?: Role; reset_password?: boolean }) => api.updateUser(user.id, body),
    onSuccess: onChanged,
  });
  const remove = useMutation({
    mutationFn: () => api.deleteUser(user.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });
  const isMe = me.data?.username === user.username;
  const access = user.builtin
    ? "Signs in with the master key"
    : user.role === "admin"
      ? "Full access"
      : user.projects.length
        ? user.projects.map((p) => `${p.project} (${p.role})`).join(", ")
        : "No projects yet";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-medium">
          {user.username}
          <span className="ml-2 text-xs font-normal text-muted">
            {user.role === "admin" ? "Admin" : "User"}
            {user.auth_provider === "google" && " · Google"}
          </span>
          {user.status === "invited" && (
            <span className="ml-2 rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning">Invited</span>
          )}
        </span>
        <span className="text-xs text-subtle">
          {access}
          {user.last_sign_in ? ` · Last signed in ${timeAgo(user.last_sign_in)}` : user.status === "invited" ? " · Has not signed in yet" : ""}
        </span>
      </div>
      {!user.builtin && (
        <div className="flex items-center gap-4 text-sm">
          <button
            type="button"
            className="text-subtle transition-colors hover:text-fg"
            disabled={update.isPending}
            onClick={() => update.mutate({ role: user.role === "admin" ? "user" : "admin" })}
          >
            {user.role === "admin" ? "Make user" : "Make admin"}
          </button>
          {user.status === "invited" && user.auth_provider === "google" ? (
            <button
              type="button"
              className="text-subtle transition-colors hover:text-fg"
              onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/login`).catch(() => undefined)}
              title="They sign in with Google at this address"
            >
              Copy sign-in link
            </button>
          ) : (
            <button
              type="button"
              className="text-subtle transition-colors hover:text-fg"
              disabled={update.isPending}
              onClick={() => {
                if (window.confirm(`${user.status === "invited" ? "Send a new password to" : "Reset the password for"} ${user.username}? ${user.status === "invited" ? "The old one stops working." : "They will be signed out."}`))
                  update.mutate({ reset_password: true });
              }}
            >
              {user.status === "invited" ? "New password" : "Reset password"}
            </button>
          )}
          {!isMe && (
            <button
              type="button"
              className="text-subtle transition-colors hover:text-danger"
              disabled={remove.isPending}
              onClick={() => {
                if (window.confirm(`Remove ${user.username}? They will lose access right away.`))
                  remove.mutate();
              }}
            >
              {user.status === "invited" ? "Revoke invitation" : "Remove"}
            </button>
          )}
        </div>
      )}
      {(update.error || remove.error) && (
        <p className="w-full text-xs text-danger">{(update.error ?? remove.error)?.message}</p>
      )}
    </div>
  );
}

const ROLES: { id: InviteRole; label: string; text: (project: string) => string }[] = [
  { id: "viewer", label: "Viewer", text: (p) => `Sees the clusters of ${p} and investigates` },
  { id: "editor", label: "Editor", text: (p) => `Like a viewer, and makes changes in ${p} when cluster changes are on` },
  { id: "admin", label: "Admin", text: () => "Full access, including Settings and users" },
];

/** Allow someone to sign in: their email and a role. Nobody else can sign in (ADR 0013). */
function AllowUser({ onAdded }: { onAdded: (user: User) => void }) {
  const projects = useQuery({ queryKey: ["projects"], queryFn: api.projects });
  const methods = useQuery({ queryKey: ["auth", "providers"], queryFn: api.signInMethods });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InviteRole>("viewer");
  const [projectId, setProjectId] = useState("");
  const list = projects.data ?? [];
  const project = list.find((p) => p.id === projectId) ?? list[0];
  const google = Boolean(methods.data?.google);

  const allow = useMutation({
    mutationFn: () =>
      api.inviteUser({
        email: email.trim().toLowerCase(),
        role,
        ...(role !== "admin" && project ? { project_id: project.id } : {}),
      }),
    onSuccess: (user) => {
      setEmail("");
      onAdded(user);
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    allow.mutate();
  };
  const chosen = ROLES.find((r) => r.id === role) ?? ROLES[0];

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-lg border border-border bg-bg p-4">
      <span className="text-sm font-medium">Allow Someone</span>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px_auto] sm:items-end">
        <Field label="Email">
          <input
            className={input}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@company.com"
            autoCapitalize="none"
            spellCheck={false}
            required
          />
        </Field>
        <Field label="Role">
          <select className={input} value={role} onChange={(e) => setRole(e.target.value as InviteRole)}>
            {ROLES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </Field>
        <button type="submit" className={`${primaryButton} h-10`} disabled={allow.isPending || !email.trim()}>
          {allow.isPending ? "Allowing" : "Allow"}
        </button>
      </div>
      {role !== "admin" && list.length > 1 && (
        <Field label="Project">
          <select className={input} value={project?.id ?? ""} onChange={(e) => setProjectId(e.target.value)}>
            {list.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <p className="text-[13px] text-muted">{chosen.text(project?.name ?? "the project")}</p>
      {allow.error && <p className="text-sm text-danger">{allow.error.message}</p>}
      <p className="text-[13px] text-subtle">
        {google
          ? "They sign in with Google using this email. Nobody else can sign in."
          : "Sign in with Google is off, so KubeiQ creates a password to share with them once. Turn on Google under Sign-In to skip passwords."}
      </p>
    </form>
  );
}
