import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  GitCompare,
  Calendar,
  X,
  TrendingUp,
  TrendingDown,
  Flame,
  BarChart3,
  Layers,
  Activity,
  Zap,
  Plus,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
} from 'recharts';
import { useStore } from '@/store/useStore';
import { fetchDay } from '@/lib/api';
import type { DayData, Snapshot } from '@/types/api';

/* ------------------------------------------------------------------ */
/*  Transform DayData → CompareDayData                                 */
/* ------------------------------------------------------------------ */

interface CompareDayData {
  date: string;
  snapshot: Snapshot;
  totalMessages: number;
  sentiment: string;
  topStocks: Array<{ code: string; name: string; heat: number; rank: number }>;
  topSectors: Array<{ name: string; heat: number; rank: number }>;
  actionCounts: Record<string, number>;
  sentimentTimeline: Array<{ time: string; bull: number; bear: number; neutral: number }>;
}

function dayDataToCompare(day: DayData): CompareDayData {
  const lastSnap = day.snapshots[day.snapshots.length - 1];
  if (!lastSnap) {
    return {
      date: day.date,
      snapshot: { t: '', msg: 0, grp: 0, sent: '', sd: { bu: 0, be: 0, ne: 0, eh: 0, el: 0 }, act: {}, stk: [], sec: [] },
      totalMessages: 0,
      sentiment: '',
      topStocks: [],
      topSectors: [],
      actionCounts: {},
      sentimentTimeline: [],
    };
  }

  const topStocks = lastSnap.stk.map((s, i) => ({
    code: s.c, name: s.n, heat: s.sc, rank: i + 1,
  }));
  const topSectors = lastSnap.sec.map((s, i) => ({
    name: s.n, heat: s.sc, rank: i + 1,
  }));
  const sentimentTimeline = day.snapshots.map((s) => ({
    time: s.t.split(' ')[1] ?? s.t,
    bull: s.sd.bu,
    bear: s.sd.be,
    neutral: s.sd.ne,
  }));

  return {
    date: day.date,
    snapshot: lastSnap,
    totalMessages: day.meta.message_count,
    sentiment: lastSnap.sent,
    topStocks,
    topSectors,
    actionCounts: lastSnap.act,
    sentimentTimeline,
  };
}

/* ------------------------------------------------------------------ */
/*  Animation config                                                   */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Color palette for different dates                                  */
/* ------------------------------------------------------------------ */

const dateColors = ['#3B82F6', '#8B5CF6', '#06B6D4', '#F59E0B', '#EF4444'];

function getDateColor(index: number) {
  return dateColors[index % dateColors.length];
}

/* ================================================================== */
/*  COMPARE PAGE                                                      */
/* ================================================================== */

export default function Compare() {
  const availableDates = useStore((s) => s.availableDates);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [dateSelectorOpen, setDateSelectorOpen] = useState(false);

  // Initialize selected dates from available dates once loaded
  useEffect(() => {
    if (availableDates.length >= 2 && selectedDates.length === 0) {
      setSelectedDates([availableDates[0].date, availableDates[1].date]);
    }
  }, [availableDates]);

  /* ---- Add / remove dates ---- */
  const addDate = useCallback((date: string) => {
    if (selectedDates.includes(date)) return;
    if (selectedDates.length >= 5) return;
    setSelectedDates((prev) => [...prev, date]);
    setDateSelectorOpen(false);
  }, [selectedDates]);

  const removeDate = useCallback((date: string) => {
    setSelectedDates((prev) => prev.filter((d) => d !== date));
  }, []);

  /* ---- Get selected day data (async fetch) ---- */
  const [dayDataMap, setDayDataMap] = useState<Record<string, CompareDayData>>({});

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const results: Record<string, CompareDayData> = {};
      await Promise.all(
        selectedDates.map(async (date) => {
          if (dayDataMap[date]) {
            results[date] = dayDataMap[date];
            return;
          }
          try {
            const day = await fetchDay(date);
            results[date] = dayDataToCompare(day);
          } catch {
            // skip failed dates
          }
        })
      );
      if (!cancelled) {
        setDayDataMap((prev) => ({ ...prev, ...results }));
      }
    };
    load();
    return () => { cancelled = true; };
  }, [selectedDates.join(',')]);

  const selectedDays = selectedDates
    .map((d) => dayDataMap[d])
    .filter(Boolean) as CompareDayData[];

  /* ---- Available dates for selection ---- */
  const selectableDates = useMemo(() => {
    return availableDates.filter((d) => !selectedDates.includes(d.date));
  }, [availableDates, selectedDates]);

  return (
    <div className="space-y-6 md:space-y-8">
      {/* ============================================================ */}
      {/*  HEADER                                                      */}
      {/* ============================================================ */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="bg-[#111827] border border-[#1E293B] rounded-[14px] p-4 md:p-5"
      >
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex items-center gap-2 shrink-0">
            <GitCompare size={20} className="text-[#3B82F6]" />
            <h1 className="text-lg md:text-xl font-semibold text-[#F1F5F9]">多日期对比</h1>
          </div>

          {/* Date Selector */}
          <div className="flex flex-wrap items-center gap-2 flex-1">
            {selectedDates.map((date, i) => (
              <motion.div
                key={date}
                layout
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium"
                style={{
                  backgroundColor: `${getDateColor(i)}15`,
                  border: `1px solid ${getDateColor(i)}40`,
                  color: getDateColor(i),
                }}
              >
                <Calendar size={13} />
                {date}
                {selectedDates.length > 2 && (
                  <button
                    onClick={() => removeDate(date)}
                    className="ml-1 hover:opacity-70 transition-opacity"
                  >
                    <X size={13} />
                  </button>
                )}
              </motion.div>
            ))}

            {/* Add date button */}
            {selectedDates.length < 5 && selectableDates.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setDateSelectorOpen(!dateSelectorOpen)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm text-[#64748B] hover:text-[#F1F5F9] hover:bg-[#1A2332] transition-colors border border-dashed border-[#334155]"
                >
                  <Plus size={13} />
                  添加日期
                </button>
                <AnimatePresence>
                  {dateSelectorOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setDateSelectorOpen(false)} />
                      <motion.div
                        initial={{ opacity: 0, y: -5, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -5, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className="absolute top-full left-0 mt-1 z-50 bg-[#1A2332] border border-[#334155] rounded-[10px] shadow-xl overflow-hidden min-w-[160px]"
                      >
                        {selectableDates.map((d) => (
                          <button
                            key={d.date}
                            onClick={() => addDate(d.date)}
                            className="w-full text-left px-4 py-2.5 text-sm text-[#94A3B8] hover:bg-[#1E293B] hover:text-[#F1F5F9] transition-colors flex items-center justify-between"
                          >
                            {d.date}
                            <Plus size={14} />
                          </button>
                        ))}
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* ============================================================ */}
      {/*  COMPARISON SUMMARY BAR                                      */}
      {/* ============================================================ */}
      {selectedDays.length >= 2 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="bg-[#1A2332] rounded-[14px] p-4"
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {selectedDays.map((day, i) => (
              <div key={day.date} className="text-center">
                <div className="text-xs text-[#64748B] mb-1">{day.date}</div>
                <div className="flex items-center justify-center gap-3">
                  <div>
                    <div className="text-sm font-semibold text-[#F1F5F9]">{day.totalMessages.toLocaleString()}</div>
                    <div className="text-[10px] text-[#64748B]">消息</div>
                  </div>
                  <div className="w-px h-6 bg-[#334155]" />
                  <div>
                    <div
                      className="text-sm font-semibold"
                      style={{ color: getDateColor(i) }}
                    >
                      {day.sentiment}
                    </div>
                    <div className="text-[10px] text-[#64748B]">情绪</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* ============================================================ */}
      {/*  STOCK RANKING COMPARISON                                    */}
      {/* ============================================================ */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
      >
        <SectionTitle icon={BarChart3} title="股票热度对比" />
        <div className="bg-[#111827] border border-[#1E293B] rounded-[14px] overflow-hidden">
          <StockCompareTable days={selectedDays} />
        </div>
      </motion.div>

      {/* ============================================================ */}
      {/*  SECTOR RANKING COMPARISON                                   */}
      {/* ============================================================ */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <SectionTitle icon={Layers} title="板块热度对比" />
        <div className="bg-[#111827] border border-[#1E293B] rounded-[14px] overflow-hidden">
          <SectorCompareTable days={selectedDays} />
        </div>
      </motion.div>

      {/* ============================================================ */}
      {/*  SENTIMENT EVOLUTION CHART                                   */}
      {/* ============================================================ */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
      >
        <SectionTitle icon={Activity} title="情绪演化对比" />
        <div className="bg-[#111827] border border-[#1E293B] rounded-[14px] p-5 md:p-6">
          <SentimentCompareChart days={selectedDays} />
        </div>
      </motion.div>

      {/* ============================================================ */}
      {/*  SECTOR PERSISTENCE ANALYSIS                                 */}
      {/* ============================================================ */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <SectionTitle icon={Flame} title="板块持续性分析" />
        <SectorPersistenceAnalysis days={selectedDays} />
      </motion.div>

      {/* ============================================================ */}
      {/*  ACTION SIGNAL COMPARISON                                    */}
      {/* ============================================================ */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45 }}
      >
        <SectionTitle icon={Zap} title="操作信号对比" />
        <div className="bg-[#111827] border border-[#1E293B] rounded-[14px] p-5 md:p-6">
          <ActionSignalCompare days={selectedDays} />
        </div>
      </motion.div>
    </div>
  );
}

/* ================================================================== */
/*  SUB-COMPONENTS                                                    */
/* ================================================================== */

function SectionTitle({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <div className="w-1 h-5 bg-[#3B82F6] rounded-full" />
      <Icon size={18} className="text-[#3B82F6]" />
      <h2 className="text-lg md:text-xl font-semibold text-[#F1F5F9] tracking-tight">{title}</h2>
    </div>
  );
}

/* ---- Stock Compare Table ---- */
function StockCompareTable({ days }: { days: CompareDayData[] }) {
  const navigate = useNavigate();

  /* Build a map of stock -> presence across days */
  const stockPresence = useMemo(() => {
    const map = new Map<
      string,
      { name: string; code: string; ranks: (number | null)[]; heats: (number | null)[] }
    >();

    days.forEach((day, dayIndex) => {
      day.topStocks.forEach((stock) => {
        if (!map.has(stock.code)) {
          map.set(stock.code, {
            name: stock.name,
            code: stock.code,
            ranks: new Array(days.length).fill(null),
            heats: new Array(days.length).fill(null),
          });
        }
        const entry = map.get(stock.code)!;
        entry.ranks[dayIndex] = stock.rank;
        entry.heats[dayIndex] = stock.heat;
      });
    });

    return Array.from(map.values()).sort((a, b) => {
      /* Sort by presence count (most persistent first), then by rank */
      const aPresent = a.ranks.filter((r) => r !== null).length;
      const bPresent = b.ranks.filter((r) => r !== null).length;
      if (bPresent !== aPresent) return bPresent - aPresent;
      return (a.ranks.find((r) => r !== null) ?? 99) - (b.ranks.find((r) => r !== null) ?? 99);
    });
  }, [days]);

  if (days.length === 0) return null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[#1A2332] text-[#64748B] text-xs">
            <th className="text-left px-4 py-3 font-medium sticky left-0 bg-[#1A2332] z-10">股票</th>
            {days.map((day, i) => (
              <th key={day.date} className="text-center px-4 py-3 font-medium min-w-[100px]" style={{ color: getDateColor(i) }}>
                {day.date.slice(5)}
              </th>
            ))}
            <th className="text-center px-4 py-3 font-medium text-[#64748B]">持续性</th>
          </tr>
        </thead>
        <tbody>
          {stockPresence.map((stock) => {
            const presenceCount = stock.ranks.filter((r) => r !== null).length;
            const isPersistent = presenceCount >= 2 && presenceCount === days.length;
            return (
              <tr
                key={stock.code}
                onClick={() => navigate(`/stock/${stock.code}`)}
                className={`border-t border-[#1E293B] hover:bg-[#1E293B]/50 transition-colors cursor-pointer ${
                  isPersistent ? 'bg-[#00E396]/[0.02]' : ''
                }`}
              >
                <td className="px-4 py-3 sticky left-0 bg-inherit z-10">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-[#F1F5F9]">{stock.name}</span>
                    <span className="text-[11px] text-[#475569]">{stock.code}</span>
                    {isPersistent && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#00E396]/10 text-[#00E396]">
                        持续
                      </span>
                    )}
                  </div>
                </td>
                {stock.ranks.map((rank, i) => (
                  <td key={i} className="px-4 py-3 text-center">
                    {rank !== null ? (
                      <div className="flex flex-col items-center">
                        <span className="text-xs font-medium text-[#F1F5F9]">#{rank}</span>
                        <span className="text-[10px]" style={{ color: getDateColor(i) }}>
                          {stock.heats[i]}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[#334155]">—</span>
                    )}
                  </td>
                ))}
                <td className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center">
                    <div className="flex gap-0.5">
                      {stock.ranks.map((rank, i) => (
                        <div
                          key={i}
                          className={`w-2 h-2 rounded-full ${rank !== null ? '' : 'bg-[#334155]'}`}
                          style={rank !== null ? { backgroundColor: getDateColor(i) } : {}}
                        />
                      ))}
                    </div>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ---- Sector Compare Table ---- */
function SectorCompareTable({ days }: { days: CompareDayData[] }) {
  /* Build a map of sector -> presence across days */
  const sectorPresence = useMemo(() => {
    const map = new Map<string, { name: string; ranks: (number | null)[]; heats: (number | null)[] }>();

    days.forEach((day, dayIndex) => {
      day.topSectors.forEach((sector) => {
        if (!map.has(sector.name)) {
          map.set(sector.name, {
            name: sector.name,
            ranks: new Array(days.length).fill(null),
            heats: new Array(days.length).fill(null),
          });
        }
        const entry = map.get(sector.name)!;
        entry.ranks[dayIndex] = sector.rank;
        entry.heats[dayIndex] = sector.heat;
      });
    });

    return Array.from(map.values()).sort((a, b) => {
      const aPresent = a.ranks.filter((r) => r !== null).length;
      const bPresent = b.ranks.filter((r) => r !== null).length;
      if (bPresent !== aPresent) return bPresent - aPresent;
      return (a.ranks.find((r) => r !== null) ?? 99) - (b.ranks.find((r) => r !== null) ?? 99);
    });
  }, [days]);

  if (days.length === 0) return null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[#1A2332] text-[#64748B] text-xs">
            <th className="text-left px-4 py-3 font-medium sticky left-0 bg-[#1A2332] z-10">板块</th>
            {days.map((day, i) => (
              <th key={day.date} className="text-center px-4 py-3 font-medium min-w-[100px]" style={{ color: getDateColor(i) }}>
                {day.date.slice(5)}
              </th>
            ))}
            <th className="text-center px-4 py-3 font-medium text-[#64748B]">持续性</th>
          </tr>
        </thead>
        <tbody>
          {sectorPresence.map((sector) => {
            const presenceCount = sector.ranks.filter((r) => r !== null).length;
            const isPersistent = presenceCount >= 2;
            return (
              <tr
                key={sector.name}
                className={`border-t border-[#1E293B] hover:bg-[#1E293B]/50 transition-colors ${
                  isPersistent ? 'bg-[#00E396]/[0.02]' : ''
                }`}
              >
                <td className="px-4 py-3 sticky left-0 bg-inherit z-10">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-[#F1F5F9]">{sector.name}</span>
                    {isPersistent && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#00E396]/10 text-[#00E396]">
                        持续
                      </span>
                    )}
                  </div>
                </td>
                {sector.ranks.map((rank, i) => (
                  <td key={i} className="px-4 py-3 text-center">
                    {rank !== null ? (
                      <div className="flex flex-col items-center">
                        <span className="text-xs font-medium text-[#F1F5F9]">#{rank}</span>
                        <span className="text-[10px]" style={{ color: getDateColor(i) }}>
                          {sector.heats[i]}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[#334155]">—</span>
                    )}
                  </td>
                ))}
                <td className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center">
                    <div className="flex gap-0.5">
                      {sector.ranks.map((rank, i) => (
                        <div
                          key={i}
                          className={`w-2 h-2 rounded-full ${rank !== null ? '' : 'bg-[#334155]'}`}
                          style={rank !== null ? { backgroundColor: getDateColor(i) } : {}}
                        />
                      ))}
                    </div>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ---- Sentiment Compare Chart ---- */
function SentimentCompareChart({ days }: { days: CompareDayData[] }) {
  /* Merge timelines into chart data */
  const chartData = useMemo(() => {
    if (days.length === 0) return [];

    const timePoints = days[0].sentimentTimeline.map((t) => t.time);
    return timePoints.map((time) => {
      const point: Record<string, string | number> = { time };
      days.forEach((day, i) => {
        const tl = day.sentimentTimeline.find((t) => t.time === time);
        if (tl) {
          point[`bull_${i}`] = tl.bull;
          point[`bear_${i}`] = tl.bear;
        }
      });
      return point;
    });
  }, [days]);

  if (days.length === 0) return null;

  return (
    <div>
      <div className="h-[280px] md:h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
            <XAxis dataKey="time" stroke="#475569" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis domain={[0, 100]} stroke="#475569" fontSize={11} tickLine={false} axisLine={false} width={35} />
            <Tooltip
              contentStyle={{ backgroundColor: '#1A2332', border: '1px solid #334155', borderRadius: '8px', fontSize: '12px' }}
              labelStyle={{ color: '#94A3B8' }}
            />
            <Legend
              wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
              formatter={(value: string) => {
                const match = value.match(/bull_(\d+)|bear_(\d+)/);
                if (!match) return value;
                const type = value.startsWith('bull') ? '看多' : '看空';
                const idx = parseInt(match[1] || match[2], 10);
                return `${days[idx]?.date.slice(5)} ${type}`;
              }}
            />
            {days.map((_day, i) => (
              <Line
                key={`bull_${i}`}
                type="monotone"
                dataKey={`bull_${i}`}
                stroke={getDateColor(i)}
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4 }}
              />
            ))}
            {days.map((_day, i) => (
              <Line
                key={`bear_${i}`}
                type="monotone"
                dataKey={`bear_${i}`}
                stroke={getDateColor(i)}
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={false}
                activeDot={{ r: 3 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Legend helper */}
      <div className="flex flex-wrap items-center justify-center gap-4 mt-3 pt-3 border-t border-[#1E293B]">
        {days.map((day, i) => (
          <div key={day.date} className="flex items-center gap-2 text-xs">
            <div className="w-3 h-0.5 rounded" style={{ backgroundColor: getDateColor(i) }} />
            <span className="text-[#94A3B8]">{day.date}</span>
          </div>
        ))}
        <div className="flex items-center gap-3 text-[10px] text-[#475569]">
          <span className="flex items-center gap-1">
            <span className="w-4 h-0.5 bg-[#64748B] rounded" />
            实线=看多
          </span>
          <span className="flex items-center gap-1">
            <span className="w-4 h-0.5 bg-[#64748B] rounded" style={{ background: 'repeating-linear-gradient(90deg, #64748B 0, #64748B 3px, transparent 3px, transparent 6px)' }} />
            虚线=看空
          </span>
        </div>
      </div>
    </div>
  );
}

/* ---- Sector Persistence Analysis ---- */
function SectorPersistenceAnalysis({ days }: { days: CompareDayData[] }) {
  if (days.length < 2) {
    return (
      <div className="bg-[#111827] border border-[#1E293B] rounded-[14px] p-8 text-center text-sm text-[#64748B]">
        请选择至少两个日期进行对比分析
      </div>
    );
  }

  /* Categorize sectors */
  const { persistent, emerging, faded } = useMemo(() => {
    const firstDayTop = new Set(days[0].topSectors.slice(0, 5).map((s) => s.name));
    const lastDayTop = new Set(days[days.length - 1].topSectors.slice(0, 5).map((s) => s.name));
    const allSectors = new Set([...firstDayTop, ...lastDayTop]);

    const persistentSectors: Array<{ name: string; heat: number }> = [];
    const emergingSectors: Array<{ name: string; heat: number }> = [];
    const fadedSectors: Array<{ name: string }> = [];

    allSectors.forEach((name) => {
      const inFirst = firstDayTop.has(name);
      const inLast = lastDayTop.has(name);
      if (inFirst && inLast) {
        const sector = days[days.length - 1].topSectors.find((s) => s.name === name);
        persistentSectors.push({ name, heat: sector?.heat ?? 0 });
      } else if (!inFirst && inLast) {
        const sector = days[days.length - 1].topSectors.find((s) => s.name === name);
        emergingSectors.push({ name, heat: sector?.heat ?? 0 });
      } else if (inFirst && !inLast) {
        fadedSectors.push({ name });
      }
    });

    return { persistent: persistentSectors, emerging: emergingSectors, faded: fadedSectors };
  }, [days]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Persistent */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-[#111827] border border-[#1E293B] rounded-[14px] p-5 border-t-[3px] border-t-[#EF4444]"
      >
        <div className="flex items-center gap-2 mb-4">
          <Flame size={16} className="text-[#EF4444]" />
          <h3 className="text-sm font-semibold text-[#F1F5F9]">持续热门</h3>
          <span className="text-xs text-[#64748B] ml-auto">{persistent.length}个</span>
        </div>
        <div className="space-y-3">
          <AnimatePresence>
            {persistent.map((sector) => (
              <motion.div
                key={sector.name}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center justify-between p-2.5 rounded-lg bg-[#1A2332]"
              >
                <span className="text-sm text-[#F1F5F9]">{sector.name}</span>
                <span className="text-xs text-[#EF4444] font-medium">热度 {sector.heat}</span>
              </motion.div>
            ))}
          </AnimatePresence>
          {persistent.length === 0 && (
            <p className="text-xs text-[#475569] text-center py-4">无持续热门板块</p>
          )}
        </div>
      </motion.div>

      {/* Emerging */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-[#111827] border border-[#1E293B] rounded-[14px] p-5 border-t-[3px] border-t-[#00E396]"
      >
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp size={16} className="text-[#00E396]" />
          <h3 className="text-sm font-semibold text-[#F1F5F9]">新晋热门</h3>
          <span className="text-xs text-[#64748B] ml-auto">{emerging.length}个</span>
        </div>
        <div className="space-y-3">
          <AnimatePresence>
            {emerging.map((sector) => (
              <motion.div
                key={sector.name}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center justify-between p-2.5 rounded-lg bg-[#1A2332]"
              >
                <span className="text-sm text-[#F1F5F9]">{sector.name}</span>
                <span className="text-xs text-[#00E396] font-medium">热度 {sector.heat}</span>
              </motion.div>
            ))}
          </AnimatePresence>
          {emerging.length === 0 && (
            <p className="text-xs text-[#475569] text-center py-4">无新晋热门板块</p>
          )}
        </div>
      </motion.div>

      {/* Faded */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-[#111827] border border-[#1E293B] rounded-[14px] p-5 border-t-[3px] border-t-[#475569]"
      >
        <div className="flex items-center gap-2 mb-4">
          <TrendingDown size={16} className="text-[#475569]" />
          <h3 className="text-sm font-semibold text-[#F1F5F9]">热度消退</h3>
          <span className="text-xs text-[#64748B] ml-auto">{faded.length}个</span>
        </div>
        <div className="space-y-3">
          <AnimatePresence>
            {faded.map((sector) => (
              <motion.div
                key={sector.name}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center justify-between p-2.5 rounded-lg bg-[#1A2332]"
              >
                <span className="text-sm text-[#475569]">{sector.name}</span>
                <span className="text-xs text-[#475569]">跌出Top5</span>
              </motion.div>
            ))}
          </AnimatePresence>
          {faded.length === 0 && (
            <p className="text-xs text-[#475569] text-center py-4">无消退板块</p>
          )}
        </div>
      </motion.div>
    </div>
  );
}

/* ---- Action Signal Compare ---- */
function ActionSignalCompare({ days }: { days: CompareDayData[] }) {
  const chartData = useMemo(() => {
    const actions = ['买入', '卖出', '持有', '风险'];
    return actions.map((action) => {
      const point: Record<string, string | number> = { action };
      days.forEach((day, i) => {
        point[`day${i}`] = day.actionCounts[action] ?? 0;
      });
      return point;
    });
  }, [days]);

  if (days.length === 0) return null;

  return (
    <div>
      <div className="h-[220px] md:h-[250px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} barCategoryGap="20%">
            <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
            <XAxis dataKey="action" stroke="#475569" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis stroke="#475569" fontSize={11} tickLine={false} axisLine={false} width={35} />
            <Tooltip
              contentStyle={{ backgroundColor: '#1A2332', border: '1px solid #334155', borderRadius: '8px', fontSize: '12px' }}
              labelStyle={{ color: '#94A3B8' }}
            />
            <Legend
              wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
              formatter={(value: string) => {
                const match = value.match(/day(\d+)/);
                if (!match) return value;
                const idx = parseInt(match[1], 10);
                return days[idx]?.date ?? value;
              }}
            />
            {days.map((_, i) => (
              <Bar key={`day${i}`} dataKey={`day${i}`} fill={getDateColor(i)} radius={[4, 4, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Action tendency summary */}
      {days.length >= 2 && (
        <div className="mt-4 pt-4 border-t border-[#1E293B] grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {days.map((day, i) => {
            const buyCount = day.actionCounts['买入'] ?? 0;
            const sellCount = day.actionCounts['卖出'] ?? 0;
            const ratio = sellCount > 0 ? (buyCount / sellCount).toFixed(1) : '∞';
            return (
              <motion.div
                key={day.date}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + i * 0.1 }}
                className="flex items-center gap-3 p-3 rounded-lg bg-[#1A2332]"
              >
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: getDateColor(i) }} />
                <div>
                  <div className="text-xs text-[#64748B]">{day.date}</div>
                  <div className="text-sm text-[#F1F5F9]">
                    买/卖比: <span className="font-semibold text-[#3B82F6]">{ratio}</span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
