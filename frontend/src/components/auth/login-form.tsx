"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

import { GoogleMark } from "@/components/auth/google-mark";
import { Logo } from "@/components/logo";
import { Field, input, primaryButton, secondaryButton } from "@/components/settings/fields";
import { ThemeToggle } from "@/components/theme-toggle";
import { api, API_BASE_URL } from "@/lib/api";

/** Why a Google sign-in came back to this page (?error= from the callback). */
const GOOGLE_ERRORS: Record<string, string> = {
  not_invited: "This Google account has no access. Ask an admin to add your email.",
  user_limit: "KubeiQ has reached its user limit. Ask an admin to make room.",
  expired: "The sign-in took too long or was opened in another tab. Try again.",
  cancelled: "Google sign-in was cancelled.",
  google_off: "Sign in with Google is turned off.",
  failed: "Google could not confirm this account. Try again.",
};

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
  const methods = useQuery({ queryKey: ["auth", "providers"], queryFn: api.signInMethods });
  const googleError = GOOGLE_ERRORS[params.get("error") ?? ""];
  const googleUrl = `${API_BASE_URL}/api/v1/auth/google/start?next=${encodeURIComponent(safeNext(params.get("next")))}`;

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
    <div className="flex min-h-screen flex-col bg-frame">
      <div className="flex justify-end p-4">
        <ThemeToggle />
      </div>
      <main className="flex flex-1 items-start justify-center px-4 pt-[12vh]">
        <form
          onSubmit={submit}
          className="flex w-full max-w-sm flex-col gap-5 rounded-2xl border border-border bg-bg p-8"
        >
          <div className="flex flex-col items-center gap-4 pb-2">
            <Logo />
            <h1 className="text-lg font-semibold">Sign In</h1>
          </div>
          {googleError && <p className="text-sm text-danger">{googleError}</p>}
          {methods.data?.google && (
            <>
              <a href={googleUrl} className={`${secondaryButton} h-10 w-full`}>
                <GoogleMark />
                Continue with Google
              </a>
              <div className="flex items-center gap-3 text-xs text-subtle">
                <span className="h-px flex-1 bg-border" />
                or with a password
                <span className="h-px flex-1 bg-border" />
              </div>
            </>
          )}
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
