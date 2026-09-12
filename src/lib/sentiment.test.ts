import { describe, expect, it } from 'vitest';
import { pickAlert } from './sentiment';

describe('pickAlert', () => {
  // 2026-09-10 的真实数字：两条互斥横幅同时挂出来
  it('两个都高且差距小于阈值时都不报（剧烈分歧）', () => {
    expect(pickAlert(82, 10, 5)).toBeNull();
  });

  it('亢奋明显占优时报亢奋', () => {
    expect(pickAlert(82, 3, 5)).toEqual({ kind: 'euphoria', text: '市场极度亢奋，注意追高风险' });
  });

  it('悲观明显占优时报悲观', () => {
    expect(pickAlert(2, 40, 5)).toEqual({ kind: 'panic', text: '市场极度悲观，或存在反弹机会' });
  });

  it('一高一低不会同时报两条', () => {
    const a = pickAlert(30, 1, 5);
    expect(a?.kind).toBe('euphoria');
  });

  it('都不过阈值时不报', () => {
    expect(pickAlert(3, 2, 5)).toBeNull();
  });

  it('都不过阈值但差值大也不报（避免噪声）', () => {
    expect(pickAlert(4, 0, 5)).toBeNull();
  });
});
