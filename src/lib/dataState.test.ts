import { describe, expect, it } from 'vitest';
import type { DateInfo, Snapshot } from '@/types/api';
import { hasContent, pickDefaultDate } from './dataState';

const emptySnap = {
  t: '2026-09-12 00:25', msg: 0, grp: 0, sent: '',
  sd: { bu: 0, be: 0, ne: 0, eh: 0, el: 0 }, act: {}, stk: [], sec: [],
} as unknown as Snapshot;

describe('hasContent', () => {
  it('全空的快照判定为无内容 —— 判据是「有没有数据」，不是「对象在不在」', () => {
    expect(hasContent(emptySnap)).toBe(false);
  });

  it('有消息就算有内容', () => {
    expect(hasContent({ ...emptySnap, msg: 12 } as Snapshot)).toBe(true);
  });

  it('只有股票没有消息也算有内容', () => {
    expect(hasContent({ ...emptySnap, stk: [{ c: '300308' }] } as unknown as Snapshot)).toBe(true);
  });

  it('null / undefined 为 false', () => {
    expect(hasContent(null)).toBe(false);
    expect(hasContent(undefined)).toBe(false);
  });
});

const dates: DateInfo[] = [
  { date: '2026-09-12', size_kb: 270, message_count: 0 },
  { date: '2026-09-11', size_kb: 36717, message_count: 985 },
  { date: '2026-09-10', size_kb: 28679, message_count: 1187 },
];

describe('pickDefaultDate', () => {
  it('跳过没有消息的今天', () => {
    expect(pickDefaultDate(dates, 2)).toEqual(['2026-09-11', '2026-09-10']);
  });

  it('全都没有数据时退回原来的顺序', () => {
    const allEmpty = dates.map((d) => ({ ...d, message_count: 0 }));
    expect(pickDefaultDate(allEmpty, 2)).toEqual(['2026-09-12', '2026-09-11']);
  });

  it('不足 count 个就返回全部', () => {
    expect(pickDefaultDate([{ date: '2026-09-11', size_kb: 1, message_count: 5 }], 2))
      .toEqual(['2026-09-11']);
  });
});
