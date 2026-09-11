import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { BarChart3 } from 'lucide-react';
import { fetchPalaceMeta, fetchPalaceStocks } from '@/lib/api';
import { FOCUS_RING, ROW_GRID, biasText, filterStocks, sortStocks } from '@/lib/palace';
import type { StockSortKey } from '@/lib/palace';
import type { PalaceMeta, PalaceStockSummary } from '@/types/api';
import { useStore } from '@/store/useStore';

const SORTS: Array<{ key: StockSortKey; label: string }> = [
  { key: 'mentions', label: '提及数' },
  { key: 'groups', label: '群数' },
  { key: 'recent', label: '最近' },
];

/** 首屏行数；「加载更多」每次翻倍，避免一次渲染上千行。 */
const PAGE = 60;

const ROW_BASE = `w-full text-left ${ROW_GRID}`;

function StockRow({ stock }: { stock: PalaceStockSummary }) {
  return (
    <Link
      to={`/stock/${stock.code}`}
      className={`${ROW_BASE} px-2 py-2.5 rounded-md transition-colors
                  hover:bg-surface-2 ${FOCUS_RING}`}
    >
      <span className="min-w-0">
        <span className="text-ink-primary text-[13px]">{stock.name}</span>
        <span className="text-ink-tertiary text-[11px] ml-2 tabular-nums">{stock.code}</span>
      </span>
      <span className="text-ink-secondary text-[13px] tabular-nums">{stock.total_mentions}</span>
      <span className="text-ink-secondary text-[13px] tabular-nums">{stock.group_count} 群</span>
      <span className="text-[12px] tabular-nums max-[1000px]:hidden">
        <b className="text-brand-green font-medium">+{stock.bull}</b>
        <i className="text-brand-red font-normal not-italic ml-1">−{stock.bear}</i>
        <span className="text-ink-tertiary ml-1.5">{biasText(stock.bull, stock.bear)}</span>
      </span>
      <span className="text-ink-tertiary text-[11px] tabular-nums max-[1000px]:hidden">
        {stock.last_ts.slice(5, 10) || '—'}
      </span>
    </Link>
  );
}

/** 搜索无结果：说明原因 + 给替代出口（spec §9.6）。 */
function NoResult({ query, hot, onClear }: {
  query: string;
  hot: Array<{ code: string; name: string }>;
  onClear: () => void;
}) {
  if (!query) {
    return (
      <div className="rounded-[14px] border border-dashed border-hairline/20 p-8 text-center">
        <p className="text-ink-secondary text-sm mb-2">还没有股票数据</p>
        <p className="text-ink-tertiary text-xs">
          索引尚未生成。先在服务端跑 python3 scripts/build_palace.py，再刷新本页。
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-[14px] border border-dashed border-hairline/20 p-8 text-center">
      <p className="text-ink-secondary text-sm mb-2">没有匹配「{query}」的股票</p>
      <p className="text-ink-tertiary text-xs mb-4">
        搜索只匹配代码与名称，不搜观点正文。换个关键词，或直接看这几只热票。
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button type="button" onClick={onClear}
                className={`px-3 py-1 rounded-md bg-surface-2 text-ink-secondary text-xs
                            hover:text-ink-primary transition-colors ${FOCUS_RING}`}>
          清空搜索
        </button>
        {hot.map((s) => (
          <Link key={s.code} to={`/stock/${s.code}`}
                className={`px-3 py-1 rounded-md bg-surface-2 text-brand-blue text-xs
                            hover:bg-surface-3 transition-colors ${FOCUS_RING}`}>
            {s.name}
          </Link>
        ))}
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div role="status" aria-live="polite" className="space-y-4">
      <span className="sr-only">正在加载股票列表…</span>
      <div className="rounded-[14px] bg-surface-1 border border-hairline/10 p-4 space-y-3">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="h-4 w-full bg-surface-2 rounded animate-pulse" />
        ))}
      </div>
    </div>
  );
}

export default function Stocks() {
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const sortKey = SORTS.find((s) => s.key === params.get('sort'))?.key ?? 'mentions';

  const [stocks, setStocks] = useState<PalaceStockSummary[]>([]);
  const [meta, setMeta] = useState<PalaceMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(PAGE);

  const reduceMotion = useReducedMotion();
  const rawTop = useStore((s) => s.currentSnapshot?.stk);
  const hot = useMemo(
    () => (rawTop ?? []).slice(0, 4).map((s) => ({ code: s.c, name: s.n })),
    [rawTop],
  );

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchPalaceStocks(), fetchPalaceMeta()])
      .then(([list, m]) => {
        if (cancelled) return;
        setStocks(list.stocks);
        setMeta(m);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = useMemo(
    () => sortStocks(filterStocks(stocks, query), sortKey),
    [stocks, query, sortKey],
  );

  // 换关键词或换排序都从头看，别让上一次的「加载更多」把首屏撑长。
  useEffect(() => setLimit(PAGE), [query, sortKey]);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const rows = visible.slice(0, limit);

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.3 }}
      className="space-y-5"
    >
      <div className="flex flex-wrap items-center gap-3 pb-4 border-b border-hairline/10">
        <BarChart3 size={22} className="text-brand-blue" />
        <h1 className="text-2xl font-semibold text-ink-primary tracking-tight">股票</h1>
        {meta && !loading && (
          <span className="text-ink-tertiary text-xs tabular-nums">
            共 {stocks.length} 只被大V 讨论过 · 覆盖 {meta.coverage.from || '—'} → {meta.coverage.to || '—'}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label htmlFor="stock-q" className="text-ink-tertiary text-xs shrink-0">搜索股票</label>
          <input
            id="stock-q"
            type="search"
            value={query}
            onChange={(e) => setParam('q', e.target.value)}
            placeholder="代码或名称，如 301308 / 江波龙"
            className={`w-60 px-3 py-1.5 rounded-md bg-surface-2 border border-hairline/10
                        text-ink-primary text-xs placeholder:text-ink-tertiary ${FOCUS_RING}`}
          />
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <span className="text-ink-tertiary text-xs">排序</span>
          <div className="flex rounded-md bg-surface-2 p-0.5">
            {SORTS.map((s) => (
              <button
                key={s.key}
                type="button"
                aria-pressed={sortKey === s.key}
                onClick={() => setParam('sort', s.key)}
                className={`px-2.5 py-1 rounded text-xs transition-colors ${FOCUS_RING} ${
                  sortKey === s.key
                    ? 'bg-surface-3 text-ink-primary font-semibold'
                    : 'text-ink-tertiary hover:text-ink-secondary'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <Skeleton />
      ) : visible.length === 0 ? (
        <NoResult query={query} hot={hot} onClear={() => setParam('q', '')} />
      ) : (
        <div className="rounded-[14px] bg-surface-1 border border-hairline/10 p-4">
          <div className={`${ROW_GRID} pb-2 mb-1 border-b border-hairline/10`}>
            <span className="text-ink-tertiary text-[11px]">股票</span>
            <span className="text-ink-tertiary text-[11px]">提及</span>
            <span className="text-ink-tertiary text-[11px]">群数</span>
            <span className="text-ink-tertiary text-[11px] max-[1000px]:hidden">多空</span>
            <span className="text-ink-tertiary text-[11px] max-[1000px]:hidden">最近</span>
          </div>

          <div className="flex flex-col">
            {rows.map((s) => (
              <StockRow key={s.code} stock={s} />
            ))}
          </div>

          {visible.length > limit && (
            <div className="pt-4 mt-1 border-t border-hairline/10 text-center">
              <button
                type="button"
                onClick={() => setLimit((n) => n * 2)}
                className={`px-4 py-1.5 rounded-md bg-surface-2 text-ink-secondary text-xs
                            hover:text-ink-primary transition-colors ${FOCUS_RING}`}
              >
                加载更多（还有 {visible.length - limit} 只）
              </button>
              <p className="text-ink-tertiary text-[11px] mt-2 tabular-nums">
                已显示 {rows.length} / {visible.length}
              </p>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
