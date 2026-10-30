"use client";

import { useState } from "react";

import { ConnectPanel } from "@/components/settings/connect-panel";
import { GkePanel } from "@/components/settings/gke-connect";

function Choice({
  selected,
  onSelect,
  title,
  text,
  badge,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  text: string;
  badge?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`flex flex-col gap-1 rounded-lg border px-4 py-3 text-left transition-colors ${
        selected ? "border-accent bg-accent/5" : "border-border bg-bg hover:border-subtle"
      }`}
    >
      <span className="flex items-center gap-2 text-sm font-medium">
        {title}
        {badge && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted">{badge}</span>}
      </span>
      <span className="text-[13px] text-muted">{text}</span>
    </button>
  );
}

/** The two ways to connect a cluster. `onAdded` gets the name of an added kubeconfig. */
export function AddCluster({
  gkeAvailable,
  onAdded,
  title = "Add a Cluster",
}: {
  gkeAvailable: boolean;
  onAdded: (kubeconfig?: string) => void;
  title?: string;
}) {
  const [method, setMethod] = useState<"kubeconfig" | "gcp" | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-medium">{title}</h2>
      <div role="radiogroup" aria-label="How to connect" className="grid gap-3 sm:grid-cols-2">
        <Choice
          selected={method === "kubeconfig"}
          onSelect={() => setMethod("kubeconfig")}
          title="Kubeconfig"
          text="Any cluster: GKE, EKS, AKS, minikube, kind or your own. One command gives KubeiQ read-only access"
        />
        <Choice
          selected={method === "gcp"}
          onSelect={() => setMethod("gcp")}
          title="Google Cloud"
          text="Your GKE clusters, found with this server's Google identity. No key to add or store"
          badge={gkeAvailable ? "Available here" : undefined}
        />
      </div>
      {method === "kubeconfig" && <ConnectPanel onConnected={onAdded} onClose={() => setMethod(null)} />}
      {method === "gcp" && <GkePanel />}
    </div>
  );
}
