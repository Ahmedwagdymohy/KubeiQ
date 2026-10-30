"use client";

import "@xterm/xterm/css/xterm.css";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { input, primaryButton, secondaryButton } from "@/components/settings/fields";
import { api, terminalUrl } from "@/lib/api";

const control = "h-8 rounded-lg border border-control bg-bg px-2 text-sm text-fg outline-none focus:border-accent";

type State = "idle" | "connecting" | "open" | "closed";

/** The pod's containers (from its spec), for the terminal and file pickers. */
export function usePodContainers(cluster: string, namespace: string, pod: string) {
  const obj = useQuery({
    queryKey: ["manager", "object", cluster, { group: "", version: "v1", resource: "pods", namespace, name: pod }],
    queryFn: () => api.object(cluster, { group: "", version: "v1", resource: "pods", namespace, name: pod }),
  });
  const spec = obj.data?.object.spec as { containers?: { name: string }[] } | undefined;
  return (spec?.containers ?? []).map((c) => c.name);
}

/**
 * A shell in a container (ADR 0009). Opens on request, because every session is recorded:
 * bash, else ash, else sh. Distroless images get the kubectl debug command instead.
 */
export function PodTerminal({ cluster, namespace, pod }: { cluster: string; namespace: string; pod: string }) {
  const containers = usePodContainers(cluster, namespace, pod);
  const [container, setContainer] = useState<string | null>(null);
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string | null>(null);
  const [fontSize, setFontSize] = useState(13);
  const [session, setSession] = useState(0);
  const [typed, setTyped] = useState("");
  const clusters = useQuery({ queryKey: ["clusters"], queryFn: api.clusters });
  const info = clusters.data?.find((c) => c.id === cluster);
  const production = info?.labels?.some((l) => l.name === "production") ? info.name : null;
  const chosen = container ?? containers[0] ?? null;
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!session || !chosen || !host.current) return;
    let disposed = false;
    let socket: WebSocket | null = null;
    let cleanup = () => undefined as void;
    (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([import("@xterm/xterm"), import("@xterm/addon-fit")]);
      if (disposed || !host.current) return;
      const term = new Terminal({
        fontSize,
        fontFamily: "var(--font-jetbrains-mono), ui-monospace, monospace",
        cursorBlink: true,
        // xterm needs colour values: take them from the design tokens.
        theme: (() => {
          const css = getComputedStyle(document.documentElement);
          const token = (name: string) => css.getPropertyValue(name).trim();
          return { background: token("--terminal"), foreground: token("--terminal-text"), cursor: token("--accent") };
        })(),
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(host.current);
      fit.fit();
      setState("connecting");
      socket = new WebSocket(terminalUrl(cluster, namespace, pod, chosen, production ? typed : undefined));
      const send = (msg: object) => socket?.readyState === WebSocket.OPEN && socket.send(JSON.stringify(msg));
      socket.onopen = () => {
        setState("open");
        send({ type: "resize", cols: term.cols, rows: term.rows });
        term.focus();
      };
      socket.onmessage = (event) => {
        const msg = JSON.parse(event.data as string) as { type: string; data?: string; message?: string };
        if (msg.type === "output" && msg.data) term.write(msg.data);
        else if (msg.type === "error") setError(msg.message ?? "The terminal could not start");
        else if (msg.type === "exit") setState("closed");
      };
      socket.onclose = () => setState("closed");
      const input = term.onData((data) => send({ type: "input", data }));
      const resize = new ResizeObserver(() => {
        fit.fit();
        send({ type: "resize", cols: term.cols, rows: term.rows });
      });
      resize.observe(host.current);
      cleanup = () => {
        resize.disconnect();
        input.dispose();
        socket?.close();
        term.dispose();
      };
    })();
    return () => {
      disposed = true;
      cleanup();
    };
    // The session restarts only when asked (Open, Reconnect) or the font size changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, fontSize]);

  return (
    <div className="flex flex-col gap-3 p-6">
      <div className="flex flex-wrap items-center gap-2">
        {containers.length > 1 && (
          <select aria-label="Container" value={chosen ?? ""} onChange={(e) => setContainer(e.target.value)} className={control} disabled={state === "open"}>
            {containers.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        )}
        {state === "idle" ? (
          <button
            type="button"
            className={primaryButton}
            disabled={!chosen || (production !== null && typed !== production)}
            onClick={() => {
              setError(null);
              setSession((n) => n + 1);
            }}
          >
            Open terminal
          </button>
        ) : (
          <button
            type="button"
            className={secondaryButton}
            onClick={() => {
              setError(null);
              setSession((n) => n + 1);
            }}
          >
            Reconnect
          </button>
        )}
        <span className="text-sm text-subtle">{state === "connecting" ? "Connecting" : state === "open" ? "Connected" : state === "closed" ? "Session ended" : ""}</span>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" aria-label="Smaller text" className={secondaryButton} onClick={() => setFontSize((s) => Math.max(10, s - 1))}>
            A−
          </button>
          <button type="button" aria-label="Larger text" className={secondaryButton} onClick={() => setFontSize((s) => Math.min(20, s + 1))}>
            A+
          </button>
        </div>
      </div>
      {production && state === "idle" && (
        <label className="flex flex-col gap-1.5 rounded-lg bg-danger-soft p-3 text-sm">
          <span>
            This is a production cluster. Type <span className="font-mono">{production}</span> to open a terminal
          </span>
          <input className={input} value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Cluster name" />
        </label>
      )}
      {error && <p className="break-words rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      <div className={`h-[60vh] overflow-hidden rounded-lg bg-terminal p-2 ${session ? "" : "hidden"}`}>
        <div ref={host} className="h-full w-full" />
      </div>
      {!session && (
        <p className="text-[13px] text-subtle">
          Every session is recorded in the activity log. Commands run with the container&apos;s own user
        </p>
      )}
    </div>
  );
}
