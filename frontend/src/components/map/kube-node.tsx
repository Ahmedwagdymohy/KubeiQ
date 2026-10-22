/*
 * Copyright 2025 The Kubernetes Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Modified by the KubeiQ Authors: adapted from Headlamp's resourceMap/nodes/KubeObjectNode.tsx
 * and GroupNode.tsx. Rewritten with Tailwind and KubeiQ tokens; status comes from KubeiQ's
 * detectors; no hover glance or activity drawer.
 */
"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { memo } from "react";

import { KubeIcon, kindLabel } from "@/components/map/kube-icon";
import { useMapSelection } from "@/components/map/map-context";
import type { MapStatus } from "@/lib/api";
import { getMainNode, leafCount, statusOf } from "@/lib/map/graph";
import type { FlowNodeData } from "@/lib/map/layout";

const TONE: Record<MapStatus, string> = {
  healthy: "text-accent",
  warning: "text-warning",
  error: "text-danger",
};

const hidden = { opacity: 0, pointerEvents: "none" as const };

function Badge({ status, count }: { status: MapStatus; count?: number }) {
  if (status === "healthy") return null;
  return (
    <span
      className={`absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-bg px-1 text-[11px] font-bold leading-none text-white ${
        status === "error" ? "bg-danger" : "bg-warning"
      }`}
    >
      {count ?? "!"}
    </span>
  );
}

export const KubeNode = memo(function KubeNode({ id, data }: NodeProps<Node<FlowNodeData>>) {
  const { selectedId, select } = useMapSelection();
  const node = data.node;
  const selected = selectedId === id;

  // Expanded group: a frame around its children, labelled with its main resource.
  if (node.nodes && !node.collapsed) {
    const main = getMainNode(node.nodes)?.resource;
    if (node.id === "root") return null;
    return (
      <div className="h-full w-full rounded-xl border border-border bg-surface/50">
        <button
          type="button"
          onClick={() => select(id)}
          className="flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-muted hover:text-fg"
        >
          {main && <KubeIcon kind={main.kind} size={18} className={TONE[statusOf(node)]} />}
          {main?.name}
        </button>
      </div>
    );
  }

  const main = node.resource ?? getMainNode(node.nodes ?? [])?.resource;
  const status = statusOf(node);
  const size = node.nodes ? leafCount(node) : 1;
  let problems = 0;
  node.nodes?.forEach(function count(n) {
    if (n.resource && n.resource.status !== "healthy") problems++;
    n.nodes?.forEach(count);
  });

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => select(id)}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && select(id)}
      className="group relative h-full w-full cursor-pointer outline-none"
    >
      {/* Stacked cards behind a collapsed group, as in Headlamp. */}
      {size > 2 && <span className="absolute inset-0 translate-x-[9px] translate-y-[9px] rounded-[10px] border border-border bg-bg" />}
      {size > 1 && <span className="absolute inset-0 translate-x-[5px] translate-y-[5px] rounded-[10px] border border-border bg-bg" />}
      <div
        className={`relative flex h-full w-full items-center gap-3 rounded-[10px] border bg-bg px-3 transition-colors ${
          selected
            ? "border-accent"
            : status === "error"
              ? "border-danger/50 group-hover:border-danger"
              : "border-border group-hover:border-fg/30"
        }`}
      >
        <Handle type="target" position={Position.Left} style={hidden} isConnectable={false} />
        {main && <KubeIcon kind={main.kind} size={34} className={TONE[main.status]} />}
        <span className="flex min-w-0 flex-col">
          <span className="line-clamp-2 break-all text-sm font-medium leading-tight text-fg" title={main?.name}>
            {main?.name}
          </span>
          <span className="truncate text-xs text-subtle">
            {main ? kindLabel(main.kind) : ""}
            {size > 1 ? ` and ${size - 1} more` : ""}
          </span>
        </span>
        <Handle type="source" position={Position.Right} style={hidden} isConnectable={false} />
      </div>
      <Badge status={status} count={node.nodes && problems > 0 ? problems : undefined} />
    </div>
  );
});
