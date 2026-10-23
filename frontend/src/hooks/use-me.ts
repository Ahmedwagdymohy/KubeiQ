"use client";

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";

/** The signed-in user. The auth gate makes sure this is loaded before pages render. */
export function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: api.me, retry: false, staleTime: 60_000 });
}

/** Whether the user may look at every namespace of a cluster (projects can limit this). */
export function useAllNamespaces(clusterId: string | null) {
  const me = useMe();
  if (!me.data || me.data.role === "admin") return true;
  return me.data.access.some((a) => a.cluster_id === clusterId && a.namespaces === null);
}
