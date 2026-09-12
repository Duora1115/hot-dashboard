import { describe, expect, it } from 'vitest';
import { ACTION_KEYS, buySellRatio, normalizeActionCounts } from './actions';

// /api/day/2026-09-11 的真实形状
const API_ACT = { 风险提示: 24, 买入信号: 76, 卖出信号: 34, 持有建议: 90 };

describe('normalizeActionCounts', () => {
  it('把后端的「买入信号」等长名映射成短名', () => {
    expect(normalizeActionCounts(API_ACT)).toEqual({ 买入: 76, 卖出: 34, 持有: 90, 风险: 24 });
  });

  it('缺失的键补 0', () => {
    expect(normalizeActionCounts({ 买入信号: 5 })).toEqual({ 买入: 5, 卖出: 0, 持有: 0, 风险: 0 });
  });

  it('undefined 也返回完整的零值对象', () => {
    expect(normalizeActionCounts(undefined)).toEqual({ 买入: 0, 卖出: 0, 持有: 0, 风险: 0 });
  });

  it('ACTION_KEYS 与返回对象的键一致（图表轴依赖顺序）', () => {
    expect(Object.keys(normalizeActionCounts(API_ACT))).toEqual([...ACTION_KEYS]);
  });
});

describe('buySellRatio', () => {
  it('正常算出比值', () => {
    expect(buySellRatio(normalizeActionCounts(API_ACT))).toBeCloseTo(2.2, 1);
  });

  it('卖出为 0 时返回 null，而不是 Infinity', () => {
    expect(buySellRatio({ 买入: 5, 卖出: 0, 持有: 0, 风险: 0 })).toBeNull();
  });
});
