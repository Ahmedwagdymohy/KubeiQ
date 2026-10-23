"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Logo } from "@/components/logo";
import { Field, input, primaryButton } from "@/components/settings/fields";
import { ThemeToggle } from "@/components/theme-toggle";
import { api } from "@/lib/api";

/** Only same-site paths, so ?next= cannot send people to another site. */
function safeNext(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");

  const login = useMutation({
    mutationFn: () => api.login(username.trim(), password),
    onSuccess: (me) => {
      queryClient.clear();
      queryClient.setQueryData(["me"], me);
      router.replace(safeNext(params.get("next")));
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    login.mutate();
  };

  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex justify-end p-4">
        <ThemeToggle />
      </div>
      <main className="flex flex-1 items-start justify-center px-4 pt-[12vh]">
        <form
          onSubmit={submit}
          className="flex w-full max-w-sm flex-col gap-5 rounded-lg border border-border bg-panel p-8"
        >
          <div className="flex flex-col items-center gap-4 pb-2">
            <Logo />
            <h1 className="text-2xl font-bold tracking-tight">Sign In</h1>
          </div>
          <Field label="Username">
            <input
              className={input}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
            />
          </Field>
          <Field
            label="Password"
            hint="The admin signs in with the master key created at install."
          >
            <input
              className={input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              autoFocus
              required
            />
          </Field>
          {login.error && <p className="text-sm text-danger">{login.error.message}</p>}
          <button type="submit" className={primaryButton} disabled={login.isPending}>
            {login.isPending ? "Signing in" : "Sign In"}
          </button>
        </form>
      </main>
    </div>
  );
}
