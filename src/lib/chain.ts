// AI 产业链图谱的派生逻辑：把静态关系数据 + 当日快照，算成画布要的节点/边/弧线。
// 全是纯函数，便于单测；组件只负责画。
import type { Snapshot } from '@/types/api';

export type Tier = '直接铲子' | '间接铲子' | '铲子的铲子';

export const TIERS: Tier[] = ['直接铲子', '间接铲子', '铲子的铲子'];

export interface ChainSegment {
  id: string;
  name: string;
  tier: Tier;
  upstream: string[];
  downstream: string[];
}

export interface ChainStock {
  code: string;
  name: string;
  segment: string;
  ecosystems: string[];
  tier?: Tier;
  role: string;
}

export interface ChainData {
  meta: { source: string; updated: string };
  segments: ChainSegment[];
  stocks: ChainStock[];
}

export interface StockHeat {
  peakSc: number;
  listed: boolean;
  mentions: number;
  bull: number;
  bear: number;
}

export interface GraphNode {
  id: string;
  name: string;
  code: string;
  segment: string;
  segmentName: string;
  color: string;
  tier: Tier;
  ecosystems: string[];
  role: string;
  peakSc: number;
  listed: boolean;
  mentions: number;
  bull: number;
  bear: number;
  val: number;
}

export type LinkKind = 'peer' | 'ecosystem';

export interface GraphLink {
  source: string;
  target: string;
  kind: LinkKind;
}

export interface SupplyArc {
  from: string;
  to: string;
}

// 确定性调色板：按 segments 数组下标取色，末尾追加环节不影响已有颜色。
export const PALETTE = [
  '#30D158', '#0A84FF', '#FF9F0A', '#FF375F', '#BF5AF2',
  '#64D2FF', '#FFD60A', '#5E5CE6', '#FF6961', '#63E6E2',
  '#AC8E68', '#DA8FFF', '#66D4CF', '#FFB340', '#FF6482',
  '#8E8E93', '#40C8E0', '#FFD426', '#A0C862', '#C77DFF',
];

export function buildPalette(segments: ChainSegment[]): Record<string, string> {
  const out: Record<string, string> = {};
  segments.forEach((seg, i) => {
    out[seg.id] = PALETTE[i % PALETTE.length];
  });
  return out;
}

export function aggregateHeat(snapshots: Snapshot[]): Record<string, StockHeat> {
  const out: Record<string, StockHeat> = {};
  for (const snap of snapshots) {
    for (const stk of snap?.stk ?? []) {
      const cur = out[stk.c];
      if (!cur) {
        out[stk.c] = {
          peakSc: stk.sc,
          listed: true,
          mentions: stk.mc,
          bull: stk.bu,
          bear: stk.be,
        };
        continue;
      }
      cur.peakSc = Math.max(cur.peakSc, stk.sc);
      // 快照是累计语义：最后一次出现的那条就是当日累计值
      cur.mentions = stk.mc;
      cur.bull = stk.bu;
      cur.bear = stk.be;
    }
  }
  return out;
}

export function nodeRadius(peakSc: number): number {
  if (peakSc <= 0) return 3;
  return 3 + Math.sqrt(peakSc) * 2;
}

export function buildNodes(data: ChainData, heat: Record<string, StockHeat>): GraphNode[] {
  const palette = buildPalette(data.segments);
  const segById = new Map(data.segments.map((s) => [s.id, s]));
  return data.stocks.map((stk) => {
    const seg = segById.get(stk.segment);
    const h = heat[stk.code];
    const peakSc = h?.peakSc ?? 0;
    return {
      id: stk.code,
      name: stk.name,
      code: stk.code,
      segment: stk.segment,
      segmentName: seg?.name ?? stk.segment,
      color: palette[stk.segment] ?? '#8E8E93',
      tier: stk.tier ?? seg?.tier ?? '直接铲子',
      ecosystems: stk.ecosystems,
      role: stk.role,
      peakSc,
      listed: h?.listed ?? false,
      mentions: h?.mentions ?? 0,
      bull: h?.bull ?? 0,
      bear: h?.bear ?? 0,
      val: nodeRadius(peakSc),
    };
  });
}

export function buildLinks(data: ChainData): GraphLink[] {
  const links: GraphLink[] = [];
  const seen = new Set<string>();
  const push = (a: string, b: string, kind: LinkKind) => {
    const key = a < b ? `${kind}:${a}|${b}` : `${kind}:${b}|${a}`;
    if (seen.has(key)) return;
    seen.add(key);
    links.push({ source: a, target: b, kind });
  };

  const bySegment = new Map<string, ChainStock[]>();
  for (const stk of data.stocks) {
    const arr = bySegment.get(stk.segment) ?? [];
    arr.push(stk);
    bySegment.set(stk.segment, arr);
  }
  for (const arr of bySegment.values()) {
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) push(arr[i].code, arr[j].code, 'peer');
    }
  }

  const byEco = new Map<string, ChainStock[]>();
  for (const stk of data.stocks) {
    for (const eco of stk.ecosystems) {
      const arr = byEco.get(eco) ?? [];
      arr.push(stk);
      byEco.set(eco, arr);
    }
  }
  for (const arr of byEco.values()) {
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        if (arr[i].segment === arr[j].segment) continue; // 同环节已有同业边
        push(arr[i].code, arr[j].code, 'ecosystem');
      }
    }
  }
  return links;
}

export function buildSupplyArcs(segments: ChainSegment[]): SupplyArc[] {
  const seen = new Set<string>();
  const arcs: SupplyArc[] = [];
  const add = (from: string, to: string) => {
    const key = `${from}->${to}`;
    if (seen.has(key)) return;
    seen.add(key);
    arcs.push({ from, to });
  };
  for (const seg of segments) {
    for (const up of seg.upstream) add(up, seg.id);
    for (const down of seg.downstream) add(seg.id, down);
  }
  return arcs;
}

export function candidateCodes(nodes: GraphNode[], selectedId: string | null): Set<string> {
  const out = new Set<string>();
  if (!selectedId) return out;
  const sel = nodes.find((n) => n.id === selectedId);
  if (!sel) return out;
  // spec §5：只有选中「今日热票」才谈补涨候选
  if (!sel.listed) return out;
  for (const n of nodes) {
    if (n.segment === sel.segment && !n.listed) out.add(n.id);
  }
  return out;
}

/**
 * 补涨候选 = 自己没上榜，但同环节里有人上榜。
 * 移动端列表（ChainList）有这个徽章，右侧详情面板（DetailPanel）没有，
 * 而页面帮助文案写的是「同环节里未上榜的票会被标成 补涨候选」，两处口径要一致。
 */
export function isCandidate(
  node: { listed: boolean },
  peers: Array<{ listed: boolean }>,
): boolean {
  return !node.listed && peers.some((p) => p.listed);
}
