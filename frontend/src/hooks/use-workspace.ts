"use client";

import { useQuery } from "@tanstack/react-query";

import { api, type WorkspaceSettings } from "@/lib/api";

export const WORKSPACE_DEFAULTS: WorkspaceSettings = {
  show_usage: true,
  namespace_badges: true,
  compact_rows: false,
  confirm_delete: true,
};

/** The workspace's display settings (Settings › General), the same for every user. */
export function useWorkspace(): WorkspaceSettings {
  const q = useQuery({ queryKey: ["workspace"], queryFn: api.workspace, staleTime: 5 * 60_000 });
  return q.data ?? WORKSPACE_DEFAULTS;
}
