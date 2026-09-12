import { describe, expect, it } from 'vitest';
import { pickAlert } from './sentiment';

describe('pickAlert', () => {
  // 2026-09-10 的真实数字：82 : 10 ≈ 8:1，是亢奋明显占优。
  // 原来的缺陷是两条横幅同时挂出，而不是该不该报。
  it('2026-09-10 的 82/10 报亢奋（差距远超阈值）', () => {
    expect(pickAlert(82, 10, 5)).toEqual({ kind: 'euphoria', text: '市场极度亢奋，注意追高风险' });
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

  // 真正的剧烈分歧：两个都高，但势均力敌（差 2 < 阈值），保持沉默。
  // 这条才真正钉住「差值不够就不喊」，而不是「两个都非零就不喊」。
  it('两边都过阈值但差距小于阈值时不报（剧烈分歧）', () => {
    expect(pickAlert(40, 38, 5)).toBeNull();
  });

  // 回归：差值守卫只对「两边都高」生效。单边过阈值时不能因为差值小就沉默，
  // 否则 (8,4) 这种「独苗信号」会被吞掉 —— 那是把旧 bug 换成了新 bug。
  it('只有单边过阈值时，差值小也必须报（不过度抑制）', () => {
    expect(pickAlert(8, 4, 5)).toEqual({ kind: 'euphoria', text: '市场极度亢奋，注意追高风险' });
  });

  it('差距恰好等于阈值时报大的一方（边界）', () => {
    expect(pickAlert(10, 5, 5)).toEqual({ kind: 'euphoria', text: '市场极度亢奋，注意追高风险' });
  });
});
