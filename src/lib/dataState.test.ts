import { describe, expect, it } from 'vitest';
import type { DateInfo, Snapshot } from '@/types/api';
import { hasContent, isSameDay, pickDefaultDate } from './dataState';

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

describe('isSameDay', () => {
  it('时间戳属于同一天', () => {
    expect(isSameDay('2026-07-09 01:30', '2026-07-09')).toBe(true);
    expect(isSameDay('2026-07-09 15:00', '2026-07-09')).toBe(true);
  });

  it('今天的快照不等于历史日期 —— refreshData 据此丢弃，避免污染历史聚合', () => {
    expect(isSameDay('2026-09-12 10:00', '2026-07-09')).toBe(false);
  });

  it('跨零点：同日 00:00 与 23:59 都算同一天', () => {
    expect(isSameDay('2026-07-09 00:00', '2026-07-09')).toBe(true);
    expect(isSameDay('2026-07-09 23:59', '2026-07-09')).toBe(true);
  });

  it('缺失时间戳或日期一律 false', () => {
    expect(isSameDay(null, '2026-07-09')).toBe(false);
    expect(isSameDay(undefined, '2026-07-09')).toBe(false);
    expect(isSameDay('2026-07-09 01:30', '')).toBe(false);
    expect(isSameDay('', '2026-07-09')).toBe(false);
  });
});

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
