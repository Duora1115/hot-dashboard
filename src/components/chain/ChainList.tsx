import { useMemo, useState } from 'react';
import type { GraphNode } from '@/lib/chain';

interface Props {
  nodes: GraphNode[];
  selectedId: string | null;
  candidateIds: Set<string>;
  onSelect: (id: string) => void;
}

export default function ChainList({ nodes, selectedId, candidateIds, onSelect }: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const groups = useMemo(() => {
    const map = new Map<string, { name: string; color: string; items: GraphNode[] }>();
    for (const n of nodes) {
      const g = map.get(n.segment) ?? { name: n.segmentName, color: n.color, items: [] };
      g.items.push(n);
      map.set(n.segment, g);
    }
    for (const g of map.values()) g.items.sort((a, b) => b.peakSc - a.peakSc);
    return Array.from(map.entries());
  }, [nodes]);

  return (
    <div className="h-full overflow-y-auto">
      {groups.map(([segId, g]) => {
        const isCollapsed = collapsed.has(segId);
        return (
          <div key={segId}>
            <button
              onClick={() => {
                const next = new Set(collapsed);
                if (isCollapsed) next.delete(segId);
                else next.add(segId);
                setCollapsed(next);
              }}
              className="w-full flex items-center gap-2 px-4 py-[9px] bg-bg-tertiary border-t border-border-subtle text-left"
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: g.color }} />
              <span className="text-[12.5px] font-semibold text-ink-primary">{g.name}</span>
              <span className="text-[11px] text-ink-quaternary">{g.items.length}</span>
              <span className="ml-auto text-[9px] text-ink-quaternary">{isCollapsed ? '▸' : '▾'}</span>
            </button>

            {!isCollapsed &&
              g.items.map((n) => {
                const isSel = n.id === selectedId;
                const isCand = candidateIds.has(n.id);
                return (
                  <button
                    key={n.id}
                    onClick={() => onSelect(n.id)}
                    className="w-full flex items-center gap-2 px-4 py-2 pl-[13px] border-l-[3px] text-left"
                    style={{
                      borderLeftColor: isSel ? '#0A84FF' : isCand ? '#FFD60A' : 'transparent',
                      backgroundColor: isSel
                        ? 'rgba(10,132,255,0.07)'
                        : isCand
                          ? 'rgba(255,214,10,0.06)'
                          : undefined,
                    }}
                  >
                    <span className="flex-1 min-w-0">
                      <span className={`block text-[12.5px] truncate ${n.listed ? 'text-ink-primary' : 'text-ink-tertiary'}`}>
                        {n.name}
                      </span>
                      <span className="block font-mono text-[10.5px] text-ink-quaternary">{n.code}</span>
                    </span>
                    {isCand && (
                      <span className="shrink-0 text-[9px] font-bold text-brand-yellow bg-brand-yellow/15 border border-brand-yellow/35 rounded-[5px] px-[5px] py-[1px]">
                        补涨候选
                      </span>
                    )}
                    {n.listed ? (
                      <>
                        <span className="shrink-0 w-[52px] h-[4px] rounded-[3px] bg-bg-tertiary overflow-hidden">
                          <span
                            className="block h-full rounded-[3px]"
                            style={{ width: `${Math.min(100, n.peakSc)}%`, backgroundColor: g.color }}
                          />
                        </span>
                        <span className="shrink-0 w-[26px] text-right font-mono text-[11.5px] text-ink-secondary">
                          {n.peakSc}
                        </span>
                      </>
                    ) : (
                      <span className="shrink-0 text-[10.5px] text-ink-quaternary">未上榜</span>
                    )}
                  </button>
                );
              })}
          </div>
        );
      })}
    </div>
  );
}
