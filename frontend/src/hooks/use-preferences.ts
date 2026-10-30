"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { api, type Preferences } from "@/lib/api";

const KEY = ["preferences"];

/** All of the signed-in user's preferences, saved on the server (pinned items, sidebar, ...). */
export function usePreferences() {
  return useQuery({ queryKey: KEY, queryFn: api.preferences, staleTime: Infinity, retry: false });
}

/**
 * One preference with a setter. The value changes at once; saving happens in the background,
 * so a slow or failed save never blocks the UI (the next load shows what the server kept).
 */
export function usePreference<T>(key: string, fallback: T): [T, (value: T) => void, boolean] {
  const queryClient = useQueryClient();
  const prefs = usePreferences();
  const value = (prefs.data?.[key] as T | undefined) ?? fallback;
  const set = useCallback(
    (next: T) => {
      queryClient.setQueryData<Preferences>(KEY, (old) => ({ ...old, [key]: next }));
      api.savePreference(key, next).catch(() => undefined);
    },
    [key, queryClient],
  );
  return [value, set, prefs.isSuccess];
}
