import type { PalaceKol, PalaceStockSummary } from '@/types/api';

/** /kols 的排序键 */
export type KolSortKey = 'active' | 'opinion' | 'stocks';

/** /stocks 的排序键 */
export type StockSortKey = 'mentions' | 'groups' | 'recent';

/** 全站统一的焦点环（spec §9.5 第 5 条） */
export const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2';

/**
 * 表格行/表头共享的栅格。≤1000px 时隐藏「多空」「最近」两列
 * （spec §9.5 第 8 条：去列，不做横向滚动），模板同步收窄。
 */
export const ROW_GRID =
  'grid grid-cols-[1.6fr_.5fr_.7fr_1.3fr_.8fr] max-[1000px]:grid-cols-[1.7fr_.5fr_1.3fr] gap-3 items-center';

/** 群名「253_橙子不糊涂」→ { no: '253', label: '橙子不糊涂' } */
export function splitGroupName(name: string): { no: string; label: string } {
  const m = /^(\d+)_(.*)$/.exec(name);
  return m ? { no: m[1], label: m[2] } : { no: '', label: name };
}

/** 距参考时间超过 days 天没消息即为断更（无 last_ts 也算）。 */
export function isStale(kol: PalaceKol, refTs: string, days = 30): boolean {
  if (!kol.last_ts) return true;
  const ref = Date.parse(refTs.slice(0, 10));
  const last = Date.parse(kol.last_ts.slice(0, 10));
  if (Number.isNaN(ref) || Number.isNaN(last)) return false;
  return (ref - last) / 86_400_000 > days;
}

/** 排序：断更的永远沉底，其余按 key 降序，同分按群名。 */
export function sortKols(kols: PalaceKol[], key: KolSortKey, refTs: string): PalaceKol[] {
  const weight = (k: PalaceKol) =>
    key === 'opinion' ? k.opinion_count : key === 'stocks' ? k.stock_count : k.active_days;
  return [...kols].sort((a, b) => {
    const sa = isStale(a, refTs) ? 1 : 0;
    const sb = isStale(b, refTs) ? 1 : 0;
    if (sa !== sb) return sa - sb;
    if (weight(b) !== weight(a)) return weight(b) - weight(a);
    return a.name.localeCompare(b.name, 'zh');
  });
}

/** 搜索：只匹配群号与群名（不搜观点正文）。 */
export function filterKols(kols: PalaceKol[], query: string): PalaceKol[] {
  const q = query.trim().toLowerCase();
  if (!q) return kols;
  return kols.filter((k) => k.name.toLowerCase().includes(q));
}

/** 股票排序：按 key 降序，同分按代码。 */
export function sortStocks(
  stocks: PalaceStockSummary[],
  key: StockSortKey,
): PalaceStockSummary[] {
  const weight = (s: PalaceStockSummary) =>
    key === 'groups' ? s.group_count : s.total_mentions;
  return [...stocks].sort((a, b) => {
    // 「最近」按时间字符串比较即可（ISO 形如 2026-07-06 08:09，字典序即时间序）。
    if (key === 'recent' && a.last_ts !== b.last_ts) {
      return (b.last_ts || '').localeCompare(a.last_ts || '');
    }
    if (weight(b) !== weight(a)) return weight(b) - weight(a);
    return a.code.localeCompare(b.code);
  });
}

/** 股票搜索：代码或名称，均不区分大小写。 */
export function filterStocks(
  stocks: PalaceStockSummary[],
  query: string,
): PalaceStockSummary[] {
  const q = query.trim().toLowerCase();
  if (!q) return stocks;
  return stocks.filter(
    (s) => s.code.toLowerCase().includes(q) || s.name.toLowerCase().includes(q),
  );
}

/**
 * 消息正文按纯文本渲染，markdown 会原样露出来——群里的票几乎都写成
 * `[旭创](https://wap.eastmoney.com/quote/stock/0.300308.html)`，一条链接六十多
 * 字符，满屏都是 URL。图片引用折成 `[图片]`，其余链接只留显示文字。
 *
 * 图片规则必须放在链接规则前面：`![Image](url)` 内部含 `[Image](url)`，先跑链接
 * 规则会把它折成 `!Image`，那个 `!` 就去不掉了。
 */
export function readableText(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '[图片]')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
}

/** 多空的文字标签（spec §9.5 第 4 条：状态不只靠颜色）。 */
export function biasText(bull: number, bear: number): string {
  const total = bull + bear;
  if (total === 0) return '分歧';
  const ratio = bull / total;
  if (ratio >= 0.65) return '偏多';
  if (ratio <= 0.35) return '偏空';
  return '分歧';
}
