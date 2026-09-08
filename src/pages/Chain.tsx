import { useEffect, useMemo, useState } from 'react';
import rawChainData from '@/data/ai_chain.json';
import { useStore } from '@/store/useStore';
import {
  aggregateHeat,
  buildLinks,
  buildNodes,
  buildPalette,
  buildSupplyArcs,
  candidateCodes,
  TIERS,
  type ChainData,
  type Tier,
} from '@/lib/chain';
import GraphCanvas from '@/components/chain/GraphCanvas';
import DetailPanel from '@/components/chain/DetailPanel';
import ChainList from '@/components/chain/ChainList';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { useIsMobile } from '@/hooks/use-mobile';

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

  const isMobile = useIsMobile();
  const [mobileView, setMobileView] = useState<'graph' | 'list'>('graph');

  useEffect(() => {
    if (!dayFullLoaded) loadDayFull();
  }, [dayFullLoaded, loadDayFull]);

  const heat = useMemo(() => aggregateHeat(snapshots), [snapshots]);
  const nodes = useMemo(() => buildNodes(CHAIN_DATA, heat), [heat]);
  const links = useMemo(() => buildLinks(CHAIN_DATA), []);
  const arcs = useMemo(() => buildSupplyArcs(CHAIN_DATA.segments), []);
  const candidates = useMemo(() => candidateCodes(nodes, selectedId), [nodes, selectedId]);

  const [segmentFilter, setSegmentFilter] = useState<Set<string>>(new Set());
  const [ecoFilter, setEcoFilter] = useState<Set<string>>(new Set());
  const [tierFilter, setTierFilter] = useState<Set<Tier>>(new Set());
  const [query, setQuery] = useState('');
  const [highlightCandidates, setHighlightCandidates] = useState(true);

  const allEcosystems = useMemo(
    () => Array.from(new Set(CHAIN_DATA.stocks.flatMap((s) => s.ecosystems))).sort(),
    [],
  );

  // 与 buildNodes 用同一套确定性调色板，窄屏色点条的颜色和画布一致
  const segmentPalette = useMemo(() => buildPalette(CHAIN_DATA.segments), []);

  const visibleNodes = useMemo(() => {
    const q = query.trim();
    return nodes.filter((n) => {
      if (segmentFilter.size > 0 && !segmentFilter.has(n.segment)) return false;
      if (tierFilter.size > 0 && !tierFilter.has(n.tier)) return false;
      if (ecoFilter.size > 0 && !n.ecosystems.some((e) => ecoFilter.has(e))) return false;
      if (q && !n.name.includes(q) && !n.code.includes(q)) return false;
      return true;
    });
  }, [nodes, segmentFilter, tierFilter, ecoFilter, query]);

  const visibleIds = useMemo(() => new Set(visibleNodes.map((n) => n.id)), [visibleNodes]);
  const visibleLinks = useMemo(
    () => links.filter((l) => visibleIds.has(l.source) && visibleIds.has(l.target)),
    [links, visibleIds],
  );
  const selected = useMemo(() => nodes.find((n) => n.id === selectedId) ?? null, [nodes, selectedId]);

  return (
    <div className="flex flex-col lg:flex-row gap-3 h-[calc(100dvh-140px)]">
      <div className="flex-1 min-h-0 flex flex-col gap-3">
        <div className="flex items-center gap-2 flex-wrap text-[13px]">
          <Filter label="环节" options={CHAIN_DATA.segments.map((s) => s.id)} selected={segmentFilter} onChange={setSegmentFilter} />
          <Filter label="阵营" options={allEcosystems} selected={ecoFilter} onChange={setEcoFilter} />
          <Filter label="层级" options={TIERS as unknown as string[]} selected={tierFilter as unknown as Set<string>} onChange={(next) => setTierFilter(next as Set<Tier>)} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="名称或代码"
            className="h-[30px] px-3 rounded-[8px] border border-border-subtle bg-bg-secondary text-[12.5px] text-ink-primary outline-none focus:border-border-focus w-[150px]"
          />
          <Toggle label="同业" on={showPeer} onClick={() => setShowPeer((v) => !v)} />
          <Toggle label="上下游" on={showSupply} onClick={() => setShowSupply((v) => !v)} />
          <Toggle label="阵营" on={showEcosystem} onClick={() => setShowEcosystem((v) => !v)} />
          <Toggle
            label="高亮同链未上榜"
            on={highlightCandidates}
            onClick={() => setHighlightCandidates((v) => !v)}
          />
        </div>

        <div className="flex-1 min-h-0 relative flex flex-col rounded-[14px] border border-border-subtle bg-bg-secondary overflow-hidden">
          {isMobile && (
            <div className="flex gap-1 p-2 border-b border-border-subtle shrink-0">
              <SegBtn label="图谱" active={mobileView === 'graph'} onClick={() => setMobileView('graph')} />
              <SegBtn label="列表" active={mobileView === 'list'} onClick={() => setMobileView('list')} />
            </div>
          )}

          <div className="flex-1 min-h-0 relative">
            {mobileView === 'graph' || !isMobile ? (
              <GraphCanvas
                nodes={visibleNodes}
                links={visibleLinks}
                arcs={arcs}
                showPeer={showPeer}
                showSupply={showSupply}
                showEcosystem={showEcosystem}
                selectedId={selectedId}
                candidateIds={highlightCandidates ? candidates : EMPTY_SET}
                onSelect={setSelectedId}
              />
            ) : (
              <ChainList
                nodes={visibleNodes}
                selectedId={selectedId}
                candidateIds={highlightCandidates ? candidates : EMPTY_SET}
                onSelect={setSelectedId}
              />
            )}

            <div className="hidden lg:flex flex-col gap-[5px] absolute left-3 bottom-3 z-10 pointer-events-none rounded-[10px] border border-border-subtle bg-bg-tertiary/85 backdrop-blur-sm px-2.5 py-2 text-[12.5px] text-ink-secondary">
              <span className="flex items-center gap-2">
                <svg width="20" height="8" viewBox="0 0 20 8" className="shrink-0" aria-hidden="true">
                  <defs>
                    <linearGradient id="chain-peer-grad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#30D158" />
                      <stop offset="100%" stopColor="rgba(58,58,66,0.9)" />
                    </linearGradient>
                  </defs>
                  <line x1="1" y1="4" x2="19" y2="4" stroke="url(#chain-peer-grad)" strokeWidth="1.6" />
                </svg>
                同业 · 实线（选中变绿）
              </span>
              <span className="flex items-center gap-2">
                <svg width="20" height="8" viewBox="0 0 20 8" className="shrink-0" aria-hidden="true">
                  <path d="M1 6 Q 10 1 19 6" fill="none" stroke="rgba(74,74,82,0.75)" strokeWidth="1.2" strokeDasharray="3.5 3" />
                </svg>
                上下游 · 虚线弧
              </span>
              <span className="flex items-center gap-2">
                <svg width="20" height="8" viewBox="0 0 20 8" className="shrink-0" aria-hidden="true">
                  <path d="M1 6 Q 10 1 19 6" fill="none" stroke="#BF5AF2" strokeWidth="1.5" />
                </svg>
                阵营 · 紫色曲线
              </span>
              <span className="flex items-center gap-2">
                <svg width="20" height="8" viewBox="0 0 20 8" className="shrink-0" aria-hidden="true">
                  <circle cx="6" cy="4" r="2" fill="#8E8E93" />
                  <circle cx="14" cy="4" r="3.5" fill="#8E8E93" />
                </svg>
                节点大小 = 当日峰值热度
              </span>
            </div>

            {(mobileView === 'graph' || !isMobile) && (
              <div className="lg:hidden absolute inset-x-0 bottom-0 z-10 flex items-center gap-2.5 overflow-x-auto pointer-events-auto border-t border-border-subtle bg-bg-tertiary/85 backdrop-blur-sm px-2.5 py-1.5">
                {CHAIN_DATA.segments.map((seg) => (
                  <span
                    key={seg.id}
                    className="shrink-0 flex items-center gap-1.5 text-[11.5px] text-ink-secondary"
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: segmentPalette[seg.id] }}
                    />
                    {seg.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <aside className="hidden lg:block w-[280px] shrink-0 rounded-[14px] border border-border-subtle bg-bg-secondary p-4 overflow-y-auto">
        {selected ? (
          <DetailPanel node={selected} nodes={nodes} onSelect={setSelectedId} />
        ) : (
          <p className="text-[12.5px] text-ink-tertiary leading-relaxed">
            点一个节点看它的环节、阵营与今日热度。
            <br />
            <br />
            选中今日热票后，同环节里未上榜的票会被标成
            <span className="text-brand-yellow"> 补涨候选</span>。
          </p>
        )}
      </aside>

      {isMobile && (
        <Drawer open={!!selected} onOpenChange={(open) => !open && setSelectedId(null)}>
          <DrawerContent className="bg-bg-secondary border-border-subtle max-h-[75vh]">
            <div className="p-4 overflow-y-auto">
              {selected && (
                <DetailPanel
                  node={selected}
                  nodes={nodes}
                  onSelect={setSelectedId}
                  onClose={() => setSelectedId(null)}
                />
              )}
            </div>
          </DrawerContent>
        </Drawer>
      )}
    </div>
  );
}

function SegBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 h-[30px] rounded-[8px] text-[12.5px] font-medium ${
        active ? 'bg-hover/[0.08] text-ink-primary' : 'text-ink-tertiary'
      }`}
    >
      {label}
    </button>
  );
}

const EMPTY_SET = new Set<string>();

function Filter({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`px-3 h-[30px] rounded-[8px] border text-[12.5px] ${
          selected.size > 0
            ? 'border-brand-blue/55 bg-brand-blue/15 text-brand-blue'
            : 'border-border-subtle bg-bg-tertiary text-ink-secondary'
        }`}
      >
        {label}
        {selected.size > 0 ? ` · ${selected.size}` : ''} ▾
      </button>
      {open && (
        <div className="absolute z-20 mt-1 min-w-[160px] max-h-[280px] overflow-y-auto rounded-[10px] border border-border-subtle bg-bg-tertiary shadow-elevated p-1">
          {options.map((opt) => {
            const on = selected.has(opt);
            return (
              <button
                key={opt}
                onClick={() => {
                  const next = new Set(selected);
                  if (on) next.delete(opt);
                  else next.add(opt);
                  onChange(next);
                }}
                className="w-full text-left px-2 py-[6px] rounded-[6px] text-[12.5px] hover:bg-hover/[0.06] flex items-center gap-2"
              >
                <span className={`w-3 h-3 rounded-[3px] border ${on ? 'bg-brand-blue border-brand-blue' : 'border-border-default'}`} />
                <span className={on ? 'text-ink-primary' : 'text-ink-secondary'}>{opt}</span>
              </button>
            );
          })}
        </div>
      )}
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
