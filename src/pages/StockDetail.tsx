import { useState, useMemo, useCallback, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft,
  Flame,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronDown,
  MessageCircle,
  BarChart3,
  Layers,
  ArrowUp,
  ArrowDown,
  Thermometer,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { useStore } from '@/store/useStore';
import { fetchStockMessages } from '@/lib/api';
import type { StockItem } from '@/types/api';
import { chartTooltipStyle, chartTooltipLabelStyle } from '@/lib/chart';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const formatTime = (t: string) => t.split(' ')[1] ?? t;

const getHeatColor = (sc: number) => {
  if (sc >= 80) return '#FF6961';
  if (sc >= 60) return '#FF9F0A';
  return '#30D158';
};

const getHeatLabel = (sc: number) => {
  if (sc >= 80) return '热度爆棚';
  if (sc >= 60) return '热度较高';
  return '热度一般';
};

const getHeatIcon = (sc: number) => {
  if (sc >= 80) return <Flame size={16} className="text-red-500" />;
  if (sc >= 60) return <TrendingUp size={16} className="text-amber-500" />;
  return <Thermometer size={16} className="text-emerald-500" />;
};

const getSentimentLabel = (bull: number, bear: number) => {
  const total = bull + bear;
  if (total === 0) return '观望';
  const ratio = bull / total;
  if (ratio > 0.7) return '强烈看多';
  if (ratio > 0.5) return '偏多';
  if (ratio > 0.3) return '分歧';
  return '偏空';
};

const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.1,
    },
  },
};

const fadeSlideUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.9] as [number, number, number, number] } },
};

/* ------------------------------------------------------------------ */
/*  Stock Header                                                       */
/* ------------------------------------------------------------------ */

function StockHeader({ stock }: { stock: StockItem }) {
  const navigate = useNavigate();
  const sentimentLabel = getSentimentLabel(stock.bu, stock.be);
  const sentimentColor = stock.bu > stock.be ? '#30D158' : stock.be > stock.bu ? '#FF453A' : '#FFD60A';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.9] as [number, number, number, number] }}
      className="relative bg-surface-1 border border-hairline/10 rounded-[14px] p-5 overflow-hidden"
    >
      {/* Top gradient line */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-brand-blue to-transparent" />

      {/* Back button */}
      <motion.button
        onClick={() => navigate('/')}
        className="flex items-center gap-1 text-ink-tertiary hover:text-ink-primary text-sm mb-4 transition-colors"
        whileHover={{ x: -3 }}
      >
        <ChevronLeft size={16} />
        返回 Dashboard
      </motion.button>

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        {/* Left: name + code */}
        <div className="flex-1 min-w-0">
          <motion.h1
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
            className="text-3xl sm:text-4xl font-bold text-ink-primary tracking-tight"
          >
            {stock.n}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.35, delay: 0.05 }}
            className="text-lg font-mono text-brand-blue mt-1"
          >
            {stock.c}
          </motion.p>

          {/* Sector tags */}
          <motion.div
            variants={staggerContainer}
            initial="initial"
            animate="animate"
            className="flex flex-wrap gap-2 mt-3"
          >
            {stock.sec.map((sector) => (
              <motion.span
                key={sector}
                variants={fadeSlideUp}
                className="inline-flex items-center px-2.5 py-1 rounded-md bg-surface-2 text-brand-blue text-xs font-medium border border-hairline/10 hover:border-hairline/20 transition-colors cursor-pointer"
                whileHover={{ scale: 1.05 }}
              >
                {sector}
              </motion.span>
            ))}
          </motion.div>
        </div>

        {/* Right: heat + sentiment */}
        <div className="flex flex-col items-start sm:items-end gap-3 shrink-0">
          {/* Heat score */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="flex items-center gap-3"
          >
            <div className="flex items-center gap-2">
              {getHeatIcon(stock.sc)}
              <span
                className="text-4xl font-bold tabular-nums"
                style={{ color: getHeatColor(stock.sc) }}
              >
                {stock.sc}
              </span>
            </div>
            <span
              className="text-xs font-medium px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: getHeatColor(stock.sc) + '20',
                color: getHeatColor(stock.sc),
              }}
            >
              {getHeatLabel(stock.sc)}
            </span>
          </motion.div>

          {/* Bull/Bear badge */}
          <div className="flex items-center gap-2">
            <span
              className="text-xs font-medium px-2.5 py-1 rounded-md flex items-center gap-1"
              style={{ backgroundColor: sentimentColor + '20', color: sentimentColor }}
            >
              {stock.bu > stock.be ? <TrendingUp size={12} /> : stock.be > stock.bu ? <TrendingDown size={12} /> : <Minus size={12} />}
              {sentimentLabel}
            </span>
            <span className="text-xs text-ink-tertiary">
              看多 {stock.bu} : {stock.be} 看空
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Heat Score History Chart                                           */
/* ------------------------------------------------------------------ */

function HeatScoreHistory({ stockCode }: { stockCode: string }) {
  const snapshots = useStore((s) => s.currentDayData?.snapshots ?? []);
  const heatData = useMemo(() => {
    return snapshots.map((snap, i) => {
      for (let j = 0; j < snap.stk.length; j++) {
        if (snap.stk[j].c === stockCode) {
          const stock = snap.stk[j];
          return {
            time: formatTime(snap.t),
            index: i,
            heat: stock.sc,
            rank: j + 1,
            bull: stock.bu,
            bear: stock.be,
          };
        }
      }
      return {
        time: formatTime(snap.t),
        index: i,
        heat: 0,
        rank: null,
        bull: 0,
        bear: 0,
      };
    });
  }, [stockCode, snapshots]);

  const maxHeat = Math.max(...heatData.map((d) => d.heat), 100);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.15 }}
      className="bg-surface-1 border border-hairline/10 rounded-[14px] p-4"
    >
      <h3 className="text-ink-primary font-semibold text-base mb-3 flex items-center gap-2">
        <BarChart3 size={18} className="text-brand-blue" />
        热度历史趋势
      </h3>

      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={heatData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
          <defs>
            <linearGradient id="heatBlueGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0A84FF" stopOpacity={0.4} />
              <stop offset="100%" stopColor="#0A84FF" stopOpacity={0} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke="#28282E" vertical={false} />
          <XAxis dataKey="time" stroke="#5A5A64" tick={{ fill: '#5A5A64', fontSize: 11 }} />
          <YAxis domain={[0, Math.ceil(maxHeat / 10) * 10]} stroke="#5A5A64" tick={{ fill: '#5A5A64', fontSize: 11 }} />

          <Tooltip
            contentStyle={chartTooltipStyle}
            labelStyle={chartTooltipLabelStyle}
            formatter={(value: number, name: string) => {
              if (name === 'heat') return [value, '热度分'];
              if (name === 'rank') return [value ? `第${value}名` : '未上榜', '排名'];
              return [value, name];
            }}
          />

          {/* Reference lines */}
          <ReferenceLine y={80} stroke="#FF6961" strokeDasharray="4 4" strokeOpacity={0.4} label={{ value: '80', fill: '#FF6961', fontSize: 10, position: 'right' }} />
          <ReferenceLine y={60} stroke="#FF9F0A" strokeDasharray="4 4" strokeOpacity={0.4} label={{ value: '60', fill: '#FF9F0A', fontSize: 10, position: 'right' }} />

          <Area
            type="monotone"
            dataKey="heat"
            stroke="#0A84FF"
            strokeWidth={2.5}
            fill="url(#heatBlueGrad)"
            dot={{ r: 3, fill: '#0A84FF', strokeWidth: 0 }}
            activeDot={{ r: 6, fill: '#0A84FF', stroke: '#fff', strokeWidth: 2 }}
            animationDuration={1000}
          />
        </AreaChart>
      </ResponsiveContainer>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Bull / Bear Analysis                                               */
/* ------------------------------------------------------------------ */

function BullBearAnalysis({ stock }: { stock: StockItem }) {
  const total = stock.bu + stock.be;
  const bullPct = total > 0 ? (stock.bu / total) * 100 : 0;
  const bearPct = total > 0 ? (stock.be / total) * 100 : 0;
  const sentiment = getSentimentLabel(stock.bu, stock.be);
  const sentimentColor = stock.bu > stock.be ? '#30D158' : stock.be > stock.bu ? '#FF453A' : '#FFD60A';

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2 }}
      className="bg-surface-1 border border-hairline/10 rounded-[14px] p-5"
    >
      <h3 className="text-ink-primary font-semibold text-base mb-4 flex items-center gap-2">
        <TrendingUp size={18} className="text-brand-green" />
        多空力量对比
      </h3>

      <div className="flex items-center justify-between mb-4">
        <div className="text-center">
          <div className="flex items-center gap-1.5 text-brand-green mb-1">
            <TrendingUp size={18} />
            <span className="text-sm font-medium">看多</span>
          </div>
          <motion.span
            className="text-2xl font-bold text-brand-green tabular-nums"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            {stock.bu}
          </motion.span>
        </div>

        <div className="text-ink-quaternary text-sm font-medium">vs</div>

        <div className="text-center">
          <div className="flex items-center gap-1.5 text-brand-red mb-1">
            <TrendingDown size={18} />
            <span className="text-sm font-medium">看空</span>
          </div>
          <motion.span
            className="text-2xl font-bold text-brand-red tabular-nums"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35 }}
          >
            {stock.be}
          </motion.span>
        </div>
      </div>

      {/* Stacked bar */}
      <div className="relative h-3 rounded-full overflow-hidden bg-surface-2 mb-3">
        <motion.div
          className="absolute left-0 top-0 h-full bg-brand-green rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${bullPct}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
        <motion.div
          className="absolute top-0 h-full bg-brand-red rounded-full"
          initial={{ width: 0, left: 0 }}
          animate={{ width: `${bearPct}%`, left: `${bullPct}%` }}
          transition={{ duration: 0.8, ease: 'easeOut', delay: 0.1 }}
        />
      </div>

      <div className="flex justify-between text-xs text-ink-tertiary mb-4">
        <span>{bullPct.toFixed(0)}% 看多</span>
        <span>{bearPct.toFixed(0)}% 看空</span>
      </div>

      {/* Sentiment verdict */}
      <div className="pt-3 border-t border-hairline/10">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm text-ink-secondary">情绪倾向:</span>
          <span className="text-base font-semibold" style={{ color: sentimentColor }}>
            {sentiment}
          </span>
        </div>
        <p className="text-sm text-ink-tertiary">
          {stock.bu > stock.be
            ? '多头情绪占主导，建议持续跟踪'
            : stock.be > stock.bu
              ? '空头情绪占主导，注意风险控制'
              : '多空分歧较大，保持观望'}
        </p>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Related Sectors                                                    */
/* ------------------------------------------------------------------ */

function RelatedSectors({ sectors }: { sectors: string[] }) {
  const currentSnapshot = useStore((s) => s.currentSnapshot);
  const sectorData = useMemo(() => {
    const allSectors = currentSnapshot?.sec ?? [];
    return sectors
      .map((name) => {
        const sec = allSectors.find((s) => s.n === name);
        return {
          name,
          score: sec?.sc ?? 50,
          trend: sec ? (sec.sc > 100 ? 'up' as const : sec.sc > 50 ? 'flat' as const : 'down' as const) : 'flat' as const,
        };
      })
      .sort((a, b) => b.score - a.score);
  }, [sectors, currentSnapshot]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.3 }}
      className="bg-surface-1 border border-hairline/10 rounded-[14px] p-5"
    >
      <h3 className="text-ink-primary font-semibold text-base mb-4 flex items-center gap-2">
        <Layers size={18} className="text-brand-purple" />
        关联板块
      </h3>

      <div className="space-y-3">
        {sectorData.map((sec, i) => (
          <motion.div
            key={sec.name}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.35 + i * 0.05 }}
            className="flex items-center gap-3"
          >
            <Link
              to={`/sectors?highlight=${encodeURIComponent(sec.name)}`}
              className="px-2.5 py-1 rounded-md bg-surface-2 text-brand-blue text-xs font-medium border border-hairline/10 hover:border-hairline/20 transition-colors shrink-0"
            >
              {sec.name}
            </Link>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium text-ink-primary tabular-nums">{sec.score}</span>
                {sec.trend === 'up' ? (
                  <ArrowUp size={12} className="text-brand-green" />
                ) : sec.trend === 'down' ? (
                  <ArrowDown size={12} className="text-brand-red" />
                ) : (
                  <Minus size={12} className="text-ink-tertiary" />
                )}
              </div>
              <div className="h-1 rounded-full bg-surface-2 overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-brand-blue"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, (sec.score / 200) * 100)}%` }}
                  transition={{ duration: 0.6, delay: 0.4 + i * 0.05 }}
                />
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Group Messages (Accordion)                                         */
/* ------------------------------------------------------------------ */

function GroupMessages({ groups }: { groups: Array<{ g: string; c: number; m: Array<{ t: string; x: string }> }> }) {
  const [openGroups, setOpenGroups] = useState<Set<number>>(new Set([0]));

  const toggleGroup = useCallback((idx: number) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  }, []);

  if (groups.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-surface-1 border border-hairline/10 rounded-[14px] p-8 text-center"
      >
        <MessageCircle size={32} className="text-ink-quaternary mx-auto mb-3" />
        <p className="text-ink-tertiary text-sm">暂无群消息数据</p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.35 }}
      className="bg-surface-1 border border-hairline/10 rounded-[14px] overflow-hidden"
    >
      <div className="p-4 pb-2 border-b border-hairline/10">
        <h3 className="text-ink-primary font-semibold text-base flex items-center gap-2">
          <MessageCircle size={18} className="text-brand-blue" />
          群消息溯源
          <span className="text-xs font-normal text-ink-tertiary">({groups.reduce((sum, g) => sum + g.c, 0)} 条消息)</span>
        </h3>
      </div>

      <div className="divide-y divide-[#28282E]">
        {groups.map((group, gi) => {
          const isOpen = openGroups.has(gi);

          return (
            <motion.div
              key={gi}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 + gi * 0.08 }}
            >
              {/* Group header */}
              <button
                onClick={() => toggleGroup(gi)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-2/50 transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <MessageCircle size={15} className="text-ink-tertiary shrink-0" />
                  <span className="text-sm text-ink-primary truncate">{group.g}</span>
                  <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-surface-2 text-ink-tertiary text-xs tabular-nums">
                    {group.c} 条
                  </span>
                </div>
                <motion.div
                  animate={{ rotate: isOpen ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                  className="shrink-0 text-ink-tertiary"
                >
                  <ChevronDown size={16} />
                </motion.div>
              </button>

              {/* Messages */}
              <AnimatePresence>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.9] as [number, number, number, number] }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-3 space-y-0">
                      {group.m.map((msg, mi) => (
                        <motion.div
                          key={mi}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: mi * 0.03 }}
                          className="flex items-start gap-3 py-2.5 border-l-2 border-hairline/10 hover:border-brand-blue hover:bg-surface-2/50 pl-3 transition-colors rounded-r-md"
                        >
                          <span className="text-[11px] font-mono text-ink-tertiary shrink-0 w-10 pt-0.5">
                            {msg.t}
                          </span>
                          <p className="flex-1 min-w-0 text-sm text-ink-primary leading-relaxed whitespace-pre-wrap break-words">
                            {msg.x}
                          </p>
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Stock Comparison (Same Sector)                                     */
/* ------------------------------------------------------------------ */

function StockComparison({ currentStock }: { currentStock: StockItem }) {
  const navigate = useNavigate();
  const currentSnapshot = useStore((s) => s.currentSnapshot);

  // Find other stocks that share at least one sector
  const relatedStocks = useMemo(() => {
    const currentSectors = new Set(currentStock.sec);
    const allStocks = currentSnapshot?.stk ?? [];
    return allStocks
      .filter((s) => s.c !== currentStock.c && s.sec.some((sec) => currentSectors.has(sec)))
      .slice(0, 5);
  }, [currentStock, currentSnapshot]);

  if (relatedStocks.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.4 }}
      className="bg-surface-1 border border-hairline/10 rounded-[14px] p-4 overflow-x-auto"
    >
      <h3 className="text-ink-primary font-semibold text-base mb-3 flex items-center gap-2">
        <BarChart3 size={18} className="text-brand-cyan" />
        同板块股票对比
      </h3>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-ink-tertiary text-xs uppercase bg-surface-2">
            <th className="text-left px-3 py-2 rounded-l-md">股票</th>
            <th className="text-right px-3 py-2">热度</th>
            <th className="text-right px-3 py-2">提及</th>
            <th className="text-right px-3 py-2">群数</th>
            <th className="text-right px-3 py-2 rounded-r-md">多空</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#28282E]">
          {/* Current stock */}
          <tr className="bg-surface-3/50">
            <td className="px-3 py-2.5">
              <div className="flex items-center gap-2">
                <div className="w-0.5 h-5 bg-brand-blue rounded-full" />
                <div>
                  <span className="text-ink-primary font-medium">{currentStock.n}</span>
                  <span className="text-ink-tertiary text-xs ml-1.5 font-mono">{currentStock.c}</span>
                </div>
              </div>
            </td>
            <td className="px-3 py-2.5 text-right">
              <span className="font-semibold tabular-nums" style={{ color: getHeatColor(currentStock.sc) }}>
                {currentStock.sc}
              </span>
            </td>
            <td className="px-3 py-2.5 text-right text-ink-secondary tabular-nums">{currentStock.mc}</td>
            <td className="px-3 py-2.5 text-right text-ink-secondary tabular-nums">{currentStock.gc}</td>
            <td className="px-3 py-2.5 text-right">
              <span className="text-xs">
                <span className="text-brand-green">{currentStock.bu}</span>
                <span className="text-ink-quaternary mx-1">:</span>
                <span className="text-brand-red">{currentStock.be}</span>
              </span>
            </td>
          </tr>

          {/* Other stocks */}
          {relatedStocks.map((stock) => (
            <motion.tr
              key={stock.c}
              className="hover:bg-surface-2/50 cursor-pointer transition-colors"
              onClick={() => navigate(`/stock/${stock.c}`)}
              whileHover={{ x: 2 }}
            >
              <td className="px-3 py-2.5">
                <span className="text-ink-primary">{stock.n}</span>
                <span className="text-ink-tertiary text-xs ml-1.5 font-mono">{stock.c}</span>
              </td>
              <td className="px-3 py-2.5 text-right">
                <span className="font-semibold tabular-nums" style={{ color: getHeatColor(stock.sc) }}>
                  {stock.sc}
                </span>
              </td>
              <td className="px-3 py-2.5 text-right text-ink-secondary tabular-nums">{stock.mc}</td>
              <td className="px-3 py-2.5 text-right text-ink-secondary tabular-nums">{stock.gc}</td>
              <td className="px-3 py-2.5 text-right">
                <span className="text-xs">
                  <span className="text-brand-green">{stock.bu}</span>
                  <span className="text-ink-quaternary mx-1">:</span>
                  <span className="text-brand-red">{stock.be}</span>
                </span>
              </td>
            </motion.tr>
          ))}
        </tbody>
      </table>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Group messages: on-demand fetch + in-memory cache                  */
/* ------------------------------------------------------------------ */

type GroupShape = { g: string; c: number; m: Array<{ t: string; x: string }> };

// Module-level cache keyed by `${date}|${code}` so navigating away and back
// doesn't refetch. Stays small (one entry per stock the user actually opens).
const _groupMessagesCache = new Map<string, GroupShape[]>();

async function loadGroupMessages(date: string, code: string): Promise<GroupShape[]> {
  const key = `${date}|${code}`;
  const cached = _groupMessagesCache.get(key);
  if (cached) return cached;
  const raw = await fetchStockMessages(date, code);
  const shaped: GroupShape[] = raw.map((g) => ({
    g: g.group,
    c: g.messages.length,
    m: g.messages.map((m) => ({ t: m.time, x: m.text })),
  }));
  _groupMessagesCache.set(key, shaped);
  return shaped;
}

/* ------------------------------------------------------------------ */
/*  Main Stock Detail Page                                             */
/* ------------------------------------------------------------------ */

export default function StockDetail() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const latestSnapshot = useStore((s) => s.latestSnapshot);
  const currentSnapshot = useStore((s) => s.currentSnapshot);
  const currentDate = useStore((s) => s.currentDate);
  const dayFullLoaded = useStore((s) => s.dayFullLoaded);
  const loadDayFull = useStore((s) => s.loadDayFull);
  const snapshots = useStore((s) => s.currentDayData?.snapshots ?? []);

  const [groups, setGroups] = useState<GroupShape[]>([]);
  const [gmLoading, setGmLoading] = useState(false);
  const [gmError, setGmError] = useState<string | null>(null);

  useEffect(() => {
    if (!dayFullLoaded) loadDayFull();
  }, [dayFullLoaded, loadDayFull]);

  // Fetch group messages on demand. The compressed snapshot no longer carries
  // the `gd` field (>90% of payload), so we hit /api/stock-messages instead.
  useEffect(() => {
    if (!code || !currentDate) {
      setGroups([]);
      return;
    }
    let cancelled = false;
    setGmLoading(true);
    setGmError(null);
    loadGroupMessages(currentDate, code)
      .then((result) => {
        if (!cancelled) setGroups(result);
      })
      .catch((err) => {
        if (!cancelled) {
          setGmError(err instanceof Error ? err.message : String(err));
          setGroups([]);
        }
      })
      .finally(() => {
        if (!cancelled) setGmLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [code, currentDate]);

  // Find the stock from the current or latest snapshot
  const stock = useMemo(() => {
    if (!code) return null;
    const snap = currentSnapshot ?? latestSnapshot;
    return snap?.stk.find((s) => s.c === code) ?? null;
  }, [code, currentSnapshot, latestSnapshot]);

  if (!code || !stock) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center min-h-[50vh] text-center"
      >
        <div className="w-20 h-20 rounded-full bg-surface-2 flex items-center justify-center mb-6">
          <BarChart3 size={36} className="text-ink-quaternary" />
        </div>
        <h1 className="text-xl font-semibold text-ink-primary mb-2">未找到股票</h1>
        <p className="text-ink-tertiary text-sm mb-6">股票代码 {code} 暂无热度数据</p>
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 px-4 py-2 bg-surface-2 hover:bg-surface-3 text-ink-secondary hover:text-ink-primary rounded-[10px] text-sm font-medium transition-colors border border-hairline/20"
        >
          <ChevronLeft size={16} />
          返回 Dashboard
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-4"
    >
      {/* 全量数据加载提示 */}
      {!dayFullLoaded && snapshots.length <= 1 && (
        <div className="flex items-center gap-2 text-xs text-ink-tertiary">
          <div className="w-4 h-4 border-2 border-brand-blue border-t-transparent rounded-full animate-spin" />
          正在加载完整时间序列数据…
        </div>
      )}

      {/* Stock Header */}
      <StockHeader stock={stock} />

      {/* Heat Score History */}
      <HeatScoreHistory stockCode={code} />

      {/* Bull/Bear + Related Sectors */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BullBearAnalysis stock={stock} />
        <RelatedSectors sectors={stock.sec} />
      </div>

      {/* Group Messages */}
      {gmLoading ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-surface-1 border border-hairline/10 rounded-[14px] p-8"
        >
          <div className="flex items-center justify-center gap-2 text-ink-tertiary text-sm">
            <div className="w-4 h-4 border-2 border-brand-blue border-t-transparent rounded-full animate-spin" />
            正在加载群消息…
          </div>
        </motion.div>
      ) : gmError ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-surface-1 border border-hairline/10 rounded-[14px] p-8 text-center"
        >
          <MessageCircle size={32} className="text-ink-quaternary mx-auto mb-3" />
          <p className="text-ink-tertiary text-sm">群消息加载失败：{gmError}</p>
        </motion.div>
      ) : (
        <GroupMessages groups={groups} />
      )}

      {/* Stock Comparison */}
      <StockComparison currentStock={stock} />
    </motion.div>
  );
}
