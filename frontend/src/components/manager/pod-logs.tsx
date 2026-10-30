"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { SparkleIcon } from "@/components/icons";
import { LogAnalysisPanel } from "@/components/manager/log-analysis";
import { Switch } from "@/components/settings/fields";
import { Spinner } from "@/components/ui";
import { api, type KindInfo } from "@/lib/api";

const control =
  "h-8 rounded-lg border border-control bg-bg px-2 text-sm text-fg outline-none focus:border-accent";

const LEVEL: [RegExp, string][] = [
  [/\b(ERROR|ERR|FATAL|CRIT(ICAL)?|PANIC|panic|Exception|Traceback)\b/, "text-terminal-error"],
  [/\b(WARN(ING)?)\b/, "text-terminal-warn"],
  [/\b(DEBUG|TRACE)\b/, "text-terminal-fg/50"],
];

function levelClass(line: string) {
  return LEVEL.find(([re]) => re.test(line))?.[1] ?? "";
}

function splitStamp(line: string): [Date | null, string] {
  const space = line.indexOf(" ");
  const stamp = new Date(line.slice(0, space));
  return Number.isNaN(stamp.getTime()) ? [null, line] : [stamp, line.slice(space + 1)];
}

const toolButton = (on: boolean) =>
  `h-8 rounded-lg border px-2.5 text-sm transition-colors ${on ? "border-accent text-fg" : "border-control text-muted hover:text-fg"}`;

/**
 * A pod's logs: follow live or pause (new lines wait in a buffer), search with next and previous,
 * wrap, timestamps, colour by level, copy and download. Reads at most 2,000 lines.
 */
export function PodLogsView({
  cluster,
  namespace,
  pod,
  picker,
}: {
  cluster: string;
  namespace: string;
  pod: string;
  /** Shown first in the controls row, e.g. the pod picker of a workload. */
  picker?: ReactNode;
}) {
  const [container, setContainer] = useState<string | undefined>();
  const [tail, setTail] = useState(500);
  const [previous, setPrevious] = useState(false);
  const [paused, setPaused] = useState<string[] | null>(null);
  const [wrap, setWrap] = useState(true);
  const [stamps, setStamps] = useState(true);
  const [search, setSearch] = useState("");
  const [hit, setHit] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [focus, setFocus] = useState(-1);
  const box = useRef<HTMLDivElement>(null);
  const logs = useQuery({
    queryKey: ["manager", "logs", cluster, namespace, pod, container, tail, previous],
    queryFn: () => api.logs(cluster, namespace, pod, { container, tail, previous }),
    refetchInterval: previous ? false : 3_000,
    placeholderData: keepPreviousData,
  });
  const latest = logs.data?.lines ?? [];
  const shown = paused ?? latest;
  const fresh = paused ? Math.max(0, latest.length - latest.lastIndexOf(paused[paused.length - 1]) - 1) : 0;
  const q = search.trim().toLowerCase();
  const matches = q ? shown.flatMap((line, i) => (line.toLowerCase().includes(q) ? [i] : [])) : [];
  const current = focus >= 0 ? focus : matches.length ? matches[((hit % matches.length) + matches.length) % matches.length] : -1;
  const jump = (line: string) => {
    const needle = line.slice(0, 80);
    const at = shown.findIndex((l) => splitStamp(l)[1].includes(needle));
    if (at >= 0) {
      setPaused(paused ?? latest);
      setFocus(at);
    }
  };

  useEffect(() => {
    if (current >= 0) box.current?.querySelector(`[data-line="${current}"]`)?.scrollIntoView({ block: "center" });
  }, [current]);
  useEffect(() => {
    // Following: stay at the newest line unless the user is searching.
    if (!paused && !q && box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [latest.length, paused, q]);

  const text = (lines: string[]) =>
    lines
      .map((line) => {
        const [stamp, rest] = splitStamp(line);
        return stamps && stamp ? `${stamp.toISOString()} ${rest}` : rest;
      })
      .join("\n");
  const download = () => {
    const url = URL.createObjectURL(new Blob([text(shown)], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${pod}${logs.data?.container ? `-${logs.data.container}` : ""}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex min-h-0 flex-col gap-3 p-6">
      <div className="flex flex-wrap items-center gap-2">
        {picker}
        {logs.data && logs.data.containers.length > 1 && (
          <select aria-label="Container" value={logs.data.container} onChange={(e) => setContainer(e.target.value)} className={control}>
            {logs.data.containers.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        )}
        <select aria-label="Lines" value={tail} onChange={(e) => setTail(Number(e.target.value))} className={control}>
          {[100, 500, 1000, 2000].map((n) => (
            <option key={n} value={n}>
              Last {n} lines
            </option>
          ))}
        </select>
        <Switch checked={previous} onChange={setPrevious} label="Before last restart" />
        {!previous && (
          <button type="button" className={toolButton(!paused)} onClick={() => setPaused(paused ? null : latest)}>
            {paused ? (fresh ? `Resume · ${fresh} new` : "Resume") : "Live"}
          </button>
        )}
        {logs.isFetching && !paused && <Spinner />}
        <button
          type="button"
          onClick={() => setAnalyzing(true)}
          className="ml-auto flex h-8 items-center gap-1.5 rounded-lg border border-control px-2.5 text-sm font-medium text-fg transition-colors hover:border-subtle"
        >
          <SparkleIcon width={14} height={14} className="text-accent" />
          Analyze
        </button>
      </div>
      {analyzing && (
        <LogAnalysisPanel
          cluster={cluster}
          namespace={namespace}
          pod={pod}
          container={logs.data?.container}
          previous={previous}
          onJump={jump}
          onClose={() => setAnalyzing(false)}
        />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex h-8 min-w-0 flex-1 items-center rounded-lg border border-control bg-bg focus-within:border-accent sm:max-w-80">
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setHit(0);
              setFocus(-1);
            }}
            onKeyDown={(e) => e.key === "Enter" && setHit((h) => h + (e.shiftKey ? -1 : 1))}
            placeholder="Search logs"
            aria-label="Search logs"
            className="h-full min-w-0 flex-1 bg-transparent px-2.5 text-sm outline-none"
          />
          {q && (
            <span className="shrink-0 px-2 text-xs tabular-nums text-subtle">
              {matches.length ? `${matches.indexOf(current) + 1} of ${matches.length}` : "0"}
            </span>
          )}
          <button type="button" aria-label="Previous match" disabled={!matches.length} onClick={() => setHit((h) => h - 1)} className="px-1.5 text-subtle hover:text-fg disabled:opacity-30">
            ↑
          </button>
          <button type="button" aria-label="Next match" disabled={!matches.length} onClick={() => setHit((h) => h + 1)} className="px-1.5 pr-2 text-subtle hover:text-fg disabled:opacity-30">
            ↓
          </button>
        </div>
        <button type="button" className={toolButton(wrap)} onClick={() => setWrap(!wrap)} aria-pressed={wrap}>
          Wrap
        </button>
        <button type="button" className={toolButton(stamps)} onClick={() => setStamps(!stamps)} aria-pressed={stamps}>
          Timestamps
        </button>
        <button type="button" className={toolButton(false)} onClick={() => navigator.clipboard?.writeText(text(shown)).catch(() => undefined)}>
          Copy
        </button>
        <button type="button" className={toolButton(false)} onClick={download}>
          Download
        </button>
      </div>
      {logs.error && <p className="text-sm text-danger">{logs.error.message}</p>}
      {logs.data && shown.length === 0 && <p className="text-sm text-muted">No logs yet</p>}
      {shown.length > 0 && (
        <div ref={box} className="max-h-[70vh] min-h-48 overflow-auto rounded-lg bg-terminal py-3 font-mono text-xs leading-5 text-terminal-fg">
          {shown.map((line, i) => {
            const [stamp, rest] = splitStamp(line);
            return (
              <div
                key={i}
                data-line={i}
                className={`px-4 ${wrap ? "whitespace-pre-wrap break-words" : "whitespace-pre"} ${levelClass(rest)} ${
                  i === current ? "bg-white/15" : matches.includes(i) ? "bg-white/[0.06]" : ""
                }`}
              >
                {stamps && stamp && <span className="mr-3 select-none text-terminal-fg/40">{stamp.toLocaleTimeString()}</span>}
                {rest}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Logs of a workload or Service: pick one of its pods, the ones with problems first. */
export function WorkloadLogs({
  cluster,
  kind,
  namespace,
  name,
}: {
  cluster: string;
  kind: KindInfo;
  namespace: string;
  name: string;
}) {
  const ref = { group: kind.group, version: kind.version, resource: kind.resource, namespace, name };
  const pods = useQuery({
    queryKey: ["manager", "workload-pods", cluster, ref],
    queryFn: () => api.workloadPods(cluster, ref),
    refetchInterval: 15_000,
  });
  const [chosen, setChosen] = useState<string | undefined>();
  const list = pods.data ?? [];
  const pod = list.find((p) => p.name === chosen)?.name ?? list[0]?.name;

  if (pods.error) return <p className="p-6 text-sm text-danger">{pods.error.message}</p>;
  if (pods.isPending) return <p className="p-6 text-sm text-muted">Loading</p>;
  if (!pod)
    return (
      <p className="p-6 text-sm text-muted">
        {kind.kind === "Service" ? "No pods match this Service's selector" : `No pods running for this ${kind.kind}`}
      </p>
    );
  return (
    <PodLogsView
      key={pod}
      cluster={cluster}
      namespace={namespace}
      pod={pod}
      picker={
        <select aria-label="Pod" value={pod} onChange={(e) => setChosen(e.target.value)} className={`${control} max-w-full`}>
          {list.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name} · {p.status}
              {p.restarts ? `, ${p.restarts} restarts` : ""}
            </option>
          ))}
        </select>
      }
    />
  );
}
