"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

import type { Cluster } from "@/lib/api";

/**
 * The cluster in scope, shared by the top bar and every product. Stored per browser so the
 * products open on the cluster you last picked. A `?cluster=` link still wins on the page it opens.
 */
const KEY = "kubeiq-cluster";
const EVENT = "kubeiq-cluster";

type Detail = { id: string; user: boolean };

function read(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

/**
 * Put a cluster in scope. `user: true` means someone picked it, so pages switch to it;
 * `user: false` only records what a page already shows (for example from a shared link).
 */
export function setClusterScope(id: string, user = true) {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // storage unavailable; the scope still applies until reload
  }
  window.dispatchEvent(new CustomEvent<Detail>(EVENT, { detail: { id, user } }));
}

export function useClusterScope(): string | null {
  return useSyncExternalStore(subscribe, read, () => null);
}

const usable = (c: Cluster) => c.status?.reachable && c.status.can_read !== false;

/**
 * The cluster to show: the scoped one if it exists, else one that works (the default first), so
 * a broken default never holds every page on an error.
 */
export function resolveCluster(clusters: Cluster[] | undefined, scoped: string | null) {
  if (!clusters?.length) return null;
  if (scoped && clusters.some((c) => c.id === scoped)) return scoped;
  const working = clusters.filter(usable);
  return (
    working.find((c) => c.is_default)?.id ??
    working[0]?.id ??
    clusters.find((c) => c.is_default)?.id ??
    clusters[0].id
  );
}

/** Runs `onPick` when someone picks a cluster (in the top bar or on the page). */
export function useClusterPicked(onPick: (id: string) => void) {
  const handler = useRef(onPick);
  useEffect(() => {
    handler.current = onPick;
  });
  useEffect(() => {
    const listen = (event: Event) => {
      const detail = (event as CustomEvent<Detail>).detail;
      if (detail?.user) handler.current(detail.id);
    };
    window.addEventListener(EVENT, listen);
    return () => window.removeEventListener(EVENT, listen);
  }, []);
}
