"use client";

import { useEffect, useState } from "react";

import { getHealth } from "@/lib/api";

type Status = { state: "checking" } | { state: "ready"; version: string } | { state: "offline" };

const styles: Record<Status["state"], { dot: string; label: string }> = {
  checking: { dot: "bg-subtle animate-pulse", label: "Checking backend" },
  ready: { dot: "bg-accent", label: "System ready" },
  offline: { dot: "bg-danger", label: "Backend unreachable" },
};

export function SystemStatus() {
  const [status, setStatus] = useState<Status>({ state: "checking" });

  useEffect(() => {
    const controller = new AbortController();
    getHealth(controller.signal)
      .then((health) => setStatus({ state: "ready", version: health.version }))
      .catch(() => {
        if (!controller.signal.aborted) setStatus({ state: "offline" });
      });
    return () => controller.abort();
  }, []);

  const { dot, label } = styles[status.state];

  return (
    <div className="inline-flex h-8 items-center gap-2 text-sm text-muted">
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      {label}
      {status.state === "ready" && <span className="tabular-nums text-subtle">v{status.version}</span>}
    </div>
  );
}
