import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import type { GraphLink, GraphNode, SupplyArc } from '@/lib/chain';

// react-force-graph 会在运行时往节点上挂 x/y/vx/vy，类型里没有，这里补齐。
type SimNode = GraphNode & { x?: number; y?: number };

// d3 跑完布局后 link.source/target 是节点对象，之前是字符串，两种都取到 id。
function linkId(end: unknown): string {
  return typeof end === 'string' ? end : (end as GraphNode).id;
}

interface Props {
  nodes: GraphNode[];
  links: GraphLink[];
  arcs: SupplyArc[];
  showPeer: boolean;
  showSupply: boolean;
  showEcosystem: boolean;
  selectedId: string | null;
  candidateIds: Set<string>;
  onSelect: (id: string | null) => void;
}

export default function GraphCanvas({
  nodes,
  links,
  arcs,
  showPeer,
  showSupply,
  showEcosystem,
  selectedId,
  candidateIds,
  onSelect,
}: Props) {
  // 组件不重挂载，只让 d3 重新跑布局
  const fgRef = useRef<{ zoomToFit: (ms?: number, px?: number) => void } | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });

  // 画布必须给宽高，跟随容器尺寸
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const visibleLinks = useMemo(
    () =>
      links.filter((l) =>
        l.kind === 'peer' ? showPeer : showEcosystem,
      ),
    [links, showPeer, showEcosystem],
  );

  // d3 会把 link 的 source/target 从字符串改写成节点对象，且是原地改写；
  // 传副本出去，免得父组件的 links 被改脏（上层还要按字符串过滤）。
  const graphData = useMemo(
    () => ({ nodes, links: visibleLinks.map((l) => ({ ...l })) }),
    [nodes, visibleLinks],
  );

  useEffect(() => {
    fgRef.current?.zoomToFit(400, 60);
  }, [nodes.length]);

  const paintNode = useCallback(
    (rawNode: unknown, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const node = rawNode as SimNode;
      const r = node.val;
      const isSelected = node.id === selectedId;
      const isCandidate = candidateIds.has(node.id);
      const dimmed = selectedId !== null && !isSelected && !isCandidate && !node.listed;

      ctx.beginPath();
      ctx.arc(node.x ?? 0, node.y ?? 0, r, 0, Math.PI * 2);
      ctx.fillStyle = node.color;
      ctx.globalAlpha = node.listed ? (dimmed ? 0.3 : 0.92) : dimmed ? 0.18 : 0.3;
      ctx.fill();
      ctx.globalAlpha = 1;

      if (!node.listed) {
        ctx.setLineDash([2, 2]);
        ctx.strokeStyle = node.color;
        ctx.lineWidth = 1 / globalScale;
        ctx.stroke();
        ctx.setLineDash([]);
      }

      if (isCandidate) {
        ctx.beginPath();
        ctx.arc(node.x ?? 0, node.y ?? 0, r + 3, 0, Math.PI * 2);
        ctx.strokeStyle = '#FFD60A';
        ctx.lineWidth = 2 / globalScale;
        ctx.stroke();
      } else if (isSelected) {
        ctx.beginPath();
        ctx.arc(node.x ?? 0, node.y ?? 0, r + 3, 0, Math.PI * 2);
        ctx.strokeStyle = '#0A84FF';
        ctx.lineWidth = 2.5 / globalScale;
        ctx.stroke();
      } else if (node.listed) {
        ctx.beginPath();
        ctx.arc(node.x ?? 0, node.y ?? 0, r + 1.5, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 1.2 / globalScale;
        ctx.stroke();
      }

      // 标签只给够热或够相关的票，避免上百节点糊成一片
      const showLabel = isSelected || isCandidate || node.peakSc >= 60;
      if (showLabel && globalScale > 0.5) {
        const label = node.name;
        ctx.font = `${isSelected ? 600 : 400} ${11 / globalScale}px Inter, "PingFang SC", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = isSelected ? '#F4F4F7' : 'rgba(165,165,172,0.9)';
        ctx.fillText(label, node.x ?? 0, (node.y ?? 0) + r + 2);
      }
    },
    [candidateIds, selectedId],
  );

  const paintPointerArea = useCallback((rawNode: unknown, color: string, ctx: CanvasRenderingContext2D) => {
    const node = rawNode as SimNode;
    ctx.beginPath();
    ctx.arc(node.x ?? 0, node.y ?? 0, node.val + 2, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }, []);

  return (
    <div ref={wrapRef} className="w-full h-full">
      <ForceGraph2D
        ref={fgRef as never}
        width={size.width}
        height={size.height}
        graphData={graphData}
        backgroundColor="#0A0A0D"
        nodeCanvasObject={paintNode}
        nodePointerAreaPaint={paintPointerArea}
        linkColor={(l) => {
          const link = l as unknown as GraphLink;
          const touchesSel =
            selectedId !== null &&
            (linkId(link.source) === selectedId || linkId(link.target) === selectedId);
          if (link.kind === 'peer') return touchesSel ? 'rgba(48,209,88,0.85)' : 'rgba(58,58,66,0.9)';
          return touchesSel ? 'rgba(191,90,242,0.9)' : 'rgba(191,90,242,0.35)';
        }}
        linkWidth={(l) => {
          const link = l as unknown as GraphLink;
          return link.kind === 'peer' ? 1 : 1.2;
        }}
        linkCurvature={(l) => ((l as unknown as GraphLink).kind === 'ecosystem' ? 0.25 : 0)}
        onNodeClick={(n) => onSelect((n as unknown as GraphNode).id)}
        onBackgroundClick={() => onSelect(null)}
        onRenderFramePost={(ctx, globalScale) => {
          if (!showSupply) return;
          // 每帧按当前布局算环节簇心：d3 原地改 x/y，useMemo 抓不到
          const acc = new Map<string, { x: number; y: number; n: number }>();
          for (const node of nodes as SimNode[]) {
            if (typeof node.x !== 'number' || typeof node.y !== 'number') continue;
            const cur = acc.get(node.segment) ?? { x: 0, y: 0, n: 0 };
            cur.x += node.x;
            cur.y += node.y;
            cur.n += 1;
            acc.set(node.segment, cur);
          }
          const centers = new Map<string, { x: number; y: number }>();
          for (const [id, v] of acc) {
            if (v.n > 0) centers.set(id, { x: v.x / v.n, y: v.y / v.n });
          }
          ctx.save();
          ctx.strokeStyle = 'rgba(74,74,82,0.75)';
          ctx.lineWidth = 1.2 / globalScale;
          ctx.setLineDash([7 / globalScale, 6 / globalScale]);
          for (const arc of arcs) {
            const a = centers.get(arc.from);
            const b = centers.get(arc.to);
            if (!a || !b) continue;
            const mx = (a.x + b.x) / 2;
            const my = (a.y + b.y) / 2;
            const nx = -(b.y - a.y);
            const ny = b.x - a.x;
            const len = Math.hypot(nx, ny) || 1;
            const k = Math.min(60, len * 0.22);
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.quadraticCurveTo(mx + (nx / len) * k, my + (ny / len) * k, b.x, b.y);
            ctx.stroke();
          }
          ctx.restore();
        }}
      />
    </div>
  );
}
