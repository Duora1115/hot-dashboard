import { Link } from 'react-router-dom';
import { isCandidate } from '@/lib/chain';
import type { GraphNode } from '@/lib/chain';

interface Props {
  node: GraphNode;
  nodes: GraphNode[];
  onSelect: (id: string) => void;
  onClose?: () => void;
}

const TIER_STYLE: Record<string, string> = {
  直接铲子: 'bg-brand-blue/15 text-brand-blue',
  间接铲子: 'bg-brand-purple/15 text-brand-purple',
  铲子的铲子: 'bg-brand-yellow/15 text-brand-yellow',
};

export default function DetailPanel({ node, nodes, onSelect, onClose }: Props) {
  const neighbors = nodes
    .filter((n) => n.segment === node.segment && n.id !== node.id)
    .sort((a, b) => b.peakSc - a.peakSc);

  return (
    <div className="text-[13px]">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[15px] font-semibold text-ink-primary">{node.name}</div>
          <div className="font-mono text-[11.5px] text-ink-tertiary">{node.code}</div>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-ink-tertiary hover:text-ink-secondary text-[16px] leading-none px-1">
            ✕
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5 mt-3">
        <span
          className="px-2 py-[2px] rounded-[6px] text-[11px] font-semibold"
          style={{ backgroundColor: `${node.color}22`, color: node.color }}
        >
          {node.segmentName}
        </span>
        {node.ecosystems.map((eco) => (
          <span key={eco} className="px-2 py-[2px] rounded-[6px] text-[11px] font-semibold bg-brand-purple/15 text-brand-purple">
            {eco}
          </span>
        ))}
        <span className={`px-2 py-[2px] rounded-[6px] text-[11px] font-semibold ${TIER_STYLE[node.tier] ?? 'bg-bg-tertiary text-ink-secondary'}`}>
          {node.tier}
        </span>
      </div>

      <div className="mt-3">
        <Row label="今日峰值热度" value={node.peakSc > 0 ? String(node.peakSc) : '未上榜'} />
        <Row label="累计提及" value={String(node.mentions)} />
        <Row label="看多 / 看空" value={`${node.bull} / ${node.bear}`} />
        <Row label="今日上榜" value={node.listed ? '是' : '否'} />
      </div>

      <p className="mt-3 text-[12px] leading-relaxed text-ink-secondary">{node.role}</p>

      <Link
        to={`/stock/${node.code}`}
        className="block text-center mt-4 py-2 rounded-[8px] bg-brand-blue text-white text-[12.5px] font-semibold"
      >
        → 个股详情
      </Link>

      {neighbors.length > 0 && (
        <>
          <div className="mt-4 mb-1 text-[10.5px] tracking-[0.09em] uppercase text-ink-quaternary">
            同环节
          </div>
          {neighbors.map((n) => (
            <button
              key={n.id}
              onClick={() => onSelect(n.id)}
              className="w-full flex items-center gap-2 py-[5px] text-left hover:bg-hover/[0.04] rounded-[6px] px-1"
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: n.color }} />
              <span className="flex-1 text-ink-primary">{n.name}</span>
              <span className={`font-mono text-[11.5px] ${n.listed ? 'text-ink-tertiary' : 'text-brand-yellow'}`}>
                {n.listed ? n.peakSc : isCandidate(n, [node, ...neighbors]) ? '补涨候选' : '未上榜'}
              </span>
            </button>
          ))}
        </>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-[6px] border-b border-dashed border-border-subtle">
      <span className="text-ink-tertiary">{label}</span>
      <span className="text-ink-primary">{value}</span>
    </div>
  );
}
