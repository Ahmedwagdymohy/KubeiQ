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
 * Modified by the KubeiQ Authors: adapted from Headlamp's resourceMap/graph/graphLayout.tsx.
 * Uses the bundled elkjs build (no worker URL), keeps graph data outside the ELK graph, and
 * drops the layout cache and performance metrics.
 */

import { MarkerType, type Edge, type Node } from "@xyflow/react";
import ELK, { type ElkExtendedEdge, type ElkNode } from "elkjs/lib/elk.bundled.js";

import { forEachNode, nodeWeight, type GraphNode } from "@/lib/map/graph";

export const NODE_WIDTH = 220;
export const NODE_HEIGHT = 70;

const elk = new ELK();

export type EdgeSection = NonNullable<ElkExtendedEdge["sections"]>[number];
export type FlowNodeData = { node: GraphNode };
export type FlowEdgeData = { sections: EdgeSection[]; offset: { x: number; y: number } };

function toElk(node: GraphNode): ElkNode {
  const base: ElkNode = { id: node.id, width: NODE_WIDTH, height: NODE_HEIGHT };

  if (!node.nodes) {
    // Lower partition = further left: Deployments left, Pods middle, configs right.
    return { ...base, layoutOptions: { "partitioning.partition": String(-nodeWeight(node)) } };
  }
  if (node.collapsed) return base;

  const ids = new Set<string>();
  forEachNode(node, (n) => ids.add(n.id));
  const edges: ElkExtendedEdge[] = (node.edges ?? [])
    .filter((e) => ids.has(e.source) && ids.has(e.target))
    .map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] }));

  return {
    ...base,
    layoutOptions:
      edges.length > 0
        ? {
            "partitioning.activate": "true",
            "elk.direction": "UNDEFINED",
            "elk.edgeRouting": "SPLINES",
            "elk.nodeSize.minimum": `(${NODE_WIDTH}.0,${NODE_HEIGHT}.0)`,
            "elk.nodeSize.constraints": "[MINIMUM_SIZE]",
            "elk.algorithm": "layered",
            "elk.spacing.nodeNode": "60",
            "elk.layered.spacing.nodeNodeBetweenLayers": "60",
            // Top padding leaves room for the group's label.
            "elk.padding": "[left=16, top=48, right=16, bottom=16]",
          }
        : {
            "elk.algorithm": "rectpacking",
            "elk.rectpacking.widthApproximation.optimizationGoal": "ASPECT_RATIO_DRIVEN",
            "elk.rectpacking.packing.compaction.rowHeightReevaluation": "true",
            "elk.spacing.nodeNode": "20",
            "elk.padding": "[left=24, top=48, right=24, bottom=24]",
          },
    edges,
    children: node.nodes.map(toElk),
  };
}

/** Lay out the graph with ELK and convert it to React Flow nodes and edges. */
export async function layoutGraph(
  graph: GraphNode,
  aspectRatio: number,
): Promise<{ nodes: Node<FlowNodeData>[]; edges: Edge<FlowEdgeData>[] }> {
  const byId = new Map<string, GraphNode>();
  forEachNode(graph, (n) => byId.set(n.id, n));

  const laid = await elk.layout(toElk(graph), {
    layoutOptions: { "elk.aspectRatio": String(aspectRatio) },
  });

  const nodes: Node<FlowNodeData>[] = [];
  const edges: Edge<FlowEdgeData>[] = [];

  const pushEdges = (node: ElkNode, offset: { x: number; y: number }) => {
    node.edges?.forEach((edge) => {
      edges.push({
        id: edge.id,
        source: edge.sources[0],
        target: edge.targets[0],
        type: "kube",
        markerEnd: { type: MarkerType.ArrowClosed, color: "var(--text-subtle)", width: 16, height: 16 },
        selectable: false,
        focusable: false,
        data: { sections: edge.sections ?? [], offset },
      });
    });
  };

  const visit = (node: ElkNode, parent?: ElkNode, parentOffset = { x: 0, y: 0 }) => {
    const graphNode = byId.get(node.id);
    if (!graphNode) return;
    nodes.push({
      id: node.id,
      type: "kube",
      position: { x: node.x ?? 0, y: node.y ?? 0 },
      width: node.width,
      height: node.height,
      style: { width: node.width, height: node.height },
      parentId: parent?.id,
      draggable: false,
      selectable: true,
      data: { node: graphNode },
    });
    const offset = { x: parentOffset.x + (node.x ?? 0), y: parentOffset.y + (node.y ?? 0) };
    pushEdges(node, offset);
    node.children?.forEach((child) => visit(child, node, offset));
  };

  pushEdges(laid, { x: 0, y: 0 });
  laid.children?.forEach((child) => visit(child));
  return { nodes, edges };
}
