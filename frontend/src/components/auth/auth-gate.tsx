"use client";

import { useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { Spinner } from "@/components/ui";
import { useMe } from "@/hooks/use-me";
import { ApiError, UNAUTHORIZED_EVENT } from "@/lib/api";

/** Pages render only for a signed-in user; everyone else is sent to /login. */
export function AuthGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const isLogin = pathname === "/login";
  const me = useMe();
  const signedOut = me.error instanceof ApiError && me.error.status === 401;

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

  // Pages stay mounted (hidden) while signing in so routing and prefetching keep working.
  const ready = isLogin || Boolean(me.data);
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
