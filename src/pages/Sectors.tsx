import { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Layers,
  ChevronRight,
  TrendingUp,
  Minus,
  X,
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  RefreshCw,
  MessagesSquare,
  Users,
  Flame,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts';
import { useStore } from '@/store/useStore';
import type { SectorItem, Snapshot } from '@/types/api';

/* ------------------------------------------------------------------ */
/*  Derived data helpers                                                */
/* ------------------------------------------------------------------ */

/** Extract time labels from snapshot timestamps */
function getTimeSlots(snapshots: Snapshot[]): string[] {
  return snapshots.map((s) => s.t.split(' ')[1] ?? s.t);
}

/** Build sector score time-series from all snapshots */
function buildHeatmapData(
  snapshots: Snapshot[],
  sectors: SectorItem[]
): Record<string, number[]> {
  const result: Record<string, number[]> = {};
  sectors.forEach((sec) => {
    result[sec.n] = new Array(snapshots.length).fill(0);
  });

  snapshots.forEach((snap, snapIdx) => {
    snap.sec.forEach((sectorData) => {
      if (result[sectorData.n]) {
        result[sectorData.n][snapIdx] = sectorData.sc;
      }
    });
  });

  return result;
}

/** Map sectors → related stocks from current snapshot's stk list */
function buildSectorStocks(
  sectors: SectorItem[],
  stk: Snapshot['stk']
): Record<string, Array<{ name: string; code: string; sc: number; mc: number }>> {
  const map: Record<string, Array<{ name: string; code: string; sc: number; mc: number }>> = {};
  sectors.forEach((sec) => {
    map[sec.n] = stk
      .filter((stock) => stock.sec.includes(sec.n))
      .map((stock) => ({ name: stock.n, code: stock.c, sc: stock.sc, mc: stock.mc }));
  });
  return map;
}

/** Rotation data — split snapshots into 3 periods, average sector scores */
function buildRotationData(
  snapshots: Snapshot[],
  sectors: SectorItem[]
): { periods: string[]; items: Array<{ name: string; values: number[]; trend: 'up' | 'down' | 'flat' }> } {
  const n = snapshots.length;
  if (n === 0) return { periods: [], items: [] };

  const third = Math.max(1, Math.floor(n / 3));
  const slices = [
    snapshots.slice(0, third),
    snapshots.slice(third, third * 2),
    snapshots.slice(third * 2),
  ];

  const periods = ['早盘', '午盘', '尾盘'];
  const items = sectors.slice(0, 8).map((sec) => {
    const values = slices.map((slice) => {
      if (slice.length === 0) return 0;
      const sum = slice.reduce((acc, snap) => {
        const found = snap.sec.find((s) => s.n === sec.n);
        return acc + (found ? found.sc : 0);
      }, 0);
      return Math.round(sum / slice.length);
    });
    const trend: 'up' | 'down' | 'flat' =
      values[2] > values[0] * 1.1 ? 'up' : values[2] < values[0] * 0.9 ? 'down' : 'flat';
    return { name: sec.n, values, trend };
  });

  return { periods, items };
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type SortKey = 'sc' | 'mc' | 'gc' | 'n';
type SortDir = 'asc' | 'desc';
type ViewMode = 'rank' | 'rotation';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getTrendInfo(current: number, previous: number) {
  const change = (current - previous) / previous;
  if (change > 0.3) return { icon: '▲▲', label: 'strong up', color: 'text-[#00E396]' };
  if (change > 0.1) return { icon: '▲', label: 'up', color: 'text-[#00E396]' };
  if (change > -0.1) return { icon: '▶', label: 'flat', color: 'text-[#FBBF24]' };
  if (change > -0.3) return { icon: '▼', label: 'down', color: 'text-[#FF4560]' };
  return { icon: '▼▼', label: 'strong down', color: 'text-[#FF4560]' };
}

function getHeatOpacity(score: number) {
  if (score >= 100) return 1;
  if (score >= 80) return 0.85;
  if (score >= 60) return 0.6;
  if (score >= 40) return 0.35;
  if (score >= 20) return 0.15;
  return 0.05;
}

/* ------------------------------------------------------------------ */
/*  RankBadge                                                          */
/* ------------------------------------------------------------------ */

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-[#0B0E14] bg-gradient-to-br from-[#FFD700] to-[#FFA500] shrink-0">
        1
      </div>
    );
  }
  if (rank === 2) {
    return (
      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-[#0B0E14] bg-gradient-to-br from-[#C0C0C0] to-[#A0A0A0] shrink-0">
        2
      </div>
    );
  }
  if (rank === 3) {
    return (
      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-[#0B0E14] bg-gradient-to-br from-[#CD7F32] to-[#B87333] shrink-0">
        3
      </div>
    );
  }
  return (
    <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium text-[#64748B] bg-[#1A2332] shrink-0">
      {rank}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  SectorDetailDrawer                                                 */
/* ------------------------------------------------------------------ */

function SectorDetailDrawer({
  sector,
  onClose,
  timeSlots,
  heatmapData,
  sectorStocks,
}: {
  sector: SectorItem | null;
  onClose: () => void;
  timeSlots: string[];
  heatmapData: Record<string, number[]>;
  sectorStocks: Record<string, Array<{ name: string; code: string; sc: number; mc: number }>>;
}) {
  if (!sector) return null;

  const stocks = sectorStocks[sector.n] || [];
  const sectorTrend = timeSlots.map((time, idx) => ({
    time,
    score: heatmapData[sector.n]?.[idx] ?? 0,
  }));

  return (
    <AnimatePresence>
      {sector && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 z-40"
            onClick={onClose}
          />
          {/* Drawer */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed right-0 top-0 bottom-0 w-full sm:w-[450px] bg-[#111827] border-l border-[#1E293B] z-50 overflow-y-auto"
          >
            {/* Header */}
            <div className="sticky top-0 bg-[#111827]/95 backdrop-blur-sm border-b border-[#1E293B] px-5 py-4 flex items-center justify-between z-10">
              <div className="flex items-center gap-3">
                <Layers size={20} className="text-[#3B82F6]" />
                <h2 className="text-lg font-semibold text-[#F1F5F9]">{sector.n}</h2>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-md text-[#64748B] hover:text-[#F1F5F9] hover:bg-[#1A2332] transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="px-5 py-4 space-y-6">
              {/* Stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-[#1A2332] rounded-xl p-3 text-center">
                  <div className="text-xs text-[#64748B] mb-1">热度</div>
                  <div className="text-lg font-bold text-[#3B82F6]">{sector.sc}</div>
                </div>
                <div className="bg-[#1A2332] rounded-xl p-3 text-center">
                  <div className="text-xs text-[#64748B] mb-1">提及</div>
                  <div className="text-lg font-bold text-[#F1F5F9]">{sector.mc}</div>
                </div>
                <div className="bg-[#1A2332] rounded-xl p-3 text-center">
                  <div className="text-xs text-[#64748B] mb-1">群数</div>
                  <div className="text-lg font-bold text-[#94A3B8]">{sector.gc}</div>
                </div>
              </div>

              {/* Heat bar */}
              <div>
                <div className="flex justify-between text-xs text-[#64748B] mb-2">
                  <span>热度得分</span>
                  <span>{sector.sc}/200</span>
                </div>
                <div className="w-full h-2 rounded-full bg-[#1E293B] overflow-hidden">
                  <motion.div
                    className={
                      sector.sc >= 100 ? 'bg-[#EF4444]' : sector.sc >= 60 ? 'bg-[#F59E0B]' : 'bg-[#10B981]'
                    }
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, (sector.sc / 200) * 100)}%` }}
                    transition={{ type: 'spring', stiffness: 200, damping: 20, delay: 0.2 }}
                    style={{ height: '100%', borderRadius: '9999px' }}
                  />
                </div>
              </div>

              {/* Mini trend chart */}
              <div>
                <h3 className="text-sm font-medium text-[#94A3B8] mb-3 flex items-center gap-2">
                  <BarChart3 size={14} />
                  热度趋势
                </h3>
                <div className="h-20">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={sectorTrend}>
                      <defs>
                        <linearGradient id="sectorTrendGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.5} />
                          <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Area
                        type="monotone"
                        dataKey="score"
                        stroke="#3B82F6"
                        fill="url(#sectorTrendGrad)"
                        strokeWidth={2}
                        animationDuration={800}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Related stocks */}
              <div>
                <h3 className="text-sm font-medium text-[#94A3B8] mb-3 flex items-center gap-2">
                  <Flame size={14} />
                  关联热门个股
                </h3>
                <div className="space-y-2">
                  {stocks.map((stock, i) => (
                    <motion.div
                      key={stock.code}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.1 + i * 0.05 }}
                      className="flex items-center gap-3 bg-[#1A2332] rounded-lg p-3 hover:bg-[#1E293B] transition-colors cursor-pointer"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-[#F1F5F9] truncate">{stock.name}</div>
                        <div className="text-xs text-[#64748B]">{stock.code}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-semibold text-[#3B82F6]">{stock.sc}</div>
                        <div className="text-xs text-[#64748B]">{stock.mc}次</div>
                      </div>
                      <div className="w-16 shrink-0">
                        <div className="w-full h-1.5 rounded-full bg-[#1E293B] overflow-hidden">
                          <div
                            className={
                              stock.sc >= 80 ? 'bg-[#EF4444]' : stock.sc >= 50 ? 'bg-[#F59E0B]' : 'bg-[#10B981]'
                            }
                            style={{ width: `${Math.min(100, stock.sc)}%`, height: '100%', borderRadius: '9999px' }}
                          />
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Group messages */}
              <div>
                <h3 className="text-sm font-medium text-[#94A3B8] mb-3 flex items-center gap-2">
                  <MessagesSquare size={14} />
                  群消息摘要
                </h3>
                <div className="space-y-3">
                  {sector.gd.map((group, gi) => (
                    <motion.div
                      key={group.g}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 + gi * 0.08 }}
                      className="bg-[#1A2332] rounded-lg p-3"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Users size={12} className="text-[#64748B]" />
                          <span className="text-xs font-medium text-[#F1F5F9]">{group.g}</span>
                        </div>
                        <span className="text-xs text-[#64748B]">{group.c}条消息</span>
                      </div>
                      <div className="space-y-1.5">
                        {group.m.map((msg, mi) => (
                          <div key={mi} className="flex gap-2 text-xs">
                            <span className="text-[#475569] shrink-0">{msg.t}</span>
                            <span className="text-[#94A3B8]">{msg.x}</span>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Sectors Page                                                  */
/* ------------------------------------------------------------------ */

export default function Sectors() {
  const currentSnapshot = useStore((s) => s.currentSnapshot);
  const snapshots = useStore((s) => s.currentDayData?.snapshots ?? []);
  const dayFullLoaded = useStore((s) => s.dayFullLoaded);
  const loadDayFull = useStore((s) => s.loadDayFull);
  const [sortKey, setSortKey] = useState<SortKey>('sc');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [viewMode, setViewMode] = useState<ViewMode>('rank');
  const [selectedSector, setSelectedSector] = useState<SectorItem | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hoveredSector, setHoveredSector] = useState<string | null>(null);
  const [hiddenLines, setHiddenLines] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!dayFullLoaded) loadDayFull();
  }, [dayFullLoaded, loadDayFull]);

  const sectors = currentSnapshot?.sec ?? [];

  /* Derived data */
  const timeSlots = useMemo(() => getTimeSlots(snapshots), [snapshots]);
  const heatmapData = useMemo(() => buildHeatmapData(snapshots, sectors), [snapshots, sectors]);
  const sectorStocks = useMemo(
    () => buildSectorStocks(sectors, currentSnapshot?.stk ?? []),
    [sectors, currentSnapshot]
  );
  const topSectors = useMemo(() => [...sectors].sort((a, b) => b.sc - a.sc).slice(0, 5), [sectors]);

  const trendData = useMemo(() => {
    return timeSlots.map((time, idx) => {
      const point: Record<string, string | number> = { time };
      topSectors.forEach((s) => {
        point[s.n] = heatmapData[s.n]?.[idx] ?? 0;
      });
      return point;
    });
  }, [timeSlots, topSectors, heatmapData]);

  const rotation = useMemo(() => buildRotationData(snapshots, sectors), [snapshots, sectors]);

  const trendColors = ['#3B82F6', '#8B5CF6', '#00E396', '#FBBF24', '#06B6D4'];

  /* Sort sectors */
  const sortedSectors = useMemo(() => {
    const sorted = [...sectors].sort((a, b) => {
      const aVal = sortKey === 'n' ? a.n : a[sortKey];
      const bVal = sortKey === 'n' ? b.n : b[sortKey];
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }
      return 0;
    });
    return sorted;
  }, [sectors, sortKey, sortDir]);

  const handleSort = useCallback((key: SortKey) => {
    setSortKey((prev) => {
      setSortDir((d) => (prev === key ? (d === 'asc' ? 'desc' : 'asc') : 'desc'));
      return key;
    });
  }, []);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 800);
  }, []);

  const toggleLine = useCallback((name: string) => {
    setHiddenLines((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#1E293B]"
      >
        <div className="flex items-center gap-3">
          <Layers size={22} className="text-[#3B82F6]" />
          <h1 className="text-2xl font-semibold text-[#F1F5F9] tracking-tight">板块轮动</h1>
        </div>
        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div className="flex bg-[#1A2332] rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('rank')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                viewMode === 'rank'
                  ? 'bg-[#1E293B] text-[#F1F5F9]'
                  : 'text-[#64748B] hover:text-[#94A3B8]'
              }`}
            >
              排行
            </button>
            <button
              onClick={() => setViewMode('rotation')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                viewMode === 'rotation'
                  ? 'bg-[#1E293B] text-[#F1F5F9]'
                  : 'text-[#64748B] hover:text-[#94A3B8]'
              }`}
            >
              轮动
            </button>
          </div>
          <button
            onClick={handleRefresh}
            className="p-2 rounded-lg bg-[#1A2332] text-[#64748B] hover:text-[#F1F5F9] hover:bg-[#1E293B] transition-colors"
          >
            <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </motion.div>

      {viewMode === 'rank' ? (
        <>
          {/* Ranking Table */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="bg-[#111827] rounded-xl border border-[#1E293B] overflow-hidden"
          >
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#1E293B]">
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#64748B] w-14">排名</th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-[#64748B] cursor-pointer hover:text-[#94A3B8] transition-colors"
                      onClick={() => handleSort('n')}
                    >
                      板块
                      {sortKey === 'n' && (
                        <span className="ml-1 text-[#3B82F6]">{sortDir === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </th>
                    <th
                      className="px-4 py-3 text-right text-xs font-medium text-[#64748B] cursor-pointer hover:text-[#94A3B8] transition-colors"
                      onClick={() => handleSort('sc')}
                    >
                      热度
                      {sortKey === 'sc' && (
                        <span className="ml-1 text-[#3B82F6]">{sortDir === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </th>
                    <th
                      className="px-4 py-3 text-right text-xs font-medium text-[#64748B] cursor-pointer hover:text-[#94A3B8] transition-colors"
                      onClick={() => handleSort('mc')}
                    >
                      提及
                      {sortKey === 'mc' && (
                        <span className="ml-1 text-[#3B82F6]">{sortDir === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </th>
                    <th
                      className="px-4 py-3 text-right text-xs font-medium text-[#64748B] cursor-pointer hover:text-[#94A3B8] transition-colors"
                      onClick={() => handleSort('gc')}
                    >
                      群数
                      {sortKey === 'gc' && (
                        <span className="ml-1 text-[#3B82F6]">{sortDir === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-[#64748B]">趋势</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-[#64748B]">个股</th>
                    <th className="px-4 py-3 w-12" />
                  </tr>
                </thead>
                <tbody>
                  {sortedSectors.map((sector, idx) => {
                    const rank = idx + 1;
                    const hm = heatmapData[sector.n];
                    const prevScore =
                      hm && hm.length >= 2 ? hm[hm.length - 2] : sector.sc;
                    const trend = getTrendInfo(sector.sc, prevScore);
                    const stockCount = (sectorStocks[sector.n] || []).length;
                    const isTop3 = rank <= 3;

                    return (
                      <motion.tr
                        key={sector.n}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.04, duration: 0.35 }}
                        onClick={() => setSelectedSector(sector)}
                        onMouseEnter={() => setHoveredSector(sector.n)}
                        onMouseLeave={() => setHoveredSector(null)}
                        className={`border-b border-[#1E293B]/50 cursor-pointer transition-all duration-200 group ${
                          hoveredSector === sector.n
                            ? 'bg-[#1E293B] translate-x-1'
                            : hoveredSector
                            ? 'opacity-60'
                            : 'bg-[#111827] hover:bg-[#1A2332]'
                        } ${isTop3 ? 'relative' : ''}`}
                        style={
                          isTop3
                            ? {
                                borderLeft:
                                  rank === 1
                                    ? '3px solid #FFD700'
                                    : rank === 2
                                    ? '3px solid #C0C0C0'
                                    : '3px solid #CD7F32',
                              }
                            : undefined
                        }
                      >
                        <td className="px-4 py-3">
                          <RankBadge rank={rank} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-[#F1F5F9]">{sector.n}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-sm font-bold text-[#3B82F6]">{sector.sc}</span>
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-[#94A3B8]">{sector.mc}</td>
                        <td className="px-4 py-3 text-right text-sm text-[#94A3B8]">{sector.gc}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs ${trend.color} font-medium`}>{trend.icon}</span>
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-[#94A3B8]">{stockCount}</td>
                        <td className="px-4 py-3">
                          <ChevronRight size={16} className="text-[#475569] group-hover:text-[#94A3B8] transition-colors" />
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </motion.div>

          {/* Heatmap */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="bg-[#111827] rounded-xl border border-[#1E293B] p-4 md:p-5"
          >
            <h2 className="text-lg font-semibold text-[#F1F5F9] mb-4 flex items-center gap-2">
              <GridIcon />
              板块热力图
            </h2>
            <div className="overflow-x-auto">
              <div className="min-w-[600px]">
                {/* Time header */}
                <div className="flex items-center mb-1">
                  <div className="w-16 shrink-0" />
                  {timeSlots.map((t) => (
                    <div key={t} className="flex-1 text-center text-[10px] text-[#475569] font-mono">
                      {t}
                    </div>
                  ))}
                </div>
                {/* Heatmap rows */}
                {sortedSectors.map((sector) => (
                  <div key={sector.n} className="flex items-center mb-[2px]">
                    <div className="w-16 shrink-0 pr-2 text-right text-xs text-[#94A3B8] truncate">
                      {sector.n}
                    </div>
                    <div className="flex-1 flex gap-[2px]">
                      {timeSlots.map((t, ti) => {
                        const score = heatmapData[sector.n]?.[ti] ?? 0;
                        const opacity = getHeatOpacity(score);
                        return (
                          <div
                            key={t}
                            className="flex-1 aspect-[2/3] rounded-sm relative group cursor-pointer transition-opacity hover:opacity-80"
                            style={{ backgroundColor: `rgba(59, 130, 246, ${opacity})` }}
                            title={`${sector.n} ${t} 热度:${score}`}
                          >
                            {/* Tooltip */}
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-[#1E293B] rounded text-[10px] text-[#F1F5F9] whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10 shadow-lg">
                              {sector.n} {t} · {score}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>

          {/* Trend Chart */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
            className="bg-[#111827] rounded-xl border border-[#1E293B] p-4 md:p-5"
          >
            <h2 className="text-lg font-semibold text-[#F1F5F9] mb-4 flex items-center gap-2">
              <TrendingUp size={18} className="text-[#3B82F6]" />
              板块热度趋势对比
            </h2>
            <div className="h-64 md:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                  <XAxis
                    dataKey="time"
                    tick={{ fill: '#475569', fontSize: 11 }}
                    axisLine={{ stroke: '#1E293B' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: '#475569', fontSize: 11 }}
                    axisLine={{ stroke: '#1E293B' }}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1E293B',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                    labelStyle={{ color: '#F1F5F9' }}
                  />
                  {topSectors.map((s, i) => (
                    <Line
                      key={s.n}
                      type="monotone"
                      dataKey={s.n}
                      stroke={trendColors[i]}
                      strokeWidth={hiddenLines.has(s.n) ? 1 : 2}
                      strokeOpacity={hiddenLines.has(s.n) ? 0.2 : 1}
                      dot={false}
                      activeDot={{ r: 5, strokeWidth: 0 }}
                      animationDuration={1500}
                      hide={hiddenLines.has(s.n)}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
            {/* Custom Legend */}
            <div className="flex flex-wrap gap-3 mt-4 justify-center">
              {topSectors.map((s, i) => (
                <motion.button
                  key={s.n}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 + i * 0.1 }}
                  onClick={() => toggleLine(s.n)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-all ${
                    hiddenLines.has(s.n)
                      ? 'bg-[#1A2332] text-[#475569] opacity-50'
                      : 'bg-[#1A2332] text-[#94A3B8]'
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: trendColors[i] }}
                  />
                  {s.n}
                </motion.button>
              ))}
            </div>
          </motion.div>
        </>
      ) : (
        /* Rotation Flow View */
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="bg-[#111827] rounded-xl border border-[#1E293B] p-4 md:p-5"
        >
          <h2 className="text-lg font-semibold text-[#F1F5F9] mb-6 flex items-center gap-2">
            <RefreshCw size={18} className="text-[#8B5CF6]" />
            板块轮动流向
          </h2>
          <div className="flex flex-col lg:flex-row gap-6 lg:gap-4">
            {rotation.periods.map((period, pi) => (
              <div key={period} className="flex-1">
                <div className="text-center text-sm font-medium text-[#94A3B8] mb-4 whitespace-pre-line">
                  {period}
                </div>
                <div className="space-y-2">
                  {[...rotation.items]
                    .sort((a, b) => b.values[pi] - a.values[pi])
                    .map((s, si) => {
                      const isUp = s.trend === 'up';
                      const isDown = s.trend === 'down';
                      const barWidth = Math.min(100, (s.values[pi] / 180) * 100);
                      return (
                        <motion.div
                          key={`${period}-${s.name}`}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: pi * 0.15 + si * 0.05 }}
                          className="flex items-center gap-2"
                        >
                          <div className="w-14 text-xs text-[#94A3B8] text-right shrink-0">{s.name}</div>
                          <div className="flex-1 h-6 bg-[#1A2332] rounded-md overflow-hidden relative">
                            <motion.div
                              className={`h-full rounded-md ${
                                isUp ? 'bg-[#00E396]/30' : isDown ? 'bg-[#FF4560]/30' : 'bg-[#FBBF24]/20'
                              }`}
                              initial={{ width: 0 }}
                              animate={{ width: `${barWidth}%` }}
                              transition={{ type: 'spring', stiffness: 200, damping: 20, delay: pi * 0.15 + si * 0.05 }}
                            />
                            <span className="absolute inset-0 flex items-center px-2 text-[10px] font-medium text-[#F1F5F9]">
                              {s.values[pi]}
                            </span>
                          </div>
                          <div className="w-5 shrink-0">
                            {isUp ? (
                              <ArrowUpRight size={14} className="text-[#00E396]" />
                            ) : isDown ? (
                              <ArrowDownRight size={14} className="text-[#FF4560]" />
                            ) : (
                              <Minus size={14} className="text-[#FBBF24]" />
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                </div>
                {pi < rotation.periods.length - 1 && (
                  <div className="hidden lg:flex justify-center my-4">
                    <ArrowRight size={20} className="text-[#475569]" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Detail Drawer */}
      <SectorDetailDrawer
        sector={selectedSector}
        onClose={() => setSelectedSector(null)}
        timeSlots={timeSlots}
        heatmapData={heatmapData}
        sectorStocks={sectorStocks}
      />
    </div>
  );
}

/* Grid icon for heatmap */
function GridIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </svg>
  );
}
