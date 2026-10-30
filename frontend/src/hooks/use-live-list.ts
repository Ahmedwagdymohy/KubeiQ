"use client";

import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useEffect, useState } from "react";

/**
 * Keeps a list query live: the server watches the kind and sends a "change" event per batch of
 * changes (about every quarter second at most); each one refetches the list. EventSource
 * reconnects on its own. Returns whether the watch is connected, so the page can say "Live" or
 * fall back to polling.
 */
export function useLiveList(url: string | null, key: QueryKey): boolean {
  const queryClient = useQueryClient();
  const [live, setLive] = useState(false);
  const keyText = JSON.stringify(key);

  useEffect(() => {
    if (!url) return;
    const source = new EventSource(url, { withCredentials: true });
    const queryKey = JSON.parse(keyText) as QueryKey;
    source.addEventListener("ready", () => setLive(true));
    source.addEventListener("change", () => queryClient.invalidateQueries({ queryKey }));
    source.onerror = () => setLive(false);
    return () => {
      source.close();
      setLive(false);
    };
  }, [url, keyText, queryClient]);

  return live;
}
