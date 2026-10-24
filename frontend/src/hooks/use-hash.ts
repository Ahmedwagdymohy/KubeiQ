"use client";

import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  window.addEventListener("popstate", onChange);
  return () => {
    window.removeEventListener("hashchange", onChange);
    window.removeEventListener("popstate", onChange);
  };
}

/** The URL hash (with `#`), kept in sync on navigation. Empty on the server. */
export function useHash(): string {
  return useSyncExternalStore(subscribe, () => window.location.hash, () => "");
}

/** Go to a hash on the current page so every `useHash` sees it. */
export function goToHash(id: string) {
  if (window.location.hash !== `#${id}`) window.location.hash = id;
}
