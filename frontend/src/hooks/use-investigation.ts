"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  api,
  ApiError,
  streamInvestigation,
  type Investigation,
  type InvestigationStatus,
  type ProgressEvent,
} from "@/lib/api";

type State = {
  id: string | null;
  status: InvestigationStatus | null;
  events: ProgressEvent[];
  investigation: Investigation | null;
  error: string | null;
};

const EMPTY: State = { id: null, status: null, events: [], investigation: null, error: null };

const finished = (status: InvestigationStatus | null) =>
  status === "completed" || status === "failed";

function mergeEvents(current: ProgressEvent[], incoming: ProgressEvent): ProgressEvent[] {
  if (current.some((e) => e.seq === incoming.seq)) return current;
  return [...current, incoming].sort((a, b) => a.seq - b.seq);
}

function fromInvestigation(investigation: Investigation): State {
  return {
    id: investigation.id,
    status: investigation.status,
    events: investigation.events,
    investigation,
    error: null,
  };
}

/** Start an investigation or open a past one, and follow its live progress. */
export function useInvestigation() {
  const queryClient = useQueryClient();
  const [state, setState] = useState<State>(EMPTY);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const closeStream = useRef<(() => void) | null>(null);
  const latestRequest = useRef<string | null>(null);

  // Finished investigations never change, so cache them forever: switching back is instant.
  const load = useCallback(
    (id: string) =>
      queryClient.fetchQuery({
        queryKey: ["investigation", id],
        queryFn: () => api.investigation(id),
        staleTime: (query) => (finished(query.state.data?.status ?? null) ? Infinity : 0),
      }),
    [queryClient],
  );

  const follow = useCallback(
    (id: string) => {
      closeStream.current?.();
      closeStream.current = streamInvestigation(
        id,
        (event) =>
          setState((s) =>
            s.id === id ? { ...s, status: "running", events: mergeEvents(s.events, event) } : s,
          ),
        async () => {
          try {
            queryClient.removeQueries({ queryKey: ["investigation", id] });
            const investigation = await load(id);
            setState((s) => (s.id === id ? fromInvestigation(investigation) : s));
          } catch (err) {
            setState((s) => (s.id === id ? { ...s, error: (err as Error).message } : s));
          }
          queryClient.invalidateQueries({ queryKey: ["investigations"] });
        },
      );
    },
    [load, queryClient],
  );

  const start = useCallback(
    async (clusterId: string, namespace: string | null) => {
      closeStream.current?.();
      latestRequest.current = null;
      setState({ ...EMPTY, status: "queued" });
      try {
        const created = await api.startInvestigation(clusterId, namespace);
        setState({ ...EMPTY, id: created.id, status: created.status });
        queryClient.invalidateQueries({ queryKey: ["investigations"] });
        follow(created.id);
      } catch (err) {
        setState({ ...EMPTY, error: err instanceof ApiError ? err.message : "Could not start" });
      }
    },
    [follow, queryClient],
  );

  // Keeps the current view on screen until the next investigation has loaded (no flicker).
  const open = useCallback(
    async (id: string) => {
      latestRequest.current = id;
      setLoadingId(id);
      try {
        const investigation = await load(id);
        if (latestRequest.current !== id) return; // a newer click won
        closeStream.current?.();
        setState(fromInvestigation(investigation));
        if (!finished(investigation.status)) follow(id);
      } catch (err) {
        if (latestRequest.current === id) setState({ ...EMPTY, error: (err as Error).message });
      } finally {
        setLoadingId((current) => (current === id ? null : current));
      }
    },
    [follow, load],
  );

  useEffect(() => () => closeStream.current?.(), []);

  const running = state.status === "queued" || state.status === "running";
  return { ...state, running, loading: loadingId !== null, start, open };
}
