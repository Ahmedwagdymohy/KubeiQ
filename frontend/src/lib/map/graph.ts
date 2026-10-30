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
 * Modified by the KubeiQ Authors: merged Headlamp's resourceMap/graph/graphModel.tsx,
 * graphLookup.ts and graphGrouping.tsx. Nodes carry KubeiQ map data (kind, status, reason)
 * instead of KubeObjects; namespace/node grouping, plugin hooks and performance metrics were
 * removed; a problems-only and search filter works on whole connected components, and the
 * overview sorts groups health first.
 */

import type { MapEdge, MapNode, MapStatus } from "@/lib/api";

export type GraphNode = {
  id: string;
  /** Set on leaf nodes: the resource this node shows. */
  resource?: MapNode;
  label?: string;
  subtitle?: string;
  /** Group nodes contain child nodes and the edges between them. */
  nodes?: GraphNode[];
  edges?: GraphEdge[];
  collapsed?: boolean;
};

export type GraphEdge = {
  id: string;
  source: string;
  target: string;
  /** Endpoint that may be shared without merging groups (a ReadWriteMany PVC). */
  shared?: "source" | "target" | null;
};

/** Higher weight = more important: picks a group's main node and its layout layer. */
const WEIGHTS: Record<string, number> = {
  HorizontalPodAutoscaler: 1000,
  Deployment: 980,
  StatefulSet: 960,
  DaemonSet: 960,
  CronJob: 960,
  ReplicaSet: 960,
  Job: 920,
  Pod: 800,
  Service: 790,
  PersistentVolumeClaim: 790,
  ConfigMap: 790,
  Secret: 790,
  Ingress: 780,
};

export function nodeWeight(node: GraphNode): number {
  return WEIGHTS[node.resource?.kind ?? ""] ?? 500;
}

export function forEachNode(graph: GraphNode, cb: (node: GraphNode) => void) {
  cb(graph);
  graph.nodes?.forEach((n) => forEachNode(n, cb));
}

const RANK: Record<MapStatus, number> = { healthy: 0, warning: 1, error: 2 };

/** A leaf's status, or the worst status inside a group. */
export function statusOf(node: GraphNode): MapStatus {
  if (node.resource) return node.resource.status;
  let worst: MapStatus = "healthy";
  node.nodes?.forEach((child) => {
    const status = statusOf(child);
    if (RANK[status] > RANK[worst]) worst = status;
  });
  return worst;
}

export function leafCount(node: GraphNode): number {
  let count = 0;
  forEachNode(node, (n) => {
    if (n.resource) count++;
  });
  return count;
}

function makeGraphLookup(nodes: GraphNode[], edges: GraphEdge[]) {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const outgoing = new Map<string, GraphEdge[]>();
  const incoming = new Map<string, GraphEdge[]>();
  edges.forEach((edge) => {
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge]);
    incoming.set(edge.target, [...(incoming.get(edge.target) ?? []), edge]);
  });
  return {
    getOutgoingEdges: (id: string) => outgoing.get(id),
    getIncomingEdges: (id: string) => incoming.get(id),
    getNode: (id: string) => nodeMap.get(id),
  };
}

type Lookup = ReturnType<typeof makeGraphLookup>;

/** Breadth-first search collecting every node and edge connected to `start`. */
function findConnectedComponent(
  lookup: Lookup,
  start: GraphNode,
  visitedNodes: Set<string>,
  visitedEdges: Set<string>,
  componentNodes: GraphNode[],
  componentEdges: GraphEdge[],
) {
  const queue = [start];
  let index = 0;
  visitedNodes.add(start.id);
  componentNodes.push(start);

  const visit = (edge: GraphEdge, otherId: string) => {
    if (!visitedEdges.has(edge.id)) {
      visitedEdges.add(edge.id);
      componentEdges.push(edge);
    }
    if (!visitedNodes.has(otherId)) {
      const other = lookup.getNode(otherId);
      if (other) {
        visitedNodes.add(otherId);
        componentNodes.push(other);
        queue.push(other);
      }
    }
  };

  while (index < queue.length) {
    const node = queue[index++];
    lookup.getOutgoingEdges(node.id)?.forEach((edge) => visit(edge, edge.target));
    lookup.getIncomingEdges(node.id)?.forEach((edge) => visit(edge, edge.source));
  }
}

function getConnectedComponentGroups(nodes: GraphNode[], lookup: Lookup): GraphNode[] {
  const components: GraphNode[] = [];
  const visitedNodes = new Set<string>();
  const visitedEdges = new Set<string>();
  nodes.forEach((node) => {
    if (visitedNodes.has(node.id)) return;
    const componentNodes: GraphNode[] = [];
    const componentEdges: GraphEdge[] = [];
    findConnectedComponent(lookup, node, visitedNodes, visitedEdges, componentNodes, componentEdges);
    const main = getMainNode(componentNodes);
    components.push({
      id: "group-" + (main?.id ?? "unknown"),
      nodes: componentNodes,
      edges: componentEdges,
    });
  });
  return components;
}

/**
 * Nodes that must not merge otherwise separate components: every edge touching them names them
 * as the shared side, and they touch more than one neighbour (Headlamp #4310).
 */
function findSharedNodeIds(nodes: GraphNode[], lookup: Lookup): Set<string> {
  const shared = new Set<string>();
  nodes.forEach((node) => {
    const incoming = lookup.getIncomingEdges(node.id) ?? [];
    const outgoing = lookup.getOutgoingEdges(node.id) ?? [];
    const all = [...incoming, ...outgoing];
    const isShareable = (edge: GraphEdge) =>
      (edge.target === node.id && edge.shared === "target") ||
      (edge.source === node.id && edge.shared === "source");
    if (all.length === 0 || !all.every(isShareable)) return;
    const neighbours = new Set([...outgoing.map((e) => e.target), ...incoming.map((e) => e.source)]);
    if (neighbours.size > 1) shared.add(node.id);
  });
  return shared;
}

/** Components computed without shared nodes, which are then cloned into each component they touch. */
function getComponentsWithSharedNodesCloned(
  nodes: GraphNode[],
  edges: GraphEdge[],
  sharedIds: Set<string>,
): GraphNode[] {
  const baseNodes = nodes.filter((n) => !sharedIds.has(n.id));
  const baseEdges = edges.filter((e) => !sharedIds.has(e.source) && !sharedIds.has(e.target));
  const components = getConnectedComponentGroups(baseNodes, makeGraphLookup(baseNodes, baseEdges));

  const componentOf = new Map<string, GraphNode>();
  components.forEach((c) => c.nodes?.forEach((n) => componentOf.set(n.id, c)));

  sharedIds.forEach((sharedId) => {
    const shared = nodes.find((n) => n.id === sharedId);
    if (!shared) return;
    const byComponent = new Map<GraphNode, GraphEdge[]>();
    edges
      .filter((e) => e.source === sharedId || e.target === sharedId)
      .forEach((edge) => {
        const other = edge.source === sharedId ? edge.target : edge.source;
        const component = componentOf.get(other);
        if (component) byComponent.set(component, [...(byComponent.get(component) ?? []), edge]);
      });

    if (byComponent.size === 1) {
      const [[component, componentEdges]] = byComponent;
      component.nodes = [...(component.nodes ?? []), shared];
      component.edges = [...(component.edges ?? []), ...componentEdges];
      return;
    }
    byComponent.forEach((componentEdges, component) => {
      const cloneId = `${sharedId}--${component.id}`;
      component.nodes = [...(component.nodes ?? []), { ...shared, id: cloneId }];
      component.edges = [
        ...(component.edges ?? []),
        ...componentEdges.map((edge) => ({
          ...edge,
          id: `${edge.id}--${cloneId}`,
          source: edge.source === sharedId ? cloneId : edge.source,
          target: edge.target === sharedId ? cloneId : edge.target,
        })),
      ];
    });
  });
  return components;
}

function getConnectedComponents(nodes: GraphNode[], edges: GraphEdge[]): GraphNode[] {
  const lookup = makeGraphLookup(nodes, edges);
  const sharedIds = findSharedNodeIds(nodes, lookup);
  const components =
    sharedIds.size > 0
      ? getComponentsWithSharedNodesCloned(nodes, edges, sharedIds)
      : getConnectedComponentGroups(nodes, lookup);
  return components.map((c) => (c.nodes?.length === 1 ? c.nodes[0] : c));
}

/** The highest-weight node of a group, e.g. the Deployment of an app. */
export function getMainNode(nodes: GraphNode[]): GraphNode | undefined {
  let main: GraphNode | undefined;
  nodes.forEach((node) => {
    if (!main || nodeWeight(node) > nodeWeight(main)) main = node;
  });
  return main;
}

export type MapFilter = { problemsOnly: boolean; query: string };

function componentMatches(component: GraphNode, { problemsOnly, query }: MapFilter): boolean {
  const q = query.trim().toLowerCase();
  let problem = !problemsOnly;
  let found = !q;
  forEachNode(component, (n) => {
    if (!n.resource) return;
    if (n.resource.status !== "healthy") problem = true;
    if (q && `${n.resource.kind} ${n.resource.name}`.toLowerCase().includes(q)) found = true;
  });
  return problem && found;
}

/** Build the root graph: connected components as groups, sorted by importance. */
export function groupGraph(mapNodes: MapNode[], mapEdges: MapEdge[], filter: MapFilter): GraphNode {
  const nodes: GraphNode[] = mapNodes.map((resource) => ({ id: resource.id, resource }));
  const edges: GraphEdge[] = mapEdges.map((e) => ({ ...e }));
  const components = getConnectedComponents(nodes, edges).filter((c) => componentMatches(c, filter));

  const root: GraphNode = { id: "root", label: "root", nodes: components, edges: [] };

  // Groups with connections first, then bigger groups, then by kind weight.
  const sortWeight = (n: GraphNode) => {
    let weight = nodeWeight(n.nodes ? (getMainNode(n.nodes) ?? n) : n);
    if (n.nodes && n.edges) {
      if (n.edges.length > 0) weight += 10000;
      weight += n.nodes.length * 10;
    }
    return weight;
  };
  forEachNode(root, (node) => node.nodes?.sort((a, b) => sortWeight(b) - sortWeight(a)));
  // The overview puts problems first: failing apps, then degraded, then healthy (stable within).
  root.nodes?.sort((a, b) => RANK[statusOf(b)] - RANK[statusOf(a)]);
  return root;
}

/** The group that directly contains `id`, or the group itself when `id` is a group. */
export function findGroupContaining(graph: GraphNode, id: string): GraphNode | undefined {
  if (graph.id === id) return graph;
  if (graph.nodes?.some((n) => n.id === id && !n.nodes)) return graph;
  for (const child of graph.nodes ?? []) {
    const found = child.nodes ? findGroupContaining(child, id) : undefined;
    if (found) return found;
  }
  return undefined;
}

/**
 * Collapse big groups to a stacked preview, except the selected one. When a group is selected,
 * only that group is shown (Headlamp's focus behaviour).
 */
export function collapseGraph(
  graph: GraphNode,
  { selectedId, expandAll }: { selectedId: string | null; expandAll: boolean },
): GraphNode {
  const selectedGroup = selectedId ? findGroupContaining(graph, selectedId) : undefined;

  const collapse = (group: GraphNode): GraphNode => {
    const big = (group.nodes?.length ?? 0) > 10 || (group.edges?.length ?? 0) > 0;
    const collapsed =
      !expandAll && group.id !== "root" && selectedGroup?.id !== group.id && big;
    return { ...group, nodes: group.nodes?.map(collapse), collapsed };
  };

  const root = { ...graph };
  if (selectedGroup && selectedGroup.id !== "root") root.nodes = [selectedGroup];
  return collapse(root);
}
