import ForceGraph2D from 'react-force-graph-2d';

const DEMO_GRAPH = {
  nodes: [
    { id: '300308', name: '中际旭创' },
    { id: '688256', name: '寒武纪' },
    { id: '601138', name: '工业富联' },
  ],
  links: [
    { source: '300308', target: '601138' },
    { source: '688256', target: '601138' },
  ],
};

export default function Chain() {
  return (
    <div className="h-[70vh] rounded-[14px] border border-border-subtle bg-bg-secondary overflow-hidden">
      <ForceGraph2D
        graphData={DEMO_GRAPH}
        backgroundColor="#141416"
        nodeColor="#0A84FF"
        nodeLabel="name"
        linkColor={() => '#3A3A42'}
      />
    </div>
  );
}
