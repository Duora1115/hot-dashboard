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

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const formatTime = (t: string) => t.split(' ')[1] ?? t;

const getHeatColor = (sc: number) => {
  if (sc >= 80) return '#EF4444';
  if (sc >= 60) return '#F59E0B';
  return '#10B981';
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
  const sentimentColor = stock.bu > stock.be ? '#00E396' : stock.be > stock.bu ? '#FF4560' : '#FBBF24';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.9] as [number, number, number, number] }}
      className="relative bg-[#111827] border border-[#1E293B] rounded-[14px] p-5 overflow-hidden"
    >
      {/* Top gradient line */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[#3B82F6] to-transparent" />

      {/* Back button */}
      <motion.button
        onClick={() => navigate('/')}
        className="flex items-center gap-1 text-[#64748B] hover:text-[#F1F5F9] text-sm mb-4 transition-colors"
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
            className="text-3xl sm:text-4xl font-bold text-[#F1F5F9] tracking-tight"
          >
            {stock.n}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.35, delay: 0.05 }}
            className="text-lg font-mono text-[#3B82F6] mt-1"
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
                className="inline-flex items-center px-2.5 py-1 rounded-md bg-[#1A2332] text-[#3B82F6] text-xs font-medium border border-[#1E293B] hover:border-[#334155] transition-colors cursor-pointer"
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
            <span className="text-xs text-[#64748B]">
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
      className="bg-[#111827] border border-[#1E293B] rounded-[14px] p-4"
    >
      <h3 className="text-[#F1F5F9] font-semibold text-base mb-3 flex items-center gap-2">
        <BarChart3 size={18} className="text-[#3B82F6]" />
        热度历史趋势
      </h3>

      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={heatData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
          <defs>
            <linearGradient id="heatBlueGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.4} />
              <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
          <XAxis dataKey="time" stroke="#475569" tick={{ fill: '#475569', fontSize: 11 }} />
          <YAxis domain={[0, Math.ceil(maxHeat / 10) * 10]} stroke="#475569" tick={{ fill: '#475569', fontSize: 11 }} />

          <Tooltip
            contentStyle={{
              backgroundColor: '#1A2332',
              border: '1px solid #334155',
              borderRadius: '10px',
              fontSize: '12px',
            }}
            labelStyle={{ color: '#94A3B8' }}
            formatter={(value: number, name: string) => {
              if (name === 'heat') return [value, '热度分'];
              if (name === 'rank') return [value ? `第${value}名` : '未上榜', '排名'];
              return [value, name];
            }}
          />

          {/* Reference lines */}
          <ReferenceLine y={80} stroke="#EF4444" strokeDasharray="4 4" strokeOpacity={0.4} label={{ value: '80', fill: '#EF4444', fontSize: 10, position: 'right' }} />
          <ReferenceLine y={60} stroke="#F59E0B" strokeDasharray="4 4" strokeOpacity={0.4} label={{ value: '60', fill: '#F59E0B', fontSize: 10, position: 'right' }} />

          <Area
            type="monotone"
            dataKey="heat"
            stroke="#3B82F6"
            strokeWidth={2.5}
            fill="url(#heatBlueGrad)"
            dot={{ r: 3, fill: '#3B82F6', strokeWidth: 0 }}
            activeDot={{ r: 6, fill: '#3B82F6', stroke: '#fff', strokeWidth: 2 }}
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
  const sentimentColor = stock.bu > stock.be ? '#00E396' : stock.be > stock.bu ? '#FF4560' : '#FBBF24';

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2 }}
      className="bg-[#111827] border border-[#1E293B] rounded-[14px] p-5"
    >
      <h3 className="text-[#F1F5F9] font-semibold text-base mb-4 flex items-center gap-2">
        <TrendingUp size={18} className="text-[#00E396]" />
        多空力量对比
      </h3>

      <div className="flex items-center justify-between mb-4">
        <div className="text-center">
          <div className="flex items-center gap-1.5 text-[#00E396] mb-1">
            <TrendingUp size={18} />
            <span className="text-sm font-medium">看多</span>
          </div>
          <motion.span
            className="text-2xl font-bold text-[#00E396] tabular-nums"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            {stock.bu}
          </motion.span>
        </div>

        <div className="text-[#475569] text-sm font-medium">vs</div>

        <div className="text-center">
          <div className="flex items-center gap-1.5 text-[#FF4560] mb-1">
            <TrendingDown size={18} />
            <span className="text-sm font-medium">看空</span>
          </div>
          <motion.span
            className="text-2xl font-bold text-[#FF4560] tabular-nums"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35 }}
          >
            {stock.be}
          </motion.span>
        </div>
      </div>

      {/* Stacked bar */}
      <div className="relative h-3 rounded-full overflow-hidden bg-[#1A2332] mb-3">
        <motion.div
          className="absolute left-0 top-0 h-full bg-[#00E396] rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${bullPct}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
        <motion.div
          className="absolute top-0 h-full bg-[#FF4560] rounded-full"
          initial={{ width: 0, left: 0 }}
          animate={{ width: `${bearPct}%`, left: `${bullPct}%` }}
          transition={{ duration: 0.8, ease: 'easeOut', delay: 0.1 }}
        />
      </div>

      <div className="flex justify-between text-xs text-[#64748B] mb-4">
        <span>{bullPct.toFixed(0)}% 看多</span>
        <span>{bearPct.toFixed(0)}% 看空</span>
      </div>

      {/* Sentiment verdict */}
      <div className="pt-3 border-t border-[#1E293B]">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm text-[#94A3B8]">情绪倾向:</span>
          <span className="text-base font-semibold" style={{ color: sentimentColor }}>
            {sentiment}
          </span>
        </div>
        <p className="text-sm text-[#64748B]">
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
      className="bg-[#111827] border border-[#1E293B] rounded-[14px] p-5"
    >
      <h3 className="text-[#F1F5F9] font-semibold text-base mb-4 flex items-center gap-2">
        <Layers size={18} className="text-[#8B5CF6]" />
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
              className="px-2.5 py-1 rounded-md bg-[#1A2332] text-[#3B82F6] text-xs font-medium border border-[#1E293B] hover:border-[#334155] transition-colors shrink-0"
            >
              {sec.name}
            </Link>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium text-[#F1F5F9] tabular-nums">{sec.score}</span>
                {sec.trend === 'up' ? (
                  <ArrowUp size={12} className="text-[#00E396]" />
                ) : sec.trend === 'down' ? (
                  <ArrowDown size={12} className="text-[#FF4560]" />
                ) : (
                  <Minus size={12} className="text-[#64748B]" />
                )}
              </div>
              <div className="h-1 rounded-full bg-[#1A2332] overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-[#3B82F6]"
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
        className="bg-[#111827] border border-[#1E293B] rounded-[14px] p-8 text-center"
      >
        <MessageCircle size={32} className="text-[#475569] mx-auto mb-3" />
        <p className="text-[#64748B] text-sm">暂无群消息数据</p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.35 }}
      className="bg-[#111827] border border-[#1E293B] rounded-[14px] overflow-hidden"
    >
      <div className="p-4 pb-2 border-b border-[#1E293B]">
        <h3 className="text-[#F1F5F9] font-semibold text-base flex items-center gap-2">
          <MessageCircle size={18} className="text-[#3B82F6]" />
          群消息溯源
          <span className="text-xs font-normal text-[#64748B]">({groups.reduce((sum, g) => sum + g.c, 0)} 条消息)</span>
        </h3>
      </div>

      <div className="divide-y divide-[#1E293B]">
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
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#1A2332]/50 transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <MessageCircle size={15} className="text-[#64748B] shrink-0" />
                  <span className="text-sm text-[#F1F5F9] truncate">{group.g}</span>
                  <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-[#1A2332] text-[#64748B] text-xs tabular-nums">
                    {group.c} 条
                  </span>
                </div>
                <motion.div
                  animate={{ rotate: isOpen ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                  className="shrink-0 text-[#64748B]"
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
                          className="flex items-start gap-3 py-2.5 border-l-2 border-[#1E293B] hover:border-[#3B82F6] hover:bg-[#1A2332]/50 pl-3 transition-colors rounded-r-md"
                        >
                          <span className="text-[11px] font-mono text-[#64748B] shrink-0 w-10 pt-0.5">
                            {msg.t}
                          </span>
                          <p className="text-sm text-[#F1F5F9] leading-relaxed whitespace-pre-wrap break-words">
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
      className="bg-[#111827] border border-[#1E293B] rounded-[14px] p-4 overflow-x-auto"
    >
      <h3 className="text-[#F1F5F9] font-semibold text-base mb-3 flex items-center gap-2">
        <BarChart3 size={18} className="text-[#06B6D4]" />
        同板块股票对比
      </h3>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-[#64748B] text-xs uppercase bg-[#1A2332]">
            <th className="text-left px-3 py-2 rounded-l-md">股票</th>
            <th className="text-right px-3 py-2">热度</th>
            <th className="text-right px-3 py-2">提及</th>
            <th className="text-right px-3 py-2">群数</th>
            <th className="text-right px-3 py-2 rounded-r-md">多空</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#1E293B]">
          {/* Current stock */}
          <tr className="bg-[#1E293B]/50">
            <td className="px-3 py-2.5">
              <div className="flex items-center gap-2">
                <div className="w-0.5 h-5 bg-[#3B82F6] rounded-full" />
                <div>
                  <span className="text-[#F1F5F9] font-medium">{currentStock.n}</span>
                  <span className="text-[#64748B] text-xs ml-1.5 font-mono">{currentStock.c}</span>
                </div>
              </div>
            </td>
            <td className="px-3 py-2.5 text-right">
              <span className="font-semibold tabular-nums" style={{ color: getHeatColor(currentStock.sc) }}>
                {currentStock.sc}
              </span>
            </td>
            <td className="px-3 py-2.5 text-right text-[#94A3B8] tabular-nums">{currentStock.mc}</td>
            <td className="px-3 py-2.5 text-right text-[#94A3B8] tabular-nums">{currentStock.gc}</td>
            <td className="px-3 py-2.5 text-right">
              <span className="text-xs">
                <span className="text-[#00E396]">{currentStock.bu}</span>
                <span className="text-[#475569] mx-1">:</span>
                <span className="text-[#FF4560]">{currentStock.be}</span>
              </span>
            </td>
          </tr>

          {/* Other stocks */}
          {relatedStocks.map((stock) => (
            <motion.tr
              key={stock.c}
              className="hover:bg-[#1A2332]/50 cursor-pointer transition-colors"
              onClick={() => navigate(`/stock/${stock.c}`)}
              whileHover={{ x: 2 }}
            >
              <td className="px-3 py-2.5">
                <span className="text-[#F1F5F9]">{stock.n}</span>
                <span className="text-[#64748B] text-xs ml-1.5 font-mono">{stock.c}</span>
              </td>
              <td className="px-3 py-2.5 text-right">
                <span className="font-semibold tabular-nums" style={{ color: getHeatColor(stock.sc) }}>
                  {stock.sc}
                </span>
              </td>
              <td className="px-3 py-2.5 text-right text-[#94A3B8] tabular-nums">{stock.mc}</td>
              <td className="px-3 py-2.5 text-right text-[#94A3B8] tabular-nums">{stock.gc}</td>
              <td className="px-3 py-2.5 text-right">
                <span className="text-xs">
                  <span className="text-[#00E396]">{stock.bu}</span>
                  <span className="text-[#475569] mx-1">:</span>
                  <span className="text-[#FF4560]">{stock.be}</span>
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
        <div className="w-20 h-20 rounded-full bg-[#1A2332] flex items-center justify-center mb-6">
          <BarChart3 size={36} className="text-[#475569]" />
        </div>
        <h1 className="text-xl font-semibold text-[#F1F5F9] mb-2">未找到股票</h1>
        <p className="text-[#64748B] text-sm mb-6">股票代码 {code} 暂无热度数据</p>
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 px-4 py-2 bg-[#1A2332] hover:bg-[#1E293B] text-[#94A3B8] hover:text-[#F1F5F9] rounded-[10px] text-sm font-medium transition-colors border border-[#334155]"
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
        <div className="flex items-center gap-2 text-xs text-[#64748B]">
          <div className="w-4 h-4 border-2 border-[#3B82F6] border-t-transparent rounded-full animate-spin" />
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
          className="bg-[#111827] border border-[#1E293B] rounded-[14px] p-8"
        >
          <div className="flex items-center justify-center gap-2 text-[#64748B] text-sm">
            <div className="w-4 h-4 border-2 border-[#3B82F6] border-t-transparent rounded-full animate-spin" />
            正在加载群消息…
          </div>
        </motion.div>
      ) : gmError ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#111827] border border-[#1E293B] rounded-[14px] p-8 text-center"
        >
          <MessageCircle size={32} className="text-[#475569] mx-auto mb-3" />
          <p className="text-[#64748B] text-sm">群消息加载失败：{gmError}</p>
        </motion.div>
      ) : (
        <GroupMessages groups={groups} />
      )}

      {/* Stock Comparison */}
      <StockComparison currentStock={stock} />
    </motion.div>
  );
}
