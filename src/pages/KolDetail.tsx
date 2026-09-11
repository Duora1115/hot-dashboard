import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { AlertTriangle, ArrowLeft, Clock } from 'lucide-react';
import { fetchPalaceKol, fetchPalaceKolStock } from '@/lib/api';
import { FOCUS_RING, ROW_GRID, biasText, readableText, splitGroupName } from '@/lib/palace';
import type { PalaceKolDetail, PalaceKolStock, PalaceOpinion } from '@/types/api';

/** 表头排序键 */
type StockSortKey = 'count' | 'bias' | 'last';

/** 表头与行共享同一套 class，保证列宽一致 */
const ROW_BASE = `w-full text-left ${ROW_GRID}`;

/** 首屏行数；「加载更多」每次翻倍。 */
const PAGE = 50;

function ProfileStrip({ kol }: { kol: PalaceKolDetail }) {
  const { bias, trading, breadth, top_sectors: sectors, session } = kol.style;
  const total = bias.bull + bias.bear;
  const bullPct = total ? Math.round((bias.bull / total) * 100) : 0;

  return (
    <div className="rounded-[14px] bg-surface-1 border border-hairline/10 p-4
                    grid grid-cols-1 md:grid-cols-4 gap-4">
      <div>
        <div className="text-ink-tertiary text-[11px] mb-1.5">多空倾向</div>
        <div className="text-ink-primary text-lg font-semibold tabular-nums mb-2">
          {bias.label} {bias.ratio === null ? '' : `${Math.round(bias.ratio * 100)}%`}
        </div>
        <div className="relative h-1.5 rounded-full overflow-hidden bg-surface-2">
          <div className="absolute left-0 top-0 h-full bg-brand-green rounded-full"
               style={{ width: `${bullPct}%` }} />
          <div className="absolute top-0 h-full bg-brand-red rounded-full"
               style={{ left: `${bullPct}%`, width: `${100 - bullPct}%` }} />
        </div>
        <div className="text-ink-tertiary text-[11px] mt-1.5 tabular-nums">
          多 {bias.bull} · 空 {bias.bear}
        </div>
      </div>

      <div>
        <div className="text-ink-tertiary text-[11px] mb-1.5">操作风格</div>
        <div className="flex flex-wrap gap-1 mb-2">
          {trading.length > 0 ? trading.map((t) => (
            <span key={t} className="px-2 py-0.5 rounded-md bg-surface-2 text-ink-secondary text-[11px]">
              {t}
            </span>
          )) : <span className="text-ink-tertiary text-[11px]">无</span>}
        </div>
        <div className="text-ink-tertiary text-[11px] tabular-nums">
          集中度 {Math.round(breadth.concentration * 100)}%
          （{breadth.concentration >= 0.5 ? '集中' : '偏分散'}）
        </div>
      </div>

      <div>
        <div className="text-ink-tertiary text-[11px] mb-1.5">覆盖广度</div>
        <div className="text-ink-primary text-lg font-semibold tabular-nums">{kol.stock_count} 只</div>
        <div className="text-ink-tertiary text-[11px] mt-1 tabular-nums">
          消息 {kol.msg_count} · 观点 {kol.opinion_count}
        </div>
      </div>

      <div>
        <div className="text-ink-tertiary text-[11px] mb-1.5">活跃</div>
        <div className="text-ink-primary text-lg font-semibold tabular-nums">{kol.active_days} 天</div>
        <div className="text-ink-tertiary text-[11px] mt-1 tabular-nums">
          盘中 {Math.round(session.intraday * 100)}% / 盘外 {Math.round(session.after_hours * 100)}%
        </div>
        {sectors.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {sectors.slice(0, 3).map(([name]) => (
              <span key={name} className="px-1.5 py-0.5 rounded-md bg-surface-2 text-brand-blue text-[10.5px]">
                {name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Timeline({ opinions, name }: { opinions: PalaceOpinion[]; name: string }) {
  if (opinions.length === 0) {
    return (
      <p className="text-ink-tertiary text-xs py-6 text-center">这只票在该群没有观点正文。</p>
    );
  }

  return (
    <div className="flex flex-col gap-3 max-h-[520px] overflow-auto pr-1">
      {opinions.map((o, i) => (
        <div key={`${o.id}-${o.ts}-${i}`} className="grid grid-cols-[78px_1fr] gap-3">
          <div className="text-ink-tertiary text-[11px] tabular-nums pt-1">{o.ts.slice(5)}</div>
          <div className="rounded-[10px] bg-surface-2 border border-hairline/10 p-3">
            <div className="flex flex-wrap gap-1.5 mb-2">
              {o.bull && (
                <span className="px-2 py-0.5 rounded-md bg-brand-green/15 text-brand-green text-[10.5px]">
                  看多
                </span>
              )}
              {o.bear && (
                <span className="px-2 py-0.5 rounded-md bg-brand-red/15 text-brand-red text-[10.5px]">
                  看空
                </span>
              )}
              {o.actions.map((a) => (
                <span key={a} className="px-2 py-0.5 rounded-md bg-surface-3 text-ink-secondary text-[10.5px]">
                  {a}
                </span>
              ))}
              {o.sectors.map((s) => (
                <span key={s} className="text-ink-tertiary text-[10.5px]">{s}</span>
              ))}
            </div>
            <p className="text-ink-secondary text-xs leading-relaxed whitespace-pre-wrap">{readableText(o.text)}</p>
          </div>
        </div>
      ))}
      <div className="text-ink-tertiary text-[11px] text-right">
        共 {opinions.length} 条 · {name}
      </div>
    </div>
  );
}

export default function KolDetail() {
  const { chatId = '', code } = useParams();
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();

  const [kol, setKol] = useState<PalaceKolDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<StockSortKey>('count');
  const [sortAsc, setSortAsc] = useState(false);
  const [opinions, setOpinions] = useState<PalaceOpinion[]>([]);
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setKol(null);
    fetchPalaceKol(chatId)
      .then((k) => {
        if (!cancelled) setKol(k);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [chatId]);

  // 未选中股票、或选中的票不属于这个群时，落到提及最多的那只（用 replace 保持历史干净）
  useEffect(() => {
    if (!kol || kol.chat_id !== chatId || kol.stocks.length === 0) return;
    if (!code || !kol.stocks.some((s) => s.code === code)) {
      navigate(`/kol/${chatId}/${kol.stocks[0].code}`, { replace: true });
    }
  }, [code, kol, chatId, navigate]);

  useEffect(() => {
    if (!code) {
      setOpinions([]);
      return;
    }
    let cancelled = false;
    fetchPalaceKolStock(chatId, code).then((ops) => {
      if (!cancelled) setOpinions(ops);
    });
    return () => {
      cancelled = true;
    };
  }, [chatId, code]);

  const stocks = useMemo(() => {
    const list = kol?.stocks ?? [];
    const weight = (s: PalaceKolStock) =>
      sortKey === 'bias' ? s.bull - s.bear : sortKey === 'last' ? s.last_ts : s.count;
    const sorted = [...list].sort((a, b) => {
      const wa = weight(a);
      const wb = weight(b);
      if (wa === wb) return a.code.localeCompare(b.code);
      return sortAsc ? (wa < wb ? -1 : 1) : (wa < wb ? 1 : -1);
    });
    return sorted;
  }, [kol, sortKey, sortAsc]);

  // 换群或换排序都从头看，别让上一次的「加载更多」把列表撑长。
  useEffect(() => setLimit(PAGE), [chatId, sortKey, sortAsc]);

  // 深链选中的票可能排在很后面，别让它被截断在场外——宁可多渲染几行。
  const selectedIndex = code ? stocks.findIndex((s) => s.code === code) : -1;
  const shown = Math.max(limit, selectedIndex + 1);

  const toggleSort = (key: StockSortKey) => {
    if (sortKey === key) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(key === 'last');
    }
  };

  if (loading) {
    return (
      <div role="status" aria-live="polite" className="space-y-4">
        <span className="sr-only">正在加载大V 详情…</span>
        <div className="h-28 rounded-[14px] bg-surface-1 border border-hairline/10 animate-pulse" />
        <div className="h-64 rounded-[14px] bg-surface-1 border border-hairline/10 animate-pulse" />
      </div>
    );
  }

  if (!kol) {
    return (
      <div className="rounded-[14px] border border-dashed border-hairline/20 p-10 text-center">
        <AlertTriangle size={28} className="text-ink-tertiary mx-auto mb-3" />
        <p className="text-ink-secondary text-sm mb-1">找不到这个大V（{chatId}）</p>
        <p className="text-ink-tertiary text-xs mb-5">可能还没跑 built_palace，或这个群不在接入的 25 个群里。</p>
        <Link to="/kols"
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-[10px] bg-surface-2
                          text-ink-secondary hover:text-ink-primary text-sm ${FOCUS_RING}`}>
          <ArrowLeft size={15} /> 返回大V 列表
        </Link>
      </div>
    );
  }

  const { no, label } = splitGroupName(kol.name);
  const selected = stocks.find((s) => s.code === code) ?? null;

  const header = (key: StockSortKey, text: string, className = '') => (
    <button
      type="button"
      aria-sort={sortKey === key ? (sortAsc ? 'ascending' : 'descending') : 'none'}
      onClick={() => toggleSort(key)}
      className={`text-left text-[11px] transition-colors ${className} ${FOCUS_RING} ${
        sortKey === key ? 'text-brand-blue font-semibold' : 'text-ink-tertiary hover:text-ink-secondary'
      }`}
    >
      {text}
      <span aria-hidden="true" className="ml-0.5">
        {sortKey === key ? (sortAsc ? '↑' : '↓') : ''}
      </span>
    </button>
  );

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.3 }}
      className="space-y-4"
    >
      <div className="flex items-center gap-3 pb-4 border-b border-hairline/10">
        <Link to="/kols"
              className={`p-1.5 rounded-md text-ink-tertiary hover:text-ink-primary ${FOCUS_RING}`}
              aria-label="返回大V 列表">
          <ArrowLeft size={18} />
        </Link>
        {no && <span className="text-ink-tertiary text-sm tabular-nums">{no}</span>}
        <h1 className="text-2xl font-semibold text-ink-primary tracking-tight">{label}</h1>
        <span className="text-ink-tertiary text-xs tabular-nums ml-auto">
          最后活跃 {kol.last_ts.slice(0, 10) || '—'}
        </span>
      </div>

      <ProfileStrip kol={kol} />

      <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_1fr] gap-4">
        <div className="rounded-[14px] bg-surface-1 border border-hairline/10 p-4">
          <div className={`${ROW_GRID} pb-2 mb-1 border-b border-hairline/10`}>
            <span className="text-ink-tertiary text-[11px]">股票</span>
            {header('count', '提及')}
            {header('bias', '多空', 'max-[1000px]:hidden')}
            <span className="text-ink-tertiary text-[11px]">最近操作</span>
            {header('last', '最近', 'max-[1000px]:hidden')}
          </div>

          {stocks.length === 0 ? (
            <p className="text-ink-tertiary text-xs py-6 text-center">该群还没有可归因的观点。</p>
          ) : (
            <div className="flex flex-col">
              {stocks.slice(0, shown).map((s) => {
                const on = s.code === code;
                return (
                  <button
                    key={s.code}
                    type="button"
                    aria-current={on}
                    onClick={() => navigate(`/kol/${chatId}/${s.code}`)}
                    className={`${ROW_BASE} px-2 py-2.5 rounded-md border-l-2 transition-colors
                                ${FOCUS_RING} ${
                      on
                        ? 'border-l-brand-blue bg-surface-2'
                        : 'border-l-transparent hover:bg-surface-2'
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="text-ink-primary text-[13px]">{s.name || s.code}</span>
                      <span className="text-ink-tertiary text-[11px] ml-2 tabular-nums">{s.code}</span>
                    </span>
                    <span className="text-ink-secondary text-[13px] tabular-nums">{s.count}</span>
                    <span className="text-[12px] tabular-nums max-[1000px]:hidden">
                      <b className="text-brand-green font-medium">+{s.bull}</b>
                      <i className="text-brand-red font-normal not-italic ml-1">−{s.bear}</i>
                      <span className="text-ink-tertiary ml-1.5">{biasText(s.bull, s.bear)}</span>
                    </span>
                    <span className="flex flex-wrap gap-1">
                      {s.actions.slice(0, 2).map((a) => (
                        <span key={a} className="px-1.5 py-0.5 rounded bg-surface-3 text-ink-secondary text-[10.5px]">
                          {a}
                        </span>
                      ))}
                    </span>
                    <span className="text-ink-tertiary text-[11px] tabular-nums max-[1000px]:hidden">
                      {s.last_ts.slice(5, 10) || '—'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {stocks.length > shown && (
            <div className="pt-4 mt-1 border-t border-hairline/10 text-center">
              <button
                type="button"
                onClick={() => setLimit((n) => n * 2)}
                className={`px-4 py-1.5 rounded-md bg-surface-2 text-ink-secondary text-xs
                            hover:text-ink-primary transition-colors ${FOCUS_RING}`}
              >
                加载更多（还有 {stocks.length - shown} 只）
              </button>
              <p className="text-ink-tertiary text-[11px] mt-2 tabular-nums">
                已显示 {shown} / {stocks.length}
              </p>
            </div>
          )}
        </div>

        <div className="rounded-[14px] bg-surface-1 border border-hairline/10 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock size={15} className="text-brand-blue" />
            <h2 className="text-ink-primary font-semibold text-sm">
              {selected ? `${selected.name || selected.code} · 观点时间线` : '观点时间线'}
            </h2>
            <span className="text-ink-tertiary text-[11px] tabular-nums ml-auto">
              {opinions.length} 条
            </span>
            {selected && (
              <Link
                to={`/stock/${selected.code}?from=${chatId}`}
                className={`shrink-0 text-brand-blue text-[11px] hover:underline ${FOCUS_RING}`}
              >
                个股页 →
              </Link>
            )}
          </div>
          {code ? (
            <Timeline opinions={opinions} name={label} />
          ) : (
            <p className="text-ink-tertiary text-xs py-6 text-center">左侧点一只票看观点。</p>
          )}
        </div>
      </div>
    </motion.div>
  );
}
