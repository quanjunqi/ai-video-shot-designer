// EXPORTS: default CanvasFlow
// 独立无限画布（React Flow，懒加载）
import { useCallback } from 'react';
import { ReactFlow, Background, Controls, MiniMap, addEdge, useNodesState, useEdgesState } from '@xyflow/react';
import type { Connection, Edge, Node, NodeTypes } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCanvasStore } from '@/stores/useCanvasStore';
import { useShallow } from 'zustand/react/shallow';

const seedNodes: Node[] = [
  { id: 'n-import', type: 'canvas_source', position: { x: 40, y: 60 }, data: { label: '导入项目资产', note: '星海拾遗 · 角色 3 项' } },
  { id: 'n-prompt', type: 'canvas_prompt', position: { x: 320, y: 60 }, data: { label: '组合提示词', note: '沈墨 + 雾夜钟楼' } },
  { id: 'n-gen', type: 'canvas_task', position: { x: 320, y: 240 }, data: { label: '生成候选', note: 'SDXL · 2 张' } },
  { id: 'n-result', type: 'canvas_result', position: { x: 600, y: 240 }, data: { label: '结果集', note: '候选 AWAITING_USER' } },
];

const seedEdges: Edge[] = [
  { id: 'e1', source: 'n-import', target: 'n-prompt', animated: true },
  { id: 'e2', source: 'n-prompt', target: 'n-gen', animated: true },
  { id: 'e3', source: 'n-gen', target: 'n-result', animated: true },
];

const NODE_STYLES: Record<string, string> = {
  canvas_source: 'border-primary/50 bg-primary/5',
  canvas_prompt: 'border-sky-500/50 bg-sky-500/5',
  canvas_task: 'border-amber-500/50 bg-amber-500/5',
  canvas_result: 'border-success/50 bg-success/5',
};

function makeNode(type: string) {
  return function TypedNode(props: { data: { label: string; note?: string } }) {
    return (
      <div className={`w-44 rounded-xl border bg-card p-3 shadow-sm ${NODE_STYLES[type] ?? ''}`}>
        <div className="text-xs font-medium">{props.data.label}</div>
        {props.data.note && <div className="mt-1 text-[10px] text-muted-foreground">{props.data.note}</div>}
      </div>
    );
  };
}

const nodeTypes: NodeTypes = {
  canvas_source: makeNode('canvas_source'),
  canvas_prompt: makeNode('canvas_prompt'),
  canvas_task: makeNode('canvas_task'),
  canvas_result: makeNode('canvas_result'),
};

export default function CanvasFlow() {
  const saved = useCanvasStore(useShallow((s) => ({ nodes: s.nodes, edges: s.edges })));
  const [nodes, , onNodesChange] = useNodesState<Node>(saved.nodes.length ? saved.nodes : seedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(saved.edges.length ? saved.edges : seedEdges);

  const onConnect = useCallback((params: Connection) => setEdges((eds) => addEdge(params, eds)), [setEdges]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      fitView
      proOptions={{ hideAttribution: true }}
      className="h-full w-full"
    >
      <Background gap={16} size={1} />
      <Controls />
      <MiniMap pannable zoomable className="!bg-muted" />
    </ReactFlow>
  );
}
