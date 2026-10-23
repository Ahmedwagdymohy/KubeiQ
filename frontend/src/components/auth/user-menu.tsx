"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { ChevronDownIcon } from "@/components/icons";
import { goToHash } from "@/hooks/use-hash";
import { useMe } from "@/hooks/use-me";
import { api } from "@/lib/api";

/** The signed-in user at the foot of the sidebar; opens Account and Sign Out. */
export function UserMenu({ onNavigate }: { onNavigate?: () => void }) {
  const me = useMe();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const logout = useMutation({
    mutationFn: api.logout,
    onSettled: () => {
      queryClient.clear();
      router.replace("/login");
    },
  });

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  if (!me.data) return null;
  const { username, role, projects } = me.data;
  const scope =
    role === "admin"
      ? "Admin"
      : projects.length
        ? projects.map((p) => p.project).join(", ")
        : "No projects yet";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-label="Account"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-frame-hover"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-control bg-bg text-xs font-semibold uppercase text-fg">
          {username.slice(0, 1)}
        </span>
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="truncate text-sm font-medium text-fg">{username}</span>
          <span className="truncate text-xs text-subtle">{scope}</span>
        </span>
        <ChevronDownIcon
          width={14}
          height={14}
          className={`shrink-0 text-subtle transition-transform ${open ? "" : "rotate-180"}`}
        />
      </button>
      {open && (
        <div className="absolute inset-x-0 bottom-full z-30 mb-1 flex flex-col rounded-lg border border-border bg-bg p-1 text-sm shadow-lg shadow-black/10">
          <Link
            href="/settings#account"
            onClick={(event) => {
              setOpen(false);
              if (pathname === "/settings") {
                event.preventDefault();
                goToHash("account");
              }
              onNavigate?.();
            }}
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
      )}
    </div>
  );
}
