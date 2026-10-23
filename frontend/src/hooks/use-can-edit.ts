"use client";

import { useMe } from "@/hooks/use-me";

/** Whether the user may change resources in this cluster and namespace right now. */
export function useCanEdit(clusterId: string, namespace: string | null) {
  const me = useMe();
  if (!me.data?.changes_enabled) return false;
  if (me.data.role === "admin") return true;
  return me.data.access.some(
    (a) =>
      a.role === "editor" &&
      a.cluster_id === clusterId &&
      (a.namespaces === null || (namespace !== null && a.namespaces.includes(namespace))),
  );
}
