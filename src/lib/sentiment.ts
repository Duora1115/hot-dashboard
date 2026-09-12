export type SentimentAlert = { kind: 'euphoria' | 'panic'; text: string };

const EUPHORIA_TEXT = '市场极度亢奋，注意追高风险';
const PANIC_TEXT = '市场极度悲观，或存在反弹机会';

/**
 * 亢奋与悲观**互斥**：最多只会返回一条，调用方因此不可能同时挂出两条横幅。
 *
 * 原来 `Sentiment.tsx` 里是两个独立条件（`eh > 5`、`el > 5`），2026-09-10
 * （eh=82 / el=10）两条横幅同时挂出，页面自相矛盾 —— 缺陷是「同时报两条」，
 * 而不是「该报哪一条」。
 *
 * 规则：
 *   1. 两个数都不过阈值 → 没有信号，返回 null；
 *   2. **两个数都过阈值、且差值绝对值小于阈值** → 两边势均力敌（剧烈分歧），
 *      保持沉默。差值守卫只在这一种情况下生效；
 *   3. 否则报数值大的一方。
 *
 * 注意第 2 条的两个条件缺一不可：若让差值守卫无条件生效，(8, 4) 这种
 * 「单边过阈值、但差值小」的独苗信号会被吞掉 —— 那是把「同时报两条」的
 * 旧 bug 换成「明明有信号却沉默」的新 bug。
 */
export function pickAlert(euphoria: number, pessimism: number, threshold = 5): SentimentAlert | null {
  const euphoriaHot = euphoria >= threshold;
  const pessimismHot = pessimism >= threshold;
  if (!euphoriaHot && !pessimismHot) return null;
  if (euphoriaHot && pessimismHot && Math.abs(euphoria - pessimism) < threshold) return null;
  return euphoria > pessimism
    ? { kind: 'euphoria', text: EUPHORIA_TEXT }
    : { kind: 'panic', text: PANIC_TEXT };
}
