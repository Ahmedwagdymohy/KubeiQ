"use client";

import "@xyflow/react/dist/base.css";

import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
} from "@xyflow/react";
import { useEffect, useRef, useState } from "react";

import { KubeEdge } from "@/components/map/kube-edge";
import { KubeNode } from "@/components/map/kube-node";
import { useMapSelection } from "@/components/map/map-context";
import type { GraphNode } from "@/lib/map/graph";
import { layoutGraph, type FlowEdgeData, type FlowNodeData } from "@/lib/map/layout";

const nodeTypes = { kube: KubeNode };
const edgeTypes = { kube: KubeEdge };

function Canvas({ graph, layoutKey }: { graph: GraphNode; layoutKey: string }) {
  const { select } = useMapSelection();
  const box = useRef<HTMLDivElement>(null);
  const [flow, setFlow] = useState<{
    nodes: Node<FlowNodeData>[];
    edges: Edge<FlowEdgeData>[];
    version: number;
  }>({ nodes: [], edges: [], version: 0 });

  // Re-run the (expensive) ELK layout only when the graph's shape or statuses change.
  useEffect(() => {
    let cancelled = false;
    const rect = box.current?.getBoundingClientRect();
    const ratio = rect && rect.height > 0 ? rect.width / rect.height : 1.6;
    layoutGraph(graph, ratio).then((result) => {
      if (cancelled) return;
      setFlow((current) => ({ ...result, version: current.version + 1 }));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- layoutKey captures graph changes
  }, [layoutKey]);

  return (
    <div ref={box} className="kube-map h-full w-full">
      {/* Remounting on each new layout lets React Flow fit the view after measuring nodes. */}
      <ReactFlow
        key={flow.version}
        fitView
        fitViewOptions={{ padding: 0.12, maxZoom: 1.1 }}
        nodes={flow.nodes}
        edges={flow.edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        nodesFocusable={false}
        edgesFocusable={false}
        deleteKeyCode={null}
        selectionKeyCode={null}
        multiSelectionKeyCode={null}
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        onPaneClick={() => select(null)}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1.5} color="var(--border)" />
        <Controls showInteractive={false} position="bottom-left" />
      </ReactFlow>
    </div>
  );
}

export function MapCanvas(props: { graph: GraphNode; layoutKey: string }) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}
