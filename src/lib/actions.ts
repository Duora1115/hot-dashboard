/**
 * 后端 `snapshot.act` 的键是「买入信号 / 卖出信号 / 持有建议 / 风险提示」，
 * 而对比页原来按「买入 / 卖出 / 持有 / 风险」取值 —— 全取到 undefined，
 * 于是操作信号图永远没有柱子、买卖比永远是 ∞。这里做一次显式归一化。
 */
export const ACTION_KEYS = ['买入', '卖出', '持有', '风险'] as const;
export type ActionKey = (typeof ACTION_KEYS)[number];

const API_SUFFIX: Record<ActionKey, string> = {
  买入: '买入信号',
  卖出: '卖出信号',
  持有: '持有建议',
  风险: '风险提示',
};

export function normalizeActionCounts(
  act: Record<string, number> | undefined,
): Record<ActionKey, number> {
  const src = act ?? {};
  const out = {} as Record<ActionKey, number>;
  for (const key of ACTION_KEYS) {
    const raw = src[API_SUFFIX[key]] ?? src[key];
    out[key] = typeof raw === 'number' ? raw : 0;
  }
  return out;
}

/** 卖出为 0 时没有意义的比值 —— 返回 null，由调用方显示「—」。 */
export function buySellRatio(counts: Record<ActionKey, number>): number | null {
  if (counts.卖出 <= 0) return null;
  return counts.买入 / counts.卖出;
}
