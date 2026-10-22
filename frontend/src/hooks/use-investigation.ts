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

function mergeEvents(current: ProgressEvent[], incoming: ProgressEvent): ProgressEvent[] {
  if (current.some((e) => e.seq === incoming.seq)) return current;
  return [...current, incoming].sort((a, b) => a.seq - b.seq);
}

/** Start an investigation or open a past one, and follow its live progress. */
export function useInvestigation() {
  const queryClient = useQueryClient();
  const [state, setState] = useState<State>(EMPTY);
  const closeStream = useRef<(() => void) | null>(null);

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
            const investigation = await api.investigation(id);
            setState((s) =>
              s.id === id
                ? { ...s, investigation, status: investigation.status, events: investigation.events }
                : s,
            );
          } catch (err) {
            setState((s) => (s.id === id ? { ...s, error: (err as Error).message } : s));
          }
          queryClient.invalidateQueries({ queryKey: ["investigations"] });
        },
      );
    },
    [queryClient],
  );

  const start = useCallback(
    async (clusterId: string, namespace: string | null) => {
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

  const open = useCallback(
    async (id: string) => {
      closeStream.current?.();
      setState({ ...EMPTY, id });
      try {
        const investigation = await api.investigation(id);
        setState({
          id,
          status: investigation.status,
          events: investigation.events,
          investigation,
          error: null,
        });
        if (investigation.status === "queued" || investigation.status === "running") follow(id);
      } catch (err) {
        setState({ ...EMPTY, error: (err as Error).message });
      }
    },
    [follow],
  );

  useEffect(() => () => closeStream.current?.(), []);

  const running = state.status === "queued" || state.status === "running";
  return { ...state, running, start, open };
}
