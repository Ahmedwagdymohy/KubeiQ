"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { Field, input, primaryButton, secondaryButton, Section } from "@/components/settings/fields";
import { SecretOnce } from "@/components/settings/secret-once";
import { useMe } from "@/hooks/use-me";
import { api, type Role, type User } from "@/lib/api";

export function UsersSection() {
  const queryClient = useQueryClient();
  const users = useQuery({ queryKey: ["users"], queryFn: api.users });
  const [secret, setSecret] = useState<{ username: string; password: string } | null>(null);

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
      description="People who can sign in. Admins manage everything; other users see the clusters and namespaces of their projects"
      aside={data && <PlanUsage used={data.users.length} max={data.max_users} plan={data.plan} />}
    >
      <div className="flex flex-col gap-4">
        {secret && (
          <SecretOnce label={`Password for ${secret.username}`} value={secret.password} />
        )}
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
          <AddUser onAdded={showPassword} />
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
          </span>
        </span>
        <span className="text-xs text-subtle">{access}</span>
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
          <button
            type="button"
            className="text-subtle transition-colors hover:text-fg"
            disabled={update.isPending}
            onClick={() => {
              if (window.confirm(`Reset the password for ${user.username}? They will be signed out.`))
                update.mutate({ reset_password: true });
            }}
          >
            Reset password
          </button>
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
              Remove
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

function AddUser({ onAdded }: { onAdded: (user: User) => void }) {
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<Role>("user");
  const [password, setPassword] = useState("");
  const add = useMutation({
    mutationFn: () =>
      api.createUser({ username: username.trim().toLowerCase(), role, password: password || undefined }),
    onSuccess: (user) => {
      setOpen(false);
      setUsername("");
      setPassword("");
      setRole("user");
      onAdded(user);
    },
  });

  if (!open) {
    return (
      <div>
        <button type="button" className={secondaryButton} onClick={() => setOpen(true)}>
          Add user
        </button>
      </div>
    );
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    add.mutate();
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-lg border border-border bg-bg p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Username" hint="Lowercase letters, numbers, dots and dashes">
          <input
            className={input}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoCapitalize="none"
            spellCheck={false}
            required
            autoFocus
          />
        </Field>
        <Field label="Role">
          <select className={input} value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="user">User (access through projects)</option>
            <option value="admin">Admin (full access)</option>
          </select>
        </Field>
      </div>
      <Field label="Password" hint="Leave empty to generate one">
        <input
          className={input}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          minLength={8}
        />
      </Field>
      {add.error && <p className="text-sm text-danger">{add.error.message}</p>}
      <div className="flex gap-2">
        <button type="submit" className={primaryButton} disabled={add.isPending || !username.trim()}>
          {add.isPending ? "Adding" : "Add user"}
        </button>
        <button type="button" className={secondaryButton} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** Seats used on the plan, as a bar at the true ratio with both ends labelled. */
function PlanUsage({ used, max, plan }: { used: number; max: number; plan: string }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-fg">
        {used} of {max} users on the {plan} plan
      </span>
      <span className="block h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        <span
          className="block h-full rounded-full bg-fg"
          style={{ width: `${Math.min(100, (used / Math.max(1, max)) * 100)}%` }}
        />
      </span>
      <span className="flex justify-between text-xs tabular-nums text-subtle">
        <span>0</span>
        <span>{max}</span>
      </span>
    </div>
  );
}
