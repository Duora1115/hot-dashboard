import { useEffect, useMemo, useState } from 'react';
import rawChainData from '@/data/ai_chain.json';
import { useStore } from '@/store/useStore';
import {
  aggregateHeat,
  buildLinks,
  buildNodes,
  buildSupplyArcs,
  candidateCodes,
  type ChainData,
} from '@/lib/chain';
import GraphCanvas from '@/components/chain/GraphCanvas';

// JSON 里 tier 是 string，运行时形状由 tests/test_chain_data.py 保证
const CHAIN_DATA = rawChainData as unknown as ChainData;

export default function Chain() {
  const snapshots = useStore((s) => s.currentDayData?.snapshots ?? []);
  const dayFullLoaded = useStore((s) => s.dayFullLoaded);
  const loadDayFull = useStore((s) => s.loadDayFull);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showPeer, setShowPeer] = useState(true);
  const [showSupply, setShowSupply] = useState(false);
  const [showEcosystem, setShowEcosystem] = useState(false);

  useEffect(() => {
    if (!dayFullLoaded) loadDayFull();
  }, [dayFullLoaded, loadDayFull]);

  const heat = useMemo(() => aggregateHeat(snapshots), [snapshots]);
  const nodes = useMemo(() => buildNodes(CHAIN_DATA, heat), [heat]);
  const links = useMemo(() => buildLinks(CHAIN_DATA), []);
  const arcs = useMemo(() => buildSupplyArcs(CHAIN_DATA.segments), []);
  const candidates = useMemo(() => candidateCodes(nodes, selectedId), [nodes, selectedId]);

  return (
    <div className="flex flex-col h-[calc(100dvh-140px)] gap-3">
      <div className="flex items-center gap-2 flex-wrap text-[13px]">
        <Toggle label="同业" on={showPeer} onClick={() => setShowPeer((v) => !v)} />
        <Toggle label="上下游" on={showSupply} onClick={() => setShowSupply((v) => !v)} />
        <Toggle label="阵营" on={showEcosystem} onClick={() => setShowEcosystem((v) => !v)} />
        <span className="text-ink-tertiary ml-2">
          节点大小 = 当日峰值热度 · 描边 = 今日上榜 · 虚线 = 未上榜
        </span>
      </div>

      <div className="flex-1 min-h-0 rounded-[14px] border border-border-subtle bg-bg-secondary overflow-hidden">
        <GraphCanvas
          nodes={nodes}
          links={links}
          arcs={arcs}
          showPeer={showPeer}
          showSupply={showSupply}
          showEcosystem={showEcosystem}
          selectedId={selectedId}
          candidateIds={candidates}
          onSelect={setSelectedId}
        />
      </div>
    </div>
  );
}

function Toggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 h-[30px] rounded-[8px] border text-[12.5px] transition-colors ${
        on
          ? 'border-brand-blue/55 bg-brand-blue/15 text-brand-blue'
          : 'border-border-subtle bg-bg-tertiary text-ink-secondary'
      }`}
    >
      {label}
    </button>
  );
}
