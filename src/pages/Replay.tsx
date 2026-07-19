import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Gauge,
  Calendar,
  TrendingUp,
  TrendingDown,
  Clock,
  MessageSquare,
  Users,
  BarChart3,
  Layers,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { useStore } from '@/store/useStore';
import type { Snapshot, StockItem, SectorItem } from '@/types/api';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const formatTime = (t: string) => t.split(' ')[1] ?? t;

const getHeatColor = (sc: number) => {
  if (sc >= 80) return '#EF4444';
  if (sc >= 60) return '#F59E0B';
  return '#10B981';
};

const actionCategory = (label: string) => {
  if (label === '买入信号' || ['买', '加仓', '建仓', '上车', '抄底'].includes(label)) return 'buy';
  if (label === '卖出信号' || ['卖', '减仓', '清仓', '割肉', '打板', '取关'].includes(label)) return 'sell';
  if (label === '持有建议' || ['持有'].includes(label)) return 'hold';
  if (label === '风险提示' || ['风险'].includes(label)) return 'risk';
  return 'risk';
};

/* ------------------------------------------------------------------ */
/*  Mini KPI Bar                                                       */
/* ------------------------------------------------------------------ */

function MiniKPI({ snapshot }: { snapshot: Snapshot }) {
  const total = snapshot.sd.bu + snapshot.sd.ne + snapshot.sd.be;
  const bullPct = total > 0 ? (snapshot.sd.bu / total) * 100 : 0;
  const neuPct = total > 0 ? (snapshot.sd.ne / total) * 100 : 0;
  const bearPct = total > 0 ? (snapshot.sd.be / total) * 100 : 0;

  return (
    <motion.div
      initial={{ y: -10, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.9] as [number, number, number, number] }}
      className="flex items-center justify-between px-3 py-2 bg-[#111827] border-b border-[#1E293B] rounded-t-[14px]"
    >
      <div className="flex items-center gap-3 md:gap-5 overflow-x-auto">
        {/* Messages */}
        <div className="flex items-center gap-1.5 shrink-0">
          <MessageSquare size={14} className="text-[#64748B]" />
          <span className="text-[#F1F5F9] text-sm font-medium tabular-nums">
            {snapshot.msg.toLocaleString()}
          </span>
          <span className="text-[#64748B] text-xs hidden sm:inline">msg</span>
        </div>

        {/* Groups */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Users size={14} className="text-[#64748B]" />
          <span className="text-[#06B6D4] text-sm font-medium tabular-nums">
            {snapshot.grp}
          </span>
          <span className="text-[#64748B] text-xs hidden sm:inline">grps</span>
        </div>

        {/* Stocks */}
        <div className="flex items-center gap-1.5 shrink-0">
          <BarChart3 size={14} className="text-[#64748B]" />
          <span className="text-[#F1F5F9] text-sm font-medium tabular-nums">
            {snapshot.stk.length}
          </span>
          <span className="text-[#64748B] text-xs hidden sm:inline">stocks</span>
        </div>

        {/* Sectors */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Layers size={14} className="text-[#64748B]" />
          <span className="text-[#F1F5F9] text-sm font-medium tabular-nums">
            {snapshot.sec.length}
          </span>
          <span className="text-[#64748B] text-xs hidden sm:inline">sectors</span>
        </div>

        {/* Mini sentiment bar */}
        <div className="hidden md:flex items-center gap-2 shrink-0">
          <div className="flex w-[120px] h-[6px] rounded-full overflow-hidden bg-[#1A2332]">
            <motion.div
              className="h-full bg-[#00E396]"
              initial={{ width: 0 }}
              animate={{ width: `${bullPct}%` }}
              transition={{ type: 'spring', stiffness: 200, damping: 25 }}
            />
            <motion.div
              className="h-full bg-[#FBBF24]"
              initial={{ width: 0 }}
              animate={{ width: `${neuPct}%` }}
              transition={{ type: 'spring', stiffness: 200, damping: 25 }}
            />
            <motion.div
              className="h-full bg-[#FF4560]"
              initial={{ width: 0 }}
              animate={{ width: `${bearPct}%` }}
              transition={{ type: 'spring', stiffness: 200, damping: 25 }}
            />
          </div>
        </div>
      </div>

      {/* Time */}
      <div className="flex items-center gap-1.5 shrink-0 ml-3">
        <Clock size={14} className="text-[#06B6D4]" />
        <span className="text-[#06B6D4] text-sm font-mono font-semibold tabular-nums">
          {formatTime(snapshot.t)}
        </span>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Stock Ranking Timeline                                             */
/* ------------------------------------------------------------------ */

function StockRankingTimeline({ snapshots, currentIndex }: { snapshots: Snapshot[]; currentIndex: number }) {
  const navigate = useNavigate();
  const [hoveredRank, setHoveredRank] = useState<number | null>(null);

  // For each rank position (0-9), track which stock was there at each snapshot
  const rankHistory = useMemo(() => {
    const history: Array<{ rank: number; slots: Array<{ stock: StockItem | null; snapshotIdx: number }> }> = [];
    for (let rank = 0; rank < 10; rank++) {
      const slots = snapshots.map((snap, idx) => {
        const stock = snap.stk[rank] ?? null;
        return { stock, snapshotIdx: idx };
      });
      history.push({ rank, slots });
    }
    return history;
  }, [snapshots]);

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, delay: 0.1 }}
      className="bg-[#111827] border border-[#1E293B] rounded-[14px] p-4 overflow-hidden"
    >
      <h3 className="text-[#F1F5F9] font-semibold text-base mb-3 flex items-center gap-2">
        <BarChart3 size={18} className="text-[#3B82F6]" />
        股票排名变化
      </h3>

      <div className="space-y-1.5">
        <AnimatePresence>
          {rankHistory.map(({ rank, slots }, ri) => (
            <motion.div
              key={rank}
              initial={{ opacity: 0, x: -20 }}
              animate={{
                opacity: hoveredRank === null || hoveredRank === rank ? 1 : 0.4,
                x: 0,
              }}
              transition={{ duration: 0.3, delay: ri * 0.05 }}
              className="flex items-center gap-2"
              onMouseEnter={() => setHoveredRank(rank)}
              onMouseLeave={() => setHoveredRank(null)}
            >
              {/* Rank number */}
              <span
                className={`w-6 text-center text-xs font-mono shrink-0 ${
                  rank < 3 ? 'text-[#FBBF24] font-bold' : 'text-[#64748B]'
                }`}
              >
                {rank + 1}
              </span>

              {/* Timeline slots */}
              <div className="flex-1 flex gap-0.5 h-7">
                {slots.map(({ stock, snapshotIdx }, si) => {
                  const isCurrent = snapshotIdx === currentIndex;
                  if (!stock) return <div key={si} className="flex-1 rounded-sm bg-[#1A2332]/50" />;
                  return (
                    <motion.div
                      key={`${si}-${stock.c}`}
                      className={`flex-1 rounded-sm flex items-center justify-center cursor-pointer overflow-hidden ${isCurrent ? 'ring-1 ring-[#06B6D4]' : ''}`}
                      style={{ backgroundColor: getHeatColor(stock.sc) + (isCurrent ? '' : '40') }}
                      whileHover={{ scale: 1.15, zIndex: 10 }}
                      onClick={() => navigate(`/stock/${stock.c}`)}
                      title={`${stock.n} (${stock.c}) 热度:${stock.sc} ${formatTime(snapshots[snapshotIdx].t)}`}
                    >
                      <span className={`text-[10px] font-medium text-white truncate px-0.5 ${si === currentIndex ? 'font-bold' : ''}`}>
                        {stock.n.slice(0, 2)}
                      </span>
                    </motion.div>
                  );
                })}
              </div>

              {/* Current stock */}
              <div className="w-20 shrink-0 text-right">
                {slots[currentIndex]?.stock && (
                  <button
                    onClick={() => slots[currentIndex].stock && navigate(`/stock/${slots[currentIndex].stock!.c}`)}
                    className="text-xs text-[#F1F5F9] hover:text-[#3B82F6] transition-colors truncate"
                  >
                    {slots[currentIndex].stock!.n}
                  </button>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Time labels */}
      <div className="flex items-center mt-2 ml-8 gap-0.5">
        {snapshots.map((s, i) => (
          <span
            key={i}
            className={`flex-1 text-[9px] font-mono text-center ${
              i === currentIndex ? 'text-[#06B6D4] font-bold' : 'text-[#475569]'
            }`}
          >
            {formatTime(s.t)}
          </span>
        ))}
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sector Ranking Timeline                                            */
/* ------------------------------------------------------------------ */

function SectorRankingTimeline({ snapshots, currentIndex }: { snapshots: Snapshot[]; currentIndex: number }) {
  const [hoveredRank, setHoveredRank] = useState<number | null>(null);

  const rankHistory = useMemo(() => {
    const history: Array<{ rank: number; slots: Array<{ sector: SectorItem | null; snapshotIdx: number }> }> = [];
    const maxRank = Math.min(8, Math.max(...snapshots.map((s) => s.sec.length)));
    for (let rank = 0; rank < maxRank; rank++) {
      const slots = snapshots.map((snap, idx) => {
        const sector = snap.sec[rank] ?? null;
        return { sector, snapshotIdx: idx };
      });
      history.push({ rank, slots });
    }
    return history;
  }, [snapshots]);

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, delay: 0.15 }}
      className="bg-[#111827] border border-[#1E293B] rounded-[14px] p-4 overflow-hidden"
    >
      <h3 className="text-[#F1F5F9] font-semibold text-base mb-3 flex items-center gap-2">
        <Layers size={18} className="text-[#8B5CF6]" />
        板块排名变化
      </h3>

      <div className="space-y-1.5">
        {rankHistory.map(({ rank, slots }, ri) => (
          <motion.div
            key={rank}
            initial={{ opacity: 0, x: 20 }}
            animate={{
              opacity: hoveredRank === null || hoveredRank === rank ? 1 : 0.4,
              x: 0,
            }}
            transition={{ duration: 0.3, delay: ri * 0.05 }}
            className="flex items-center gap-2"
            onMouseEnter={() => setHoveredRank(rank)}
            onMouseLeave={() => setHoveredRank(null)}
          >
            <span
              className={`w-6 text-center text-xs font-mono shrink-0 ${
                rank < 3 ? 'text-[#FBBF24] font-bold' : 'text-[#64748B]'
              }`}
            >
              {rank + 1}
            </span>

            <div className="flex-1 flex gap-0.5 h-7">
              {slots.map(({ sector, snapshotIdx }, si) => {
                const isCurrent = snapshotIdx === currentIndex;
                if (!sector) return <div key={si} className="flex-1 rounded-sm bg-[#1A2332]/50" />;
                const opacity = Math.max(0.3, Math.min(1, sector.sc / 200));
                return (
                  <motion.div
                    key={`${si}-${sector.n}`}
                    className={`flex-1 rounded-sm flex items-center justify-center overflow-hidden ${isCurrent ? 'ring-1 ring-[#8B5CF6]' : ''}`}
                    style={{ backgroundColor: `rgba(59, 130, 246, ${opacity})` }}
                    whileHover={{ scale: 1.15, zIndex: 10 }}
                    title={`${sector.n} 热度:${sector.sc} ${formatTime(snapshots[snapshotIdx].t)}`}
                  >
                    <span className={`text-[10px] font-medium text-white truncate px-0.5 ${isCurrent ? 'font-bold' : ''}`}>
                      {sector.n.slice(0, 2)}
                    </span>
                  </motion.div>
                );
              })}
            </div>

            <div className="w-20 shrink-0 text-right">
              {slots[currentIndex]?.sector && (
                <span className="text-xs text-[#F1F5F9] truncate">
                  {slots[currentIndex].sector!.n}
                </span>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      <div className="flex items-center mt-2 ml-8 gap-0.5">
        {snapshots.map((s, i) => (
          <span
            key={i}
            className={`flex-1 text-[9px] font-mono text-center ${
              i === currentIndex ? 'text-[#8B5CF6] font-bold' : 'text-[#475569]'
            }`}
          >
            {formatTime(s.t)}
          </span>
        ))}
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sentiment Timeline Chart                                           */
/* ------------------------------------------------------------------ */

function SentimentTimelineChart({ snapshots, currentIndex }: { snapshots: Snapshot[]; currentIndex: number }) {
  const data = useMemo(
    () =>
      snapshots.map((s, i) => ({
        time: formatTime(s.t),
        index: i,
        看多: s.sd.bu,
        观望: s.sd.ne,
        看空: s.sd.be,
        极度亢奋: s.sd.eh,
        极度悲观: s.sd.el,
        sentiment: s.sent,
      })),
    [snapshots],
  );

  const currentTime = snapshots[currentIndex] ? formatTime(snapshots[currentIndex].t) : '';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2 }}
      className="bg-[#111827] border border-[#1E293B] rounded-[14px] p-4"
    >
      <h3 className="text-[#F1F5F9] font-semibold text-base mb-3 flex items-center gap-2">
        <TrendingUp size={18} className="text-[#00E396]" />
        情绪趋势
        <span className="text-xs font-normal text-[#64748B] ml-1">
          (当前: {snapshots[currentIndex]?.sent})
        </span>
      </h3>

      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
          <defs>
            <linearGradient id="bullGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00E396" stopOpacity={0.6} />
              <stop offset="100%" stopColor="#00E396" stopOpacity={0.1} />
            </linearGradient>
            <linearGradient id="neutralGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FBBF24" stopOpacity={0.4} />
              <stop offset="100%" stopColor="#FBBF24" stopOpacity={0.05} />
            </linearGradient>
            <linearGradient id="bearGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FF4560" stopOpacity={0.6} />
              <stop offset="100%" stopColor="#FF4560" stopOpacity={0.1} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
          <XAxis dataKey="time" stroke="#475569" tick={{ fill: '#475569', fontSize: 11 }} />
          <YAxis stroke="#475569" tick={{ fill: '#475569', fontSize: 11 }} />

          <Tooltip
            contentStyle={{
              backgroundColor: '#1A2332',
              border: '1px solid #334155',
              borderRadius: '10px',
              fontSize: '12px',
            }}
            labelStyle={{ color: '#94A3B8' }}
            itemStyle={{ fontSize: '12px' }}
            formatter={(value: number, name: string) => {
              return [value, name];
            }}
            labelFormatter={(label: string) => `时间: ${label}`}
          />

          {currentTime && (
            <ReferenceLine x={currentTime} stroke="#06B6D4" strokeDasharray="4 4" strokeWidth={1.5} />
          )}

          <Area
            type="monotone"
            dataKey="看多"
            stackId="sent"
            stroke="#00E396"
            fill="url(#bullGrad)"
            animationDuration={1200}
          />
          <Area
            type="monotone"
            dataKey="观望"
            stackId="sent"
            stroke="#FBBF24"
            fill="url(#neutralGrad)"
            animationDuration={1200}
          />
          <Area
            type="monotone"
            dataKey="看空"
            stackId="sent"
            stroke="#FF4560"
            fill="url(#bearGrad)"
            animationDuration={1200}
          />
        </AreaChart>
      </ResponsiveContainer>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Action Signals Timeline                                            */
/* ------------------------------------------------------------------ */

function ActionSignalsTimeline({ snapshots, currentIndex }: { snapshots: Snapshot[]; currentIndex: number }) {
  const data = useMemo(() => {
    // Cache actionCategory results to avoid repeated lookups
    const actionMap = new Map<string, 'buy' | 'sell' | 'hold' | 'risk'>();

    return snapshots.map((s, i) => {
      const counts = { buy: 0, sell: 0, hold: 0, risk: 0 };

      // Single pass over action entries, accumulating into category buckets
      for (const [key, value] of Object.entries(s.act)) {
        let category = actionMap.get(key);
        if (!category) {
          category = actionCategory(key);
          actionMap.set(key, category);
        }
        counts[category] += value;
      }

      return {
        time: formatTime(s.t),
        index: i,
        买入: counts.buy,
        卖出: counts.sell,
        持有: counts.hold,
        风险: counts.risk,
      };
    });
  }, [snapshots]);

  const currentTime = snapshots[currentIndex] ? formatTime(snapshots[currentIndex].t) : '';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.25 }}
      className="bg-[#111827] border border-[#1E293B] rounded-[14px] p-4"
    >
      <h3 className="text-[#F1F5F9] font-semibold text-base mb-3 flex items-center gap-2">
        <TrendingDown size={18} className="text-[#F97316]" />
        操作信号趋势
      </h3>

      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
          <XAxis dataKey="time" stroke="#475569" tick={{ fill: '#475569', fontSize: 11 }} />
          <YAxis stroke="#475569" tick={{ fill: '#475569', fontSize: 11 }} />

          <Tooltip
            contentStyle={{
              backgroundColor: '#1A2332',
              border: '1px solid #334155',
              borderRadius: '10px',
              fontSize: '12px',
            }}
            labelStyle={{ color: '#94A3B8' }}
          />

          {currentTime && (
            <ReferenceLine x={currentTime} stroke="#06B6D4" strokeDasharray="4 4" strokeWidth={1.5} />
          )}

          <Bar dataKey="买入" fill="#00E396" fillOpacity={0.8} radius={[4, 4, 0, 0]} animationDuration={800} />
          <Bar dataKey="卖出" fill="#FF4560" fillOpacity={0.8} radius={[4, 4, 0, 0]} animationDuration={800} />
          <Bar dataKey="持有" fill="#FBBF24" fillOpacity={0.8} radius={[4, 4, 0, 0]} animationDuration={800} />
          <Bar dataKey="风险" fill="#F97316" fillOpacity={0.8} radius={[4, 4, 0, 0]} animationDuration={800} />
        </BarChart>
      </ResponsiveContainer>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Timeline Controller                                                */
/* ------------------------------------------------------------------ */

function TimelineController({
  snapshots,
  currentIndex,
  isPlaying,
  playSpeed,
  onTogglePlay,
  onSetSpeed,
  onSetIndex,
}: {
  snapshots: Snapshot[];
  currentIndex: number;
  isPlaying: boolean;
  playSpeed: number;
  onTogglePlay: () => void;
  onSetSpeed: (s: number) => void;
  onSetIndex: (i: number) => void;
}) {
  const speeds = [1, 2, 5, 10];
  const [isDragging, setIsDragging] = useState(false);
  const sliderRef = useRef<HTMLDivElement>(null);

  const progress = snapshots.length > 1 ? (currentIndex / (snapshots.length - 1)) * 100 : 0;

  const handleSliderClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!sliderRef.current || snapshots.length <= 1) return;
      const rect = sliderRef.current.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      const idx = Math.round(pct * (snapshots.length - 1));
      onSetIndex(Math.max(0, Math.min(snapshots.length - 1, idx)));
    },
    [snapshots.length, onSetIndex],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      setIsDragging(true);
      handleSliderClick(e);
    },
    [handleSliderClick],
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging || !sliderRef.current || snapshots.length <= 1) return;
      const rect = sliderRef.current.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const idx = Math.round(pct * (snapshots.length - 1));
      onSetIndex(idx);
    },
    [isDragging, snapshots.length, onSetIndex],
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const currentSnapshot = snapshots[currentIndex];
  const currentTime = currentSnapshot ? formatTime(currentSnapshot.t) : '--:--';

  return (
    <motion.div
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30, delay: 0.3 }}
      className="fixed bottom-0 left-0 right-0 z-50 h-[72px] bg-[#111827]/90 backdrop-blur-xl border-t border-[#1E293B]"
    >
      <div className="max-w-[1440px] mx-auto h-full px-4 flex items-center gap-3">
        {/* Skip to start */}
        <button
          onClick={() => onSetIndex(0)}
          className="p-2 rounded-full text-[#94A3B8] hover:text-[#F1F5F9] hover:bg-[#1A2332] transition-colors shrink-0"
          title="跳到开头"
        >
          <SkipBack size={20} />
        </button>

        {/* Play / Pause */}
        <motion.button
          onClick={onTogglePlay}
          whileTap={{ scale: 0.92 }}
          className="w-10 h-10 rounded-full bg-[#3B82F6] flex items-center justify-center text-white shadow-lg shadow-blue-500/20 shrink-0"
        >
          <AnimatePresence mode="wait">
            {isPlaying ? (
              <motion.div
                key="pause"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Pause size={18} />
              </motion.div>
            ) : (
              <motion.div
                key="play"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Play size={18} className="ml-0.5" />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.button>

        {/* Skip to end */}
        <button
          onClick={() => onSetIndex(snapshots.length - 1)}
          className="p-2 rounded-full text-[#94A3B8] hover:text-[#F1F5F9] hover:bg-[#1A2332] transition-colors shrink-0"
          title="跳到结尾"
        >
          <SkipForward size={20} />
        </button>

        {/* Speed selector */}
        <div className="hidden sm:flex items-center gap-0.5 bg-[#1A2332] rounded-full p-0.5 shrink-0">
          <Gauge size={14} className="text-[#64748B] ml-2 mr-1" />
          {speeds.map((s) => (
            <button
              key={s}
              onClick={() => onSetSpeed(s)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                playSpeed === s
                  ? 'bg-[#3B82F6] text-white'
                  : 'text-[#64748B] hover:text-[#94A3B8]'
              }`}
            >
              {s}x
            </button>
          ))}
        </div>

        {/* Slider */}
        <div className="flex-1 flex items-center gap-3 min-w-0">
          <div
            ref={sliderRef}
            className="relative flex-1 h-1.5 rounded-full bg-[#1A2332] cursor-pointer"
            onClick={handleSliderClick}
            onMouseDown={handleMouseDown}
          >
            {/* Filled track */}
            <div
              className="absolute left-0 top-0 h-full rounded-full"
              style={{
                width: `${progress}%`,
                background: 'linear-gradient(90deg, #06B6D4, #3B82F6)',
              }}
            />
            {/* Thumb */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-[#06B6D4] shadow-lg cursor-pointer"
              style={{
                left: `calc(${progress}% - 8px)`,
                boxShadow: isDragging
                  ? '0 0 16px rgba(6, 182, 212, 0.6)'
                  : '0 0 8px rgba(6, 182, 212, 0.3)',
              }}
            />
            {/* Tick marks */}
            {snapshots.length > 1 &&
              snapshots.map((_, i) => (
                <div
                  key={i}
                  className="absolute top-1/2 -translate-y-1/2 w-0.5 h-2.5 bg-[#475569] rounded-full"
                  style={{ left: `${(i / (snapshots.length - 1)) * 100}%` }}
                />
              ))}
          </div>
        </div>

        {/* Time display */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[#06B6D4] text-sm font-mono font-semibold tabular-nums">
            {currentTime}
          </span>
        </div>

        {/* Date picker button */}
        <button
          className="p-2 rounded-full text-[#94A3B8] hover:text-[#F1F5F9] hover:bg-[#1A2332] transition-colors shrink-0"
          title="选择日期"
        >
          <Calendar size={18} />
        </button>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Replay Page                                                   */
/* ------------------------------------------------------------------ */

export default function Replay() {
  const {
    currentSnapshot,
    isPlaying,
    playSpeed,
    replayIndex,
    currentDayData,
    dayFullLoaded,
    togglePlay,
    setPlaySpeed,
    setReplayIndex,
    loadDayFull,
  } = useStore();

  useEffect(() => {
    if (!dayFullLoaded) loadDayFull();
  }, [dayFullLoaded, loadDayFull]);

  const snapshots = currentDayData?.snapshots ?? [];

  // Auto-play effect
  useEffect(() => {
    if (!isPlaying || snapshots.length === 0) return;
    const interval = setInterval(() => {
      setReplayIndex(
        Math.min(replayIndex + 1, snapshots.length - 1),
      );
    }, 1000 / playSpeed);
    return () => clearInterval(interval);
  }, [isPlaying, playSpeed, replayIndex, snapshots.length, setReplayIndex]);

  // Stop when reaching the end
  useEffect(() => {
    if (isPlaying && replayIndex >= snapshots.length - 1) {
      togglePlay();
    }
  }, [replayIndex, snapshots.length, isPlaying, togglePlay]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key) {
        case ' ':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
          setReplayIndex(Math.max(0, replayIndex - 1));
          break;
        case 'ArrowRight':
          setReplayIndex(Math.min(snapshots.length - 1, replayIndex + 1));
          break;
        case 'ArrowUp':
          setPlaySpeed(Math.min(10, playSpeed * 2));
          break;
        case 'ArrowDown':
          setPlaySpeed(Math.max(1, Math.floor(playSpeed / 2)));
          break;
        case 'Home':
          setReplayIndex(0);
          break;
        case 'End':
          setReplayIndex(snapshots.length - 1);
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, replayIndex, setReplayIndex, setPlaySpeed, playSpeed, snapshots.length]);

  const displaySnapshot = currentSnapshot ?? snapshots[replayIndex] ?? snapshots[snapshots.length - 1];

  if (!displaySnapshot) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-[#64748B]">暂无回放数据，请先选择日期</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="pb-[80px]"
    >
      {/* Mini KPI */}
      <MiniKPI snapshot={displaySnapshot} />

      {/* Main Content */}
      <div className="mt-4 space-y-4">
        {/* Ranking Timelines - side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <StockRankingTimeline snapshots={snapshots} currentIndex={replayIndex} />
          <SectorRankingTimeline snapshots={snapshots} currentIndex={replayIndex} />
        </div>

        {/* Sentiment Chart */}
        <SentimentTimelineChart snapshots={snapshots} currentIndex={replayIndex} />

        {/* Action Signals Chart */}
        <ActionSignalsTimeline snapshots={snapshots} currentIndex={replayIndex} />
      </div>

      {/* Timeline Controller */}
      <TimelineController
        snapshots={snapshots}
        currentIndex={replayIndex}
        isPlaying={isPlaying}
        playSpeed={playSpeed}
        onTogglePlay={togglePlay}
        onSetSpeed={setPlaySpeed}
        onSetIndex={setReplayIndex}
      />
    </motion.div>
  );
}
