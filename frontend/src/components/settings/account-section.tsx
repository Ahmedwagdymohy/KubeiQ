"use client";

import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { Field, input, primaryButton, Section } from "@/components/settings/fields";
import { useMe } from "@/hooks/use-me";
import { api } from "@/lib/api";

export function AccountSection() {
  const me = useMe();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const change = useMutation({
    mutationFn: () => api.changePassword(current, next),
    onSuccess: () => {
      setCurrent("");
      setNext("");
    },
  });
  if (!me.data) return null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    change.mutate();
  };

  return (
    <Section id="account" title="Account" description={`Signed in as ${me.data.username}`}>
      {me.data.builtin ? (
        <p className="max-w-2xl text-sm text-muted">
          This account signs in with the master key created at install. To change it, set{" "}
          <code className="font-mono text-xs">KUBEIQ_MASTER_KEY</code> and restart KubeiQ.
        </p>
      ) : me.data.auth_provider === "google" ? (
        <p className="max-w-2xl text-sm text-muted">
          You sign in with your Google account. Its password and security are managed by Google.
        </p>
      ) : (
        <form onSubmit={submit} className="flex max-w-md flex-col gap-4">
          <Field label="Current password">
            <input
              className={input}
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              required
            />
          </Field>
          <Field label="New password" hint="At least 8 characters">
            <input
              className={input}
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </Field>
          {change.error && <p className="text-sm text-danger">{change.error.message}</p>}
          {change.isSuccess && <p className="text-sm text-accent">Password changed</p>}
          <div>
            <button type="submit" className={primaryButton} disabled={change.isPending}>
              {change.isPending ? "Saving" : "Change password"}
            </button>
          </div>
        </form>
      )}
    </Section>
  );
}
