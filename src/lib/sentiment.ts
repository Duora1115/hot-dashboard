export type SentimentAlert = { kind: 'euphoria' | 'panic'; text: string };

const EUPHORIA_TEXT = '市场极度亢奋，注意追高风险';
const PANIC_TEXT = '市场极度悲观，或存在反弹机会';

/**
 * 亢奋与悲观**互斥**。
 *
 * 原来 `Sentiment.tsx` 里是两个独立条件（`eh > 5`、`el > 5`），2026-09-10
 * （eh=82 / el=10）两条横幅同时挂出，页面自相矛盾。
 *
 * 规则：只有**恰好一边**过阈值时才报那一边；
 * 两边都过阈值（eh 与 el 同时高）在真实市场里是「剧烈分歧」，
 * 两边都不过则没有信号 —— 这两种情况都返回 null，
 * 此时沉默比两条都喊（或喊错一边）更诚实。
 */
export function pickAlert(euphoria: number, pessimism: number, threshold = 5): SentimentAlert | null {
  const euphoriaHot = euphoria >= threshold;
  const panicHot = pessimism >= threshold;
  // 两边同时过阈值 → 剧烈分歧；两边都没过 → 无信号。都不报。
  if (euphoriaHot === panicHot) return null;
  return euphoriaHot
    ? { kind: 'euphoria', text: EUPHORIA_TEXT }
    : { kind: 'panic', text: PANIC_TEXT };
}
