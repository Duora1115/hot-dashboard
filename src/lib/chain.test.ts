import { describe, expect, it } from 'vitest';
import {
  aggregateHeat,
  buildLinks,
  buildNodes,
  buildPalette,
  buildSupplyArcs,
  candidateCodes,
  isCandidate,
  nodeRadius,
} from './chain';
import type { ChainData, ChainSegment } from './chain';
import type { Snapshot } from '@/types/api';

const SEGMENTS: ChainSegment[] = [
  { id: '光模块', name: '光模块', tier: '直接铲子', upstream: ['光芯片'], downstream: ['交换机'] },
  { id: '光芯片', name: '光芯片', tier: '间接铲子', upstream: [], downstream: ['光模块'] },
  { id: '交换机', name: '交换机', tier: '直接铲子', upstream: ['光模块'], downstream: [] },
];

const DATA: ChainData = {
  meta: { source: 'test', updated: '2026-09-09' },
  segments: SEGMENTS,
  stocks: [
    { code: '300308', name: '中际旭创', segment: '光模块', ecosystems: ['英伟达链'], role: 'r1' },
    { code: '300502', name: '新易盛', segment: '光模块', ecosystems: ['英伟达链'], role: 'r2' },
    { code: '002281', name: '光迅科技', segment: '光模块', ecosystems: [], role: 'r3' },
    { code: '688313', name: '仕佳光子', segment: '光芯片', ecosystems: ['英伟达链'], role: 'r4' },
  ],
};

function snap(t: string, stks: Array<{ c: string; sc: number; mc: number; bu: number; be: number }>): Snapshot {
  return {
    t,
    msg: 10,
    grp: 2,
    sent: '偏多',
    sd: { bu: 1, be: 0, ne: 0, eh: 0, el: 0 },
    act: {},
    stk: stks.map((s) => ({ ...s, n: s.c, gc: 1, ac: 0, ft: t, lt: t, sec: [] })),
    sec: [],
  };
}

describe('buildPalette', () => {
  it('按 segments 顺序确定性分配颜色', () => {
    const a = buildPalette(SEGMENTS);
    const b = buildPalette(SEGMENTS);
    expect(a).toEqual(b);
    expect(a['光模块']).toBeTruthy();
    expect(a['光模块']).not.toBe(a['光芯片']);
  });

  it('在末尾追加环节不改变已有环节的颜色', () => {
    const before = buildPalette(SEGMENTS);
    const after = buildPalette([
      ...SEGMENTS,
      { id: '液冷', name: '液冷', tier: '直接铲子', upstream: [], downstream: [] },
    ]);
    expect(after['光模块']).toBe(before['光模块']);
    expect(after['光芯片']).toBe(before['光芯片']);
  });
});

describe('aggregateHeat', () => {
  it('空快照返回空对象', () => {
    expect(aggregateHeat([])).toEqual({});
  });

  it('取当日峰值 sc、标记上榜、累计值取最后一次出现的快照', () => {
    const heat = aggregateHeat([
      snap('2026-09-09 09:35', [{ c: '300308', sc: 40, mc: 3, bu: 1, be: 0 }]),
      snap('2026-09-09 10:35', [
        { c: '300308', sc: 92, mc: 9, bu: 4, be: 1 },
        { c: '300502', sc: 30, mc: 2, bu: 0, be: 1 },
      ]),
    ]);
    expect(heat['300308']).toEqual({ peakSc: 92, listed: true, mentions: 9, bull: 4, bear: 1 });
    expect(heat['300502']).toEqual({ peakSc: 30, listed: true, mentions: 2, bull: 0, bear: 1 });
    expect(heat['002281']).toBeUndefined();
  });
});

describe('buildLinks', () => {
  it('同业边为同环节两两相连，阵营边只连跨环节，且不重复', () => {
    const links = buildLinks(DATA);
    const peer = links.filter((l) => l.kind === 'peer');
    const eco = links.filter((l) => l.kind === 'ecosystem');
    expect(peer).toHaveLength(3); // 光模块 3 只 → C(3,2)
    expect(eco).toHaveLength(2); // 英伟达链: 旭创×仕佳、新易盛×仕佳
    const keys = links.map((l) => `${l.kind}:${l.source}|${l.target}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(eco.every((l) => !(l.source === '300308' && l.target === '300502'))).toBe(true);
  });
});

describe('buildSupplyArcs', () => {
  it('合并 upstream/downstream 两个方向并去重', () => {
    const arcs = buildSupplyArcs(SEGMENTS);
    const keys = arcs.map((a) => `${a.from}->${a.to}`).sort();
    expect(keys).toEqual(['光模块->交换机', '光芯片->光模块']);
  });
});

describe('candidateCodes', () => {
  it('只返回选中票的同环节未上榜票', () => {
    const nodes = buildNodes(DATA, {
      '300308': { peakSc: 92, listed: true, mentions: 9, bull: 4, bear: 1 },
      '300502': { peakSc: 30, listed: true, mentions: 2, bull: 0, bear: 1 },
    });
    const cands = candidateCodes(nodes, '300308');
    expect([...cands]).toEqual(['002281']);
    expect(candidateCodes(nodes, null).size).toBe(0);
    expect(candidateCodes(nodes, '不存在的代码').size).toBe(0);
  });

  it('锚点未上榜时无补涨候选', () => {
    const nodes = buildNodes(DATA, {
      '300308': { peakSc: 92, listed: true, mentions: 9, bull: 4, bear: 1 },
    });
    // 002281 未上榜；选中它不应把同环节的未上榜票标成候选
    expect(candidateCodes(nodes, '002281').size).toBe(0);
  });
});

describe('isCandidate', () => {
  it('未上榜、且同环节里有已上榜的票 → 补涨候选', () => {
    expect(isCandidate({ listed: false }, [{ listed: true }, { listed: false }])).toBe(true);
  });

  it('自己已上榜就不是候选', () => {
    expect(isCandidate({ listed: true }, [{ listed: true }])).toBe(false);
  });

  it('同环节没有已上榜的票，就没有「补」的对象', () => {
    expect(isCandidate({ listed: false }, [{ listed: false }])).toBe(false);
  });

  it('调用点语义：peers 要传「含锚点的同环节全集」，锚点唯一上榜时也算候选', () => {
    // 光模块里只有锚点 300308 上榜，300502 / 002281 都未上榜
    const nodes = buildNodes(DATA, {
      '300308': { peakSc: 92, listed: true, mentions: 9, bull: 4, bear: 1 },
    });
    const anchor = nodes.find((n) => n.id === '300308');
    expect(anchor).toBeDefined();
    if (!anchor) return;

    // DetailPanel 里 neighbors 的定义：同环节、去掉锚点
    const segment = nodes.filter((n) => n.segment === anchor.segment);
    const neighbors = segment.filter((n) => n.id !== anchor.id);
    const cands = candidateCodes(nodes, anchor.id);
    expect(cands.size).toBeGreaterThan(0); // 保证该用例不是空转

    for (const n of neighbors) {
      // 含锚点的全集 → 与 ChainList / candidateCodes 口径一致
      expect(isCandidate(n, segment)).toBe(cands.has(n.id));
      expect(isCandidate(n, [anchor, ...neighbors])).toBe(true);
      // 只传 neighbors（漏掉锚点）会漏判「锚点唯一上榜」的情形
      expect(isCandidate(n, neighbors)).toBe(false);
    }
  });
});

describe('nodeRadius', () => {
  it('随热度单调递增，未上榜仍可见', () => {
    expect(nodeRadius(0)).toBeGreaterThan(0);
    expect(nodeRadius(50)).toBeGreaterThan(nodeRadius(10));
    expect(nodeRadius(92)).toBeGreaterThan(nodeRadius(50));
  });
});
