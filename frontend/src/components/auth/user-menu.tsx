"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useMe } from "@/hooks/use-me";
import { api } from "@/lib/api";

/** Account button. On the rail the menu opens to the right, elsewhere below. */
export function UserMenu({ placement = "below" }: { placement?: "below" | "rail" }) {
  const me = useMe();
  const router = useRouter();
  const queryClient = useQueryClient();
  const logout = useMutation({
    mutationFn: api.logout,
    onSettled: () => {
      queryClient.clear();
      router.replace("/login");
    },
  });
  if (!me.data) return null;
  const { username, role, projects } = me.data;

  return (
    <div className="group relative">
      <button
        type="button"
        aria-label="Account"
        className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-sm font-semibold uppercase text-fg transition-colors hover:bg-control"
      >
        {username.slice(0, 1)}
      </button>
      <div
        className={`invisible absolute z-30 w-60 opacity-0 ${
          placement === "rail" ? "bottom-0 left-full pl-3" : "right-0 top-full pt-3"
        } transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100`}
      >
        <div className="flex flex-col rounded-lg border border-border bg-bg p-2 text-sm shadow-xl shadow-black/20">
          <div className="flex flex-col gap-0.5 px-3 py-2">
            <span className="font-medium text-fg">{username}</span>
            <span className="text-xs text-muted">
              {role === "admin"
                ? "Admin"
                : projects.length
                  ? projects.map((p) => p.project).join(", ")
                  : "No projects yet"}
            </span>
          </div>
          <Link
            href="/settings#account"
            className="rounded-md px-3 py-2 text-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            Account
          </Link>
          <button
            type="button"
            onClick={() => logout.mutate()}
            className="rounded-md px-3 py-2 text-left text-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
