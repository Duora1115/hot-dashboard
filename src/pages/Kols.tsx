import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { AlertTriangle, Users } from 'lucide-react';
import { fetchPalaceKols, fetchPalaceMeta } from '@/lib/api';
import { FOCUS_RING, biasText, filterKols, isStale, sortKols, splitGroupName } from '@/lib/palace';
import type { KolSortKey } from '@/lib/palace';
import type { PalaceKol, PalaceMeta } from '@/types/api';
import { useStore } from '@/store/useStore';

const SORTS: Array<{ key: KolSortKey; label: string }> = [
  { key: 'active', label: '活跃度' },
  { key: 'opinion', label: '观点数' },
  { key: 'stocks', label: '股票数' },
];

/** 多空倾向条：绿多红空（A 股惯例），两侧给数字不只用颜色 */
function BiasBar({ bull, bear }: { bull: number; bear: number }) {
  const total = bull + bear;
  const bullPct = total ? Math.round((bull / total) * 100) : 0;

  return (
    <>
      <div className="relative h-1.5 rounded-full overflow-hidden bg-surface-2">
        {total > 0 && (
          <>
            <div className="absolute left-0 top-0 h-full bg-brand-green rounded-full"
                 style={{ width: `${bullPct}%` }} />
            <div className="absolute top-0 h-full bg-brand-red rounded-full"
                 style={{ left: `${bullPct}%`, width: `${100 - bullPct}%` }} />
          </>
        )}
      </div>
      <div className="flex justify-between text-[11px] text-ink-tertiary mt-1.5">
        <span className="tabular-nums">
          {biasText(bull, bear)} {total ? `${bullPct}%` : '—'}
        </span>
        <span className="tabular-nums">多 {bull} · 空 {bear}</span>
      </div>
    </>
  );
}

/** 断更的群渲染成不可点的降级卡片（spec §9.6） */
function StaleCard({ kol }: { kol: PalaceKol }) {
  const { no, label } = splitGroupName(kol.name);

  return (
    <div className="rounded-[14px] p-4 border border-hairline/10 bg-surface-1
                    bg-[repeating-linear-gradient(135deg,transparent,transparent_6px,rgba(128,128,128,0.06)_6px,rgba(128,128,128,0.06)_12px)]
                    opacity-70">
      <div className="flex items-center gap-2 mb-2">
        {no && <span className="text-ink-tertiary text-xs tabular-nums">{no}</span>}
        <span className="text-ink-secondary font-medium text-sm">{label}</span>
      </div>
      <div className="flex items-center gap-1.5 text-ink-tertiary text-xs mb-2">
        <AlertTriangle size={13} />
        近 30 天无消息 · 数据缺失
      </div>
      <div className="text-ink-tertiary text-[11px] tabular-nums">
        — 只票 · — 观点 · 最后 {kol.last_ts.slice(0, 10) || '未知'}
      </div>
    </div>
  );
}

function KolCard({ kol }: { kol: PalaceKol }) {
  const { no, label } = splitGroupName(kol.name);
  const { bias, trading, top_sectors: sectors } = kol.style;

  return (
    <Link
      to={`/kol/${kol.chat_id}`}
      className={`block rounded-[14px] p-4 border border-hairline/10 bg-surface-1
                  hover:bg-surface-2 hover:border-hairline/20 transition-colors ${FOCUS_RING}`}
    >
      <div className="flex items-baseline gap-2 mb-2">
        {no && <span className="text-ink-tertiary text-xs tabular-nums">{no}</span>}
        <span className="text-ink-primary font-semibold text-sm">{label}</span>
        <span className="text-ink-tertiary text-[11px]">{kol.active_days} 天</span>
      </div>

      {trading.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2.5">
          {trading.map((t) => (
            <span key={t}
                  className="px-1.5 py-0.5 rounded-md bg-surface-2 text-ink-secondary text-[10.5px]">
              {t}
            </span>
          ))}
        </div>
      )}

      <BiasBar bull={bias.bull} bear={bias.bear} />

      {sectors.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2.5">
          {sectors.slice(0, 3).map(([name]) => (
            <span key={name}
                  className="px-1.5 py-0.5 rounded-md bg-surface-2 text-brand-blue text-[10.5px]">
              {name}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 pt-2.5 border-t border-hairline/10 text-ink-tertiary text-[11px] tabular-nums">
        {kol.stock_count} 只票 · {kol.opinion_count} 观点 · {kol.last_ts.slice(0, 10) || '—'}
      </div>
    </Link>
  );
}

/** 搜索无结果：说明原因 + 给替代出口（spec §9.6） */
function NoResult({ query, hot, onClear }: {
  query: string;
  hot: Array<{ code: string; name: string }>;
  onClear: () => void;
}) {
  return (
    <div className="rounded-[14px] border border-dashed border-hairline/20 p-8 text-center">
      <p className="text-ink-secondary text-sm mb-2">没有匹配「{query}」的群</p>
      <p className="text-ink-tertiary text-xs mb-4">
        搜索只匹配群号与群名，不搜观点正文。换个关键词，或直接看这几只热票。
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
      <span className="sr-only">正在加载大V 列表…</span>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="rounded-[14px] p-4 border border-hairline/10 bg-surface-1 animate-pulse">
            <div className="h-3.5 w-24 bg-surface-2 rounded mb-3" />
            <div className="h-2 w-full bg-surface-2 rounded mb-2" />
            <div className="h-2 w-2/3 bg-surface-2 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Kols() {
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const sortKey = SORTS.find((s) => s.key === params.get('sort'))?.key ?? 'active';

  const [kols, setKols] = useState<PalaceKol[]>([]);
  const [meta, setMeta] = useState<PalaceMeta | null>(null);
  const [loading, setLoading] = useState(true);

  const reduceMotion = useReducedMotion();
  const rawTop = useStore((s) => s.currentSnapshot?.stk);
  const hot = useMemo(
    () => (rawTop ?? []).slice(0, 4).map((s) => ({ code: s.c, name: s.n })),
    [rawTop],
  );

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchPalaceKols(), fetchPalaceMeta()])
      .then(([list, m]) => {
        if (cancelled) return;
        setKols(list.kols);
        setMeta(m);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const refTs = meta?.coverage?.to ?? '';
  const visible = useMemo(
    () => sortKols(filterKols(kols, query), sortKey, refTs),
    [kols, query, sortKey, refTs],
  );

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const missingDays = meta?.coverage?.missing_days ?? [];

  // spec §9.5 第 5 条：卡片墙支持 ←/→ 在卡片间移动。
  // 焦点在卡片（<Link>）上时，方向键按栅格列数在兄弟链接间移动；
  // 断更卡片是 div、不是链接，天然被跳过（本来就不可点入）。
  const gridRef = useRef<HTMLDivElement>(null);
  const onGridKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 'row', ArrowUp: '-row' }[
      e.key as 'ArrowRight' | 'ArrowLeft' | 'ArrowDown' | 'ArrowUp'
    ];
    if (step === undefined) return;

    const nodes = Array.from(gridRef.current?.querySelectorAll<HTMLElement>('a[href]') ?? []);
    const i = nodes.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;

    const cols = window.matchMedia('(min-width: 1024px)').matches
      ? 4
      : window.matchMedia('(min-width: 640px)').matches
        ? 2
        : 1;
    const delta = step === 'row' ? cols : step === '-row' ? -cols : (step as number);
    e.preventDefault();
    const next = ((i + delta) % nodes.length + nodes.length) % nodes.length;
    nodes[next]?.focus();
  };

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.3 }}
      className="space-y-5"
    >
      <div className="flex flex-wrap items-center gap-3 pb-4 border-b border-hairline/10">
        <Users size={22} className="text-brand-blue" />
        <h1 className="text-2xl font-semibold text-ink-primary tracking-tight">大V</h1>
        {meta && (
          <span className="text-ink-tertiary text-xs tabular-nums">
            {meta.coverage.groups} 个群 · 覆盖 {meta.coverage.from || '—'} → {meta.coverage.to || '—'}
          </span>
        )}
      </div>

      {missingDays.length > 0 && (
        <div className="flex items-start gap-2 rounded-[12px] border border-hairline/10 bg-surface-1 px-3 py-2">
          <AlertTriangle size={14} className="text-brand-yellow mt-0.5 shrink-0" />
          <p className="text-ink-tertiary text-xs">
            数据缺口 {missingDays.length} 个交易日：
            <span className="tabular-nums">{missingDays[0]} ~ {missingDays[missingDays.length - 1]}</span>
            ，缺口内这些群没有观点。
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label htmlFor="kol-q" className="text-ink-tertiary text-xs shrink-0">搜索大V</label>
          <input
            id="kol-q"
            type="search"
            value={query}
            onChange={(e) => setParam('q', e.target.value)}
            placeholder="群号或群名，如 253 / 橙子"
            className={`w-56 px-3 py-1.5 rounded-md bg-surface-2 border border-hairline/10
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
        <div
          ref={gridRef}
          onKeyDown={onGridKeyDown}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3"
        >
          {visible.map((k) =>
            isStale(k, refTs) ? (
              <StaleCard key={k.chat_id} kol={k} />
            ) : (
              <KolCard key={k.chat_id} kol={k} />
            ),
          )}
        </div>
      )}
    </motion.div>
  );
}
