import type { Cluster } from "@/lib/api";

/** How a cluster looks in pickers: working, being checked, not readable by KubeiQ, offline. */
export type Tone = "ok" | "checking" | "no-access" | "offline";

export function clusterTone(c: Cluster): Tone {
  if (!c.status) return "checking";
  if (!c.status.reachable && !c.login) return "offline";
  return c.status.can_read === false || c.login ? "no-access" : "ok";
}

export const TONE_DOT: Record<Tone, string> = {
  ok: "bg-healthy",
  checking: "bg-subtle",
  "no-access": "bg-warning",
  offline: "bg-danger",
};

/** Working clusters first; the ones KubeiQ cannot use last. Stable within a tone. */
export function byTone(clusters: Cluster[]): Cluster[] {
  const rank = (c: Cluster) => ["ok", "checking", "no-access", "offline"].indexOf(clusterTone(c));
  return [...clusters].sort((a, b) => rank(a) - rank(b));
}
