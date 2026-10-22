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
 * Modified by the KubeiQ Authors: adapted from Headlamp's resourceMap/edges/GraphEdgeComponent.tsx.
 * Falls back to a polyline when ELK does not return a two-point bezier; no edge labels.
 */
"use client";

import { BaseEdge, type Edge, type EdgeProps } from "@xyflow/react";
import { memo } from "react";

import type { FlowEdgeData } from "@/lib/map/layout";

export const KubeEdge = memo(function KubeEdge({ id, data, markerEnd }: EdgeProps<Edge<FlowEdgeData>>) {
  const section = data?.sections[0];
  if (!section) return null;
  const { x: dx, y: dy } = data.offset;
  const p = (pt: { x: number; y: number }) => `${pt.x + dx},${pt.y + dy}`;
  const bends = section.bendPoints ?? [];
  const path =
    bends.length === 2
      ? `M ${p(section.startPoint)} C ${p(bends[0])} ${p(bends[1])} ${p(section.endPoint)}`
      : `M ${[section.startPoint, ...bends, section.endPoint].map(p).join(" L ")}`;
  return <BaseEdge id={id} path={path} markerEnd={markerEnd} style={{ stroke: "var(--text-subtle)", strokeWidth: 1.25 }} />;
});
