import { useState, useMemo, useCallback, useEffect } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
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
  ArrowLeft,
  Users,
  History,
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
import { fetchStockMessages, fetchPalaceStock, fetchPalaceStockOpinions } from '@/lib/api';
import type { StockItem, PalaceStockDetail, PalaceStockOpinionsResponse } from '@/types/api';
import { FOCUS_RING, ROW_GRID, biasText, splitGroupName } from '@/lib/palace';
import { cleanMessageText, dedupeNearDuplicates } from '@/lib/messageText';
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
        返回仪表盘
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
  // 选择器必须返回稳定引用：`?? []` 每次给新数组，会让 useSyncExternalStore 无限重渲染
  const rawSnapshots = useStore((s) => s.currentDayData?.snapshots);
  const snapshots = useMemo(() => rawSnapshots ?? [], [rawSnapshots]);
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

      <div className="flex justify-between text-xs text-ink-tertiary mb-1">
        <span>{bullPct.toFixed(0)}% 看多</span>
        <span>{bearPct.toFixed(0)}% 看空</span>
      </div>

      {/* 百分比的分母是「带多空标记的条数」，不是全部提及——把口径和当日总量都
          摆出来，别让人把「3 条看多」读成「22 条都在看多」。一条消息可能同时带
          多空两个标记，两数之和未必小于总提及数，所以说成「其中 X 条」会是错的。 */}
      <p className="text-xs text-ink-quaternary mb-4 tabular-nums">
        占比按带多空标记的提及计算 · 当日共 {stock.mc} 条提及
      </p>

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

function RelatedSectors({ sectors, mentionSectors }: { sectors: string[]; mentionSectors: string[] }) {
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
        所属板块
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
        {mentionSectors.length > 0 && (
          <div className="pt-3 mt-1 border-t border-hairline/10">
            <p className="text-xs text-ink-tertiary mb-2">消息关联板块（该消息整体涉及的题材）</p>
            <div className="flex flex-wrap gap-2">
              {mentionSectors.map((s) => (
                <span
                  key={s}
                  className="px-2.5 py-1 rounded-md bg-surface-2 text-ink-secondary text-xs font-medium border border-hairline/10"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}
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
                      {group.m.filter((m) => cleanMessageText(m.x).length > 0).map((msg, mi) => (
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
                            {cleanMessageText(msg.x)}
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

/* ---- 大V 观点（Mind Palace）---- */

/** 取该票的跨群观点。提到页面层是因为「不在当日热度榜」的分支也要用股票名。 */
function usePalaceStock(code: string | undefined) {
  const [data, setData] = useState<PalaceStockDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!code) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchPalaceStock(code)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  return { data, loading };
}

function PalaceStockSection({ code, data, loading }: {
  code: string;
  data: PalaceStockDetail | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div role="status" aria-live="polite"
           className="bg-surface-1 border border-hairline/10 rounded-[14px] p-5">
        <span className="sr-only">正在加载大V 观点…</span>
        <div className="h-4 w-32 bg-surface-2 rounded mb-3 animate-pulse" />
        <div className="h-3 w-full bg-surface-2 rounded mb-2 animate-pulse" />
        <div className="h-3 w-2/3 bg-surface-2 rounded animate-pulse" />
      </div>
    );
  }

  // 后端 404 / 索引缺失都走这里：如实说明，不留白屏
  if (!data || data.groups.length === 0) {
    return (
      <div className="bg-surface-1 border border-hairline/10 rounded-[14px] p-5">
        <h3 className="text-ink-primary font-semibold text-base mb-3 flex items-center gap-2">
          <Users size={18} className="text-brand-purple" />
          大V 观点
        </h3>
        <p className="text-ink-tertiary text-xs">
          还没有大V 讨论过这只票。观点来自接入的 25 个付费群，需要先跑完回补与索引。
        </p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.45 }}
      className="bg-surface-1 border border-hairline/10 rounded-[14px] p-4"
    >
      <h3 className="text-ink-primary font-semibold text-base mb-3 flex items-center gap-2">
        <Users size={18} className="text-brand-purple" />
        大V 观点
        <span className="text-ink-tertiary text-xs font-normal tabular-nums">
          {data.group_count} 个群讨论过 · 共 {data.total_mentions} 条
        </span>
      </h3>

      <div className={`${ROW_GRID} pb-2 mb-1 border-b border-hairline/10 text-ink-tertiary text-[11px]`}>
        <span>大V / 群</span>
        <span>提及</span>
        <span className="max-[1000px]:hidden">多空</span>
        <span>最近操作</span>
        <span className="max-[1000px]:hidden">最近</span>
      </div>

      <div className="flex flex-col">
        {data.groups.map((g) => (
          <Link
            key={g.chat_id}
            to={`/kol/${g.chat_id}/${code}`}
            className={`${ROW_GRID} px-2 py-2.5 rounded-md hover:bg-surface-2
                        transition-colors ${FOCUS_RING}`}
          >
            <span className="text-ink-primary text-[13px] truncate">{g.name}</span>
            <span className="text-ink-secondary text-[13px] tabular-nums">{g.count}</span>
            <span className="text-[12px] tabular-nums max-[1000px]:hidden">
              <b className="text-brand-green font-medium">+{g.bull}</b>
              <i className="text-brand-red font-normal not-italic ml-1">−{g.bear}</i>
              <span className="text-ink-tertiary ml-1.5">{biasText(g.bull, g.bear)}</span>
            </span>
            <span className="flex flex-wrap gap-1">
              {g.actions.slice(0, 2).map((a) => (
                <span key={a} className="px-1.5 py-0.5 rounded bg-surface-3 text-ink-secondary text-[10.5px]">
                  {a}
                </span>
              ))}
            </span>
            <span className="text-ink-tertiary text-[11px] tabular-nums max-[1000px]:hidden">
              {g.last_ts.slice(5, 10) || '—'}
            </span>
          </Link>
        ))}
      </div>

      <p className="text-ink-tertiary text-[11px] mt-3">
        覆盖 {data.first_ts.slice(0, 10) || '—'} → {data.last_ts.slice(0, 10) || '—'}
      </p>
    </motion.div>
  );
}

/* ---- 历史讨论：跨群观点正文时间线 ---- */

/** 首屏条数；「加载更多」每次翻倍（最热的票有 500+ 条，一次渲染太重）。 */
const OPINIONS_PAGE = 30;

function HistoryDiscussion({ code }: { code: string }) {
  const [data, setData] = useState<PalaceStockOpinionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(OPINIONS_PAGE);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setData(null);
    setLimit(OPINIONS_PAGE);
    fetchPalaceStockOpinions(code)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  const opinions = useMemo(
    () => dedupeNearDuplicates(data?.opinions ?? []),
    [data?.opinions],
  );

  if (loading) {
    return (
      <div role="status" aria-live="polite"
           className="bg-surface-1 border border-hairline/10 rounded-[14px] p-5">
        <span className="sr-only">正在加载历史讨论…</span>
        <div className="h-4 w-24 bg-surface-2 rounded mb-3 animate-pulse" />
        <div className="h-16 w-full bg-surface-2 rounded mb-2 animate-pulse" />
        <div className="h-16 w-full bg-surface-2 rounded animate-pulse" />
      </div>
    );
  }

  if (opinions.length === 0) {
    return (
      <div className="bg-surface-1 border border-hairline/10 rounded-[14px] p-5">
        <h3 className="text-ink-primary font-semibold text-base mb-3 flex items-center gap-2">
          <History size={18} className="text-brand-cyan" />
          历史讨论
        </h3>
        <p className="text-ink-tertiary text-xs">
          还没有大V 讨论过这只票。观点来自接入的 25 个付费群，需要先跑完回补与索引。
        </p>
      </div>
    );
  }

  const shown = opinions.slice(0, limit);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.5 }}
      className="bg-surface-1 border border-hairline/10 rounded-[14px] p-4"
    >
      <h3 className="text-ink-primary font-semibold text-base mb-3 flex items-center gap-2">
        <History size={18} className="text-brand-cyan" />
        历史讨论
        <span className="text-ink-tertiary text-xs font-normal tabular-nums">
          {data?.group_count ?? 0} 个群 · 共 {data?.total_mentions ?? opinions.length} 条
        </span>
      </h3>

      <div className="flex flex-col gap-3">
        {shown.map((o, i) => {
          const { no, label } = splitGroupName(o.group);
          return (
            <div key={`${o.chat_id}-${o.id}-${i}`} className="grid grid-cols-[76px_1fr] gap-3">
              <div className="text-ink-tertiary text-[11px] tabular-nums pt-1">
                {o.ts.slice(5, 16)}
              </div>
              <div className="rounded-[10px] bg-surface-2 border border-hairline/10 p-3 min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1.5">
                  <Link
                    to={`/kol/${o.chat_id}/${code}`}
                    className={`text-[11px] text-brand-blue hover:underline ${FOCUS_RING}`}
                  >
                    {no && <span className="text-ink-tertiary mr-1 tabular-nums">{no}</span>}
                    {label}
                  </Link>
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
                <p className="text-ink-secondary text-xs leading-relaxed whitespace-pre-wrap break-words">
                  {cleanMessageText(o.text)}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {opinions.length > shown.length && (
        <div className="pt-4 mt-1 border-t border-hairline/10 text-center">
          <button
            type="button"
            onClick={() => setLimit((n) => n * 2)}
            className={`px-4 py-1.5 rounded-md bg-surface-2 text-ink-secondary text-xs
                        hover:text-ink-primary transition-colors ${FOCUS_RING}`}
          >
            加载更多（还有 {opinions.length - shown.length} 条）
          </button>
          <p className="text-ink-tertiary text-[11px] mt-2 tabular-nums">
            已显示 {shown.length} / {opinions.length}
          </p>
        </div>
      )}
    </motion.div>
  );
}

export default function StockDetail() {
  const { code } = useParams<{ code: string }>();
  const [searchParams] = useSearchParams();
  const from = searchParams.get('from');
  const navigate = useNavigate();
  const latestSnapshot = useStore((s) => s.latestSnapshot);
  const currentSnapshot = useStore((s) => s.currentSnapshot);
  const currentDate = useStore((s) => s.currentDate);
  const dayFullLoaded = useStore((s) => s.dayFullLoaded);
  const loadDayFull = useStore((s) => s.loadDayFull);
  // 选择器必须返回稳定引用：`?? []` 每次给新数组，会让 useSyncExternalStore 无限重渲染
  const rawSnapshots = useStore((s) => s.currentDayData?.snapshots);
  const snapshots = useMemo(() => rawSnapshots ?? [], [rawSnapshots]);

  const [groups, setGroups] = useState<GroupShape[]>([]);
  const [gmLoading, setGmLoading] = useState(false);
  const [gmError, setGmError] = useState<string | null>(null);

  // 必须无条件调用（在下面的提前 return 之前），否则违反 hooks 规则
  const palace = usePalaceStock(code);

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
    const pd = palace.data;
    // 该票不在当日热度快照里。宫殿认识它时这里不是死路——渲染只含「大V 观点」的股票页。
    if (code && palace.loading) {
      return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          <div className="h-7 w-40 bg-surface-2 rounded animate-pulse" />
          <div className="h-24 w-full bg-surface-1 border border-hairline/10 rounded-[14px] animate-pulse" />
        </motion.div>
      );
    }
    if (code && pd && pd.groups.length > 0) {
      return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              aria-label="返回 Dashboard"
              className="w-9 h-9 shrink-0 rounded-full bg-surface-2 hover:bg-surface-3 flex items-center justify-center text-ink-secondary hover:text-ink-primary transition-colors border border-hairline/20"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold text-ink-primary truncate">
                {pd.name || code}
              </h1>
              <p className="text-ink-tertiary text-xs mt-0.5">
                {pd.name ? `${code} · ` : ''}该票不在当日热度榜中，以下为付费群的历史观点
              </p>
            </div>
          </div>

          {from && (
            <Link
              to={`/kol/${from}/${code}`}
              className={`inline-flex items-center gap-1.5 text-brand-blue text-xs ${FOCUS_RING}`}
            >
              <ArrowLeft size={13} /> 回到该大V 的观点
            </Link>
          )}

          <PalaceStockSection code={code} data={pd} loading={false} />
          <HistoryDiscussion code={code} />
        </motion.div>
      );
    }
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
          返回仪表盘
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
        <RelatedSectors sectors={stock.sec} mentionSectors={stock.ms ?? []} />
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

      {/* 从大V 详情跳来时的回程入口（spec §9.5 第 2 条） */}
      {from && code && (
        <Link
          to={`/kol/${from}/${code}`}
          className={`inline-flex items-center gap-1.5 text-brand-blue text-xs ${FOCUS_RING}`}
        >
          <ArrowLeft size={13} /> 回到该大V 的观点
        </Link>
      )}

      {/* 大V 观点（Mind Palace） */}
      {code && <PalaceStockSection code={code} data={palace.data} loading={palace.loading} />}

      {/* 历史讨论：跨群观点正文时间线 */}
      {code && <HistoryDiscussion code={code} />}
    </motion.div>
  );
}
