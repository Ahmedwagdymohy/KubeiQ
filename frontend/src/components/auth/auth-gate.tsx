"use client";

import { useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { Logo } from "@/components/logo";
import { primaryButton, secondaryButton } from "@/components/settings/fields";
import { Spinner } from "@/components/ui";
import { useMe } from "@/hooks/use-me";
import { api, ApiError, UNAUTHORIZED_EVENT } from "@/lib/api";

/** Pages render only for a signed-in user; everyone else is sent to /login. */
export function AuthGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const isLogin = pathname === "/login";
  const me = useMe();
  const signedOut = me.error instanceof ApiError && me.error.status === 401;
  // First sign-in: an admin sets up a project before anything else (Settings stays open).
  const setup = Boolean(me.data?.setup_needed) && pathname !== "/welcome" && !pathname.startsWith("/settings");
  const noProject = me.data?.role === "user" && me.data.projects.length === 0 && !pathname.startsWith("/settings");

  useEffect(() => {
    const onUnauthorized = () => queryClient.invalidateQueries({ queryKey: ["me"] });
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [queryClient]);

  useEffect(() => {
    if (signedOut && !isLogin) {
      const next = window.location.pathname + window.location.search;
      router.replace(next === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`);
    }
  }, [signedOut, isLogin, router]);

  useEffect(() => {
    if (setup && !isLogin) router.replace("/welcome");
  }, [setup, isLogin, router]);

  if (noProject && !isLogin) return <NoProject username={me.data?.username ?? ""} />;

  // Pages stay mounted (hidden) while signing in so routing and prefetching keep working.
  const ready = isLogin || (Boolean(me.data) && !setup);
  return (
    <>
      {!ready && (
        <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted">
          {me.error && !signedOut ? me.error.message : <Spinner />}
        </div>
      )}
      <div className={ready ? "contents" : "hidden"}>{children}</div>
    </>
  );
}

/** A signed-in user who is not in any project yet: nothing to show until an admin adds them. */
function NoProject({ username }: { username: string }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const signOut = async () => {
    await api.logout();
    queryClient.clear();
    router.replace("/login");
  };
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="flex max-w-[420px] flex-col items-center gap-4 text-center">
        <Logo />
        <h1 className="text-xl font-semibold tracking-tight">You&apos;re Not in a Project Yet</h1>
        <p className="text-sm text-muted">
          Signed in as {username}. KubeiQ shows the clusters of your projects. Ask an admin to add
          you to one, then reload this page.
        </p>
        <div className="flex gap-3">
          <button type="button" className={primaryButton} onClick={() => window.location.reload()}>
            Reload
          </button>
          <button type="button" className={secondaryButton} onClick={signOut}>
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
