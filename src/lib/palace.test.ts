import { describe, expect, it } from 'vitest';
import {
  biasText, filterKols, filterStocks, isStale, sortKols, sortStocks, splitGroupName,
} from './palace';
import type { PalaceKol, PalaceStockSummary } from '@/types/api';

function kol(name: string, over: Partial<PalaceKol> = {}): PalaceKol {
  return {
    chat_id: name,
    name,
    msg_count: 100,
    opinion_count: 50,
    active_days: 10,
    stock_count: 5,
    first_ts: '2026-06-05 09:00',
    last_ts: '2026-09-10 15:00',
    style: {
      bias: { bull: 8, bear: 2, ratio: 0.8, label: '偏多' },
      trading: ['趋势中长线'],
      breadth: { distinct_stocks: 5, concentration: 0.4 },
      top_sectors: [['半导体', 10]],
      session: { intraday: 0.6, after_hours: 0.4 },
      ai_summary: null,
    },
    ...over,
  };
}

describe('splitGroupName', () => {
  it('拆出群号与群名', () => {
    expect(splitGroupName('253_橙子不糊涂')).toEqual({ no: '253', label: '橙子不糊涂' });
  });

  it('没有下划线时整串当群名', () => {
    expect(splitGroupName('橙子不糊涂')).toEqual({ no: '', label: '橙子不糊涂' });
  });
});

describe('isStale', () => {
  it('超过 30 天无消息算断更', () => {
    expect(isStale(kol('a', { last_ts: '2026-06-01 09:00' }), '2026-09-10 15:00')).toBe(true);
  });

  it('30 天内不算断更', () => {
    expect(isStale(kol('a', { last_ts: '2026-09-01 09:00' }), '2026-09-10 15:00')).toBe(false);
  });

  it('没有 last_ts 视为断更', () => {
    expect(isStale(kol('a', { last_ts: '' }), '2026-09-10 15:00')).toBe(true);
  });
});

describe('sortKols', () => {
  it('断更的沉底，无论排序键是什么', () => {
    const stale = kol('stale', { last_ts: '2026-06-01 09:00', opinion_count: 9999 });
    const fresh = kol('fresh', { opinion_count: 1 });

    expect(sortKols([stale, fresh], 'opinion', '2026-09-10 15:00').map((k) => k.name))
      .toEqual(['fresh', 'stale']);
  });

  it('按观点数降序', () => {
    const a = kol('a', { opinion_count: 10 });
    const b = kol('b', { opinion_count: 30 });

    expect(sortKols([a, b], 'opinion', '2026-09-10 15:00').map((k) => k.name)).toEqual(['b', 'a']);
  });

  it('按活跃天数降序', () => {
    const a = kol('a', { active_days: 40 });
    const b = kol('b', { active_days: 5 });

    expect(sortKols([a, b], 'active', '2026-09-10 15:00').map((k) => k.name)).toEqual(['a', 'b']);
  });

  it('不改动入参数组', () => {
    const input = [kol('a', { opinion_count: 1 }), kol('b', { opinion_count: 9 })];
    sortKols(input, 'opinion', '2026-09-10 15:00');

    expect(input.map((k) => k.name)).toEqual(['a', 'b']);
  });
});

describe('filterKols', () => {
  it('空查询返回全部', () => {
    expect(filterKols([kol('253_橙子不糊涂')], '   ')).toHaveLength(1);
  });

  it('按群号匹配', () => {
    const list = [kol('253_橙子不糊涂'), kol('006_帝凌枫')];

    expect(filterKols(list, '253').map((k) => k.name)).toEqual(['253_橙子不糊涂']);
  });

  it('按群名匹配，大小写不敏感', () => {
    const list = [kol('001_Alpha'), kol('006_帝凌枫')];

    expect(filterKols(list, 'alpha').map((k) => k.name)).toEqual(['001_Alpha']);
  });

  it('无匹配返回空数组', () => {
    expect(filterKols([kol('253_橙子不糊涂')], '京东方')).toEqual([]);
  });
});

function stock(code: string, over: Partial<PalaceStockSummary> = {}): PalaceStockSummary {
  return {
    code,
    name: `名称${code}`,
    group_count: 3,
    total_mentions: 10,
    bull: 6,
    bear: 4,
    last_ts: '2026-09-10 15:00',
    ...over,
  };
}

describe('sortStocks', () => {
  it('按提及数降序', () => {
    const a = stock('301308', { total_mentions: 5 });
    const b = stock('300308', { total_mentions: 40 });

    expect(sortStocks([a, b], 'mentions').map((s) => s.code)).toEqual(['300308', '301308']);
  });

  it('按群数降序', () => {
    const a = stock('301308', { group_count: 9 });
    const b = stock('300308', { group_count: 2 });

    expect(sortStocks([a, b], 'groups').map((s) => s.code)).toEqual(['301308', '300308']);
  });

  it('按最近时间降序', () => {
    const a = stock('301308', { last_ts: '2026-07-01 08:09' });
    const b = stock('300308', { last_ts: '2026-09-10 15:00' });

    expect(sortStocks([a, b], 'recent').map((s) => s.code)).toEqual(['300308', '301308']);
  });

  it('同分按代码，且不改动入参', () => {
    const input = [stock('600658'), stock('000001')];
    sortStocks(input, 'mentions');

    expect(input.map((s) => s.code)).toEqual(['600658', '000001']);
  });
});

describe('filterStocks', () => {
  it('空查询返回全部', () => {
    expect(filterStocks([stock('301308')], '  ')).toHaveLength(1);
  });

  it('按代码匹配', () => {
    const list = [stock('301308', { name: '江波龙' }), stock('300308', { name: '中际旭创' })];

    expect(filterStocks(list, '3013').map((s) => s.code)).toEqual(['301308']);
  });

  it('按名称匹配', () => {
    const list = [stock('301308', { name: '江波龙' }), stock('300308', { name: '中际旭创' })];

    expect(filterStocks(list, '中际').map((s) => s.code)).toEqual(['300308']);
  });

  it('无匹配返回空数组', () => {
    expect(filterStocks([stock('301308')], '京东方')).toEqual([]);
  });
});

describe('biasText', () => {
  it('多空都为零时给 分歧', () => {
    expect(biasText(0, 0)).toBe('分歧');
  });

  it('偏多与偏空', () => {
    expect(biasText(8, 2)).toBe('偏多');
    expect(biasText(1, 4)).toBe('偏空');
  });

  it('接近时给 分歧', () => {
    expect(biasText(5, 5)).toBe('分歧');
  });
});
