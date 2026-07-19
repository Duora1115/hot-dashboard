import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useSpring, useMotionValue, useTransform } from 'framer-motion';
import {
  Activity,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Info,
  RefreshCw,
  Zap,
  MessageCircle,
  BarChart3,
  Flame,
  Snowflake,
  Lightbulb,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { useStore } from '@/store/useStore';
import type { Snapshot } from '@/types/api';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getSentimentLabel(sd: { bu: number; be: number; ne: number }) {
  const total = sd.bu + sd.be + sd.ne;
  if (total === 0) return { label: '观望为主', color: '#FBBF24' };
  const bullRatio = sd.bu / total;
  const bearRatio = sd.be / total;
  if (bullRatio > 0.5) return { label: '偏多', color: '#00E396' };
  if (bearRatio > 0.3) return { label: '偏空', color: '#FF4560' };
  if (Math.abs(bullRatio - bearRatio) < 0.1) return { label: '分歧', color: '#8B5CF6' };
  return { label: '观望为主', color: '#FBBF24' };
}

function getSentimentAngle(sd: { bu: number; be: number; ne: number }) {
  const total = sd.bu + sd.be + sd.ne;
  if (total === 0) return 0;
  const ratio = (sd.bu - sd.be) / total;
  // Map -1..1 to -90..90 degrees
  return ratio * 90;
}

function getAlertLevel(eh: number, el: number) {
  if (eh > 5 || el > 5) return { level: 'warning', color: '#FF4560', pulse: 'animate-pulse' };
  if (eh > 3 || el > 3) return { level: 'caution', color: '#FBBF24', pulse: 'animate-pulse' };
  return { level: 'normal', color: '#00E396', pulse: '' };
}

interface GroupHeatCell {
  group: string;
  msgCount: number;
  sent: string; // overall sentiment at that snapshot
  bu: number;
  be: number;
  ne: number;
}

function getGroupCellColor(cell: GroupHeatCell | undefined) {
  if (!cell || cell.msgCount === 0) return { bg: 'bg-[#1A2332]', opacity: 1, pulse: false };
  // Color by overall sentiment of the snapshot, intensity by group activity
  const intensity = Math.min(1, cell.msgCount / 15);
  if (cell.sent === '偏多') {
    return { bg: 'bg-[#00E396]', opacity: 0.15 + intensity * 0.7, pulse: false };
  }
  if (cell.sent === '偏空') {
    return { bg: 'bg-[#FF4560]', opacity: 0.15 + intensity * 0.7, pulse: false };
  }
  if (cell.sent === '分歧') {
    return { bg: 'bg-[#8B5CF6]', opacity: 0.15 + intensity * 0.5, pulse: false };
  }
  // 观望为主
  return { bg: 'bg-[#FBBF24]', opacity: 0.15 + intensity * 0.4, pulse: false };
}

/* ------------------------------------------------------------------ */
/*  Build group heatmap from real snapshots                             */
/* ------------------------------------------------------------------ */

function buildGroupHeatmap(
  snapshots: Snapshot[],
  groups: string[]
): GroupHeatCell[][] {
  // rows = groups, cols = snapshot indices
  return groups.map((groupName) =>
    snapshots.map((snap) => {
      let msgCount = 0;
      for (const sec of snap.sec) {
        for (const gd of sec.gd) {
          if (gd.g === groupName) {
            msgCount += gd.c;
          }
        }
      }
      return {
        group: groupName,
        msgCount,
        sent: snap.sent,
        bu: snap.sd.bu,
        be: snap.sd.be,
        ne: snap.sd.ne,
      };
    })
  );
}

/* ------------------------------------------------------------------ */
/*  AnimatedCounter                                                    */
/* ------------------------------------------------------------------ */

function AnimatedCounter({ value, duration = 0.8 }: { value: number; duration?: number }) {
  const motionVal = useMotionValue(0);
  const springVal = useSpring(motionVal, { duration: duration * 1000, bounce: 0 });
  const display = useTransform(springVal, (v) => Math.round(v));
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    motionVal.set(value);
  }, [value, motionVal]);

  useEffect(() => {
    const unsub = display.on('change', (v) => {
      if (ref.current) ref.current.textContent = String(v);
    });
    return unsub;
  }, [display]);

  return <span ref={ref}>0</span>;
}

/* ------------------------------------------------------------------ */
/*  SentimentGauge (SVG semi-circle gauge)                             */
/* ------------------------------------------------------------------ */

function SentimentGauge({ sd }: { sd: { bu: number; be: number; ne: number } }) {
  const total = sd.bu + sd.be + sd.ne;
  const { label, color } = getSentimentLabel(sd);
  const targetAngle = getSentimentAngle(sd);

  const motionVal = useMotionValue(0);
  const springVal = useSpring(motionVal, { stiffness: 100, damping: 15 });
  const rotate = useTransform(springVal, (v) => v);

  useEffect(() => {
    motionVal.set(targetAngle);
  }, [targetAngle, motionVal]);

  // Gauge dimensions
  const size = 280;
  const radius = 110;
  const cx = size / 2;
  const cy = size / 2 + 10;
  const strokeWidth = 18;

  // Arc paths for three segments
  const arcPath = (startAngle: number, endAngle: number) => {
    const start = polarToCartesian(cx, cy, radius, endAngle);
    const end = polarToCartesian(cx, cy, radius, startAngle);
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 0 ${end.x} ${end.y}`;
  };

  function polarToCartesian(centerX: number, centerY: number, r: number, angleDeg: number) {
    const angleRad = ((angleDeg - 180) * Math.PI) / 180;
    return {
      x: centerX + r * Math.cos(angleRad),
      y: centerY + r * Math.sin(angleRad),
    };
  }

  // Bull zone: -90 to -30, Neutral: -30 to 30, Bear: 30 to 90
  const bullPath = arcPath(-90, -30);
  const neutralPath = arcPath(-30, 30);
  const bearPath = arcPath(30, 90);

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size / 2 + 30 }}>
        <svg width={size} height={size / 2 + 30} viewBox={`0 0 ${size} ${size / 2 + 30}`}>
          {/* Background arc */}
          <path d={arcPath(-90, 90)} fill="none" stroke="#1E293B" strokeWidth={strokeWidth} strokeLinecap="round" />
          {/* Bull zone (green) */}
          <path d={bullPath} fill="none" stroke="#00E396" strokeWidth={strokeWidth} strokeLinecap="round" opacity={0.7} />
          {/* Neutral zone (yellow) */}
          <path d={neutralPath} fill="none" stroke="#FBBF24" strokeWidth={strokeWidth} strokeLinecap="round" opacity={0.7} />
          {/* Bear zone (red) */}
          <path d={bearPath} fill="none" stroke="#FF4560" strokeWidth={strokeWidth} strokeLinecap="round" opacity={0.7} />

          {/* Ticks */}
          {[-60, -30, 0, 30, 60].map((angle) => {
            const start = polarToCartesian(cx, cy, radius - strokeWidth / 2 - 4, angle);
            const end = polarToCartesian(cx, cy, radius - strokeWidth / 2 - 10, angle);
            return (
              <line key={angle} x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="#334155" strokeWidth={1.5} />
            );
          })}
        </svg>

        {/* Needle - rotated via motion.div */}
        <motion.div
          className="absolute"
          style={{
            left: cx,
            top: cy,
            width: 2,
            height: radius - 14,
            backgroundColor: '#F1F5F9',
            transformOrigin: 'top center',
            rotate,
            translateX: '-50%',
            borderRadius: '0 0 1px 1px',
          }}
        />

        {/* Center pivot */}
        <div
          className="absolute w-4 h-4 rounded-full bg-[#0B0E14] border-2 border-[#F1F5F9]"
          style={{ left: cx - 8, top: cy - 8 }}
        />

        {/* Center label */}
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-2">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="text-center"
          >
            <div className="text-xl font-bold" style={{ color }}>{label}</div>
            <div className="text-xs text-[#64748B] mt-0.5">总样本 {total}</div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  SentimentDistribution (Donut Chart)                                */
/* ------------------------------------------------------------------ */

function SentimentDistribution({ sd }: { sd: { bu: number; be: number; ne: number } }) {
  const total = sd.bu + sd.be + sd.ne;
  const data = [
    { name: '看多', value: sd.bu, color: '#00E396' },
    { name: '观望', value: sd.ne, color: '#FBBF24' },
    { name: '看空', value: sd.be, color: '#FF4560' },
  ];

  return (
    <div className="flex flex-col items-center">
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={90}
              paddingAngle={2}
              dataKey="value"
              animationDuration={1000}
              animationBegin={200}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: '#1E293B',
                border: '1px solid #334155',
                borderRadius: '8px',
                fontSize: '12px',
              }}
              labelStyle={{ color: '#F1F5F9' }}
              formatter={(value: number, name: string) => [`${value} (${((value / total) * 100).toFixed(0)}%)`, name]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="text-center -mt-2">
        <div className="text-2xl font-bold text-[#F1F5F9]">{total}</div>
        <div className="text-xs text-[#64748B]">总样本</div>
      </div>
      {/* Legend */}
      <div className="flex gap-4 mt-3">
        {data.map((d) => (
          <div key={d.name} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
            <span className="text-xs text-[#94A3B8]">{d.name}</span>
            <span className="text-xs font-medium text-[#F1F5F9]">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ExtremeAlerts                                                      */
/* ------------------------------------------------------------------ */

function ExtremeAlerts({ eh, el, monthExtremeHigh, monthExtremeLow }: { eh: number; el: number; monthExtremeHigh: number; monthExtremeLow: number }) {
  const alertLevel = getAlertLevel(eh, el);

  return (
    <div className="space-y-4">
      {/* Alert status indicator */}
      <div className="flex items-center gap-2 mb-4">
        <div className={`w-2.5 h-2.5 rounded-full ${alertLevel.pulse}`} style={{ backgroundColor: alertLevel.color }} />
        <span className="text-xs text-[#94A3B8]">
          {alertLevel.level === 'normal' ? '情绪正常' : alertLevel.level === 'caution' ? '情绪偏极' : '极值预警'}
        </span>
      </div>

      {/* Extreme High Card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="bg-[#1A2332] rounded-xl p-4 border-t-[3px] border-[#8B5CF6] relative overflow-hidden"
      >
        {eh > 3 && (
          <div className="absolute inset-0 bg-[#8B5CF6]/5 animate-pulse pointer-events-none" />
        )}
        <div className="flex items-center gap-2 mb-2">
          <Flame size={16} className="text-[#8B5CF6]" />
          <span className="text-sm font-medium text-[#F1F5F9]">极度亢奋</span>
          <span className="text-lg font-bold text-[#8B5CF6] ml-auto">
            <AnimatedCounter value={eh} />
          </span>
        </div>
        <div className="text-xs text-[#64748B] space-y-1">
          <p>最近: 09:35 ({eh > 0 ? `${eh}次` : '无'})</p>
          {eh > 3 && (
            <p className="text-[#8B5CF6] flex items-center gap-1">
              <AlertTriangle size={12} />
              市场可能过热，注意回调风险
            </p>
          )}
        </div>
      </motion.div>

      {/* Extreme Low Card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-[#1A2332] rounded-xl p-4 border-t-[3px] border-[#64748B] relative overflow-hidden"
      >
        {el > 3 && (
          <div className="absolute inset-0 bg-[#64748B]/5 animate-pulse pointer-events-none" />
        )}
        <div className="flex items-center gap-2 mb-2">
          <Snowflake size={16} className="text-[#64748B]" />
          <span className="text-sm font-medium text-[#F1F5F9]">极度悲观</span>
          <span className="text-lg font-bold text-[#64748B] ml-auto">
            <AnimatedCounter value={el} />
          </span>
        </div>
        <div className="text-xs text-[#64748B] space-y-1">
          <p>最近: 09:15 ({el > 0 ? `${el}次` : '无'})</p>
          {el > 3 && (
            <p className="text-[#94A3B8] flex items-center gap-1">
              <Info size={12} />
              或存在反弹窗口
            </p>
          )}
        </div>
      </motion.div>

      {/* Historical stats */}
      <div className="bg-[#1A2332] rounded-xl p-4">
        <h4 className="text-xs font-medium text-[#94A3B8] mb-2 flex items-center gap-1.5">
          <BarChart3 size={12} />
          历史极值统计
        </h4>
        <div className="space-y-1 text-xs">
          <div className="flex justify-between text-[#94A3B8]">
            <span>本月极度亢奋</span>
            <span className="text-[#8B5CF6] font-medium">{monthExtremeHigh} 次</span>
          </div>
          <div className="flex justify-between text-[#94A3B8]">
            <span>本月极度悲观</span>
            <span className="text-[#64748B] font-medium">{monthExtremeLow} 次</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  SentimentInsights                                                  */
/* ------------------------------------------------------------------ */

function SentimentInsights({ sd }: { sd: { bu: number; be: number; ne: number; eh: number; el: number } }) {
  const total = sd.bu + sd.be + sd.ne;
  const bullRatio = total > 0 ? (sd.bu / total) * 100 : 0;
  const bearRatio = total > 0 ? (sd.be / total) * 100 : 0;

  const insights = useMemo(() => {
    const items: Array<{ icon: React.ReactNode; text: string; color: string }> = [];

    if (sd.bu > sd.be * 1.5) {
      items.push({
        icon: <TrendingUp size={16} className="text-[#00E396] shrink-0 mt-0.5" />,
        text: `市场情绪偏多，买方力量占优（看多${bullRatio.toFixed(0)}%），建议关注领涨板块。`,
        color: 'text-[#00E396]',
      });
    } else if (sd.be > sd.bu * 1.2) {
      items.push({
        icon: <TrendingDown size={16} className="text-[#FF4560] shrink-0 mt-0.5" />,
        text: `市场情绪偏空，卖方力量占优（看空${bearRatio.toFixed(0)}%），建议控制仓位。`,
        color: 'text-[#FF4560]',
      });
    } else if (Math.abs(sd.bu - sd.be) < 5) {
      items.push({
        icon: <Zap size={16} className="text-[#8B5CF6] shrink-0 mt-0.5" />,
        text: '多空分歧明显，建议观望，等待方向明朗后再做决策。',
        color: 'text-[#8B5CF6]',
      });
    } else {
      items.push({
        icon: <Info size={16} className="text-[#FBBF24] shrink-0 mt-0.5" />,
        text: '市场情绪以观望为主，交投谨慎，关注消息面变化。',
        color: 'text-[#FBBF24]',
      });
    }

    if (sd.eh > 3) {
      items.push({
        icon: <Flame size={16} className="text-[#8B5CF6] shrink-0 mt-0.5" />,
        text: '情绪极度亢奋，注意追高风险，警惕获利回吐压力。',
        color: 'text-[#8B5CF6]',
      });
    }

    if (sd.el > 3) {
      items.push({
        icon: <Snowflake size={16} className="text-[#64748B] shrink-0 mt-0.5" />,
        text: '情绪极度悲观，或存在反弹机会，关注超跌品种。',
        color: 'text-[#94A3B8]',
      });
    }

    items.push({
      icon: <Lightbulb size={16} className="text-[#3B82F6] shrink-0 mt-0.5" />,
      text: '操作建议: 维持偏多但谨慎态度，重点关注有持续资金流入的板块，避免追高。',
      color: 'text-[#3B82F6]',
    });

    return items;
  }, [sd, bullRatio, bearRatio]);

  return (
    <div className="space-y-4">
      {insights.map((insight, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 + i * 0.3, duration: 0.4 }}
          className="flex gap-3"
        >
          {insight.icon}
          <p className={`text-sm leading-relaxed ${insight.color}`}>{insight.text}</p>
        </motion.div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Sentiment Page                                                */
/* ------------------------------------------------------------------ */

export default function Sentiment() {
  const currentSnapshot = useStore((s) => s.currentSnapshot);
  const snapshots = useStore((s) => s.currentDayData?.snapshots ?? []);
  const dayFullLoaded = useStore((s) => s.dayFullLoaded);
  const loadDayFull = useStore((s) => s.loadDayFull);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const currentDate = useStore((s) => s.currentDate);
  const [extremeStats, setExtremeStats] = useState({ month_extreme_high: 0, month_extreme_low: 0 });

  useEffect(() => {
    if (!dayFullLoaded) loadDayFull();
  }, [dayFullLoaded, loadDayFull]);

  useEffect(() => {
    if (currentDate) {
      import('@/lib/api').then(({ fetchExtremeStats }) =>
        fetchExtremeStats(currentDate).then(setExtremeStats).catch(() => {})
      );
    }
  }, [currentDate]);

  const sd = currentSnapshot?.sd || { bu: 62, be: 13, ne: 25, eh: 3, el: 1 };
  const total = sd.bu + sd.be + sd.ne;
  const alertLevel = getAlertLevel(sd.eh, sd.el);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 800);
  }, []);

  // Time labels from real snapshots
  const timeSlots = useMemo(
    () => snapshots.map((s) => s.t.split(' ')[1] ?? s.t),
    [snapshots]
  );

  // Chart data from real snapshots
  const areaData = useMemo(() => {
    return snapshots.map((s) => ({
      time: s.t.split(' ')[1] ?? s.t,
      看多: s.sd.bu,
      观望: s.sd.ne,
      看空: s.sd.be,
      极度亢奋: s.sd.eh,
      极度悲观: s.sd.el,
    }));
  }, [snapshots]);

  // Collect unique group names across all snapshots' sector group_details
  const groups = useMemo(() => {
    const set = new Set<string>();
    for (const snap of snapshots) {
      for (const sec of snap.sec) {
        for (const gd of sec.gd) {
          set.add(gd.g);
        }
      }
    }
    return Array.from(set).sort();
  }, [snapshots]);

  // Group heatmap: rows = groups, cols = snapshot time slots
  const groupHeatRows = useMemo(
    () => buildGroupHeatmap(snapshots, groups),
    [snapshots, groups]
  );

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
          <Activity size={22} className="text-[#8B5CF6]" />
          <h1 className="text-2xl font-semibold text-[#F1F5F9] tracking-tight">情绪深度</h1>
        </div>
        <div className="flex items-center gap-3">
          {/* Alert indicator */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#1A2332]">
            <div className={`w-2 h-2 rounded-full ${alertLevel.pulse}`} style={{ backgroundColor: alertLevel.color }} />
            <span className="text-xs text-[#94A3B8]">
              {alertLevel.level === 'normal' ? '正常' : alertLevel.level === 'caution' ? '注意' : '警告'}
            </span>
          </div>
          <button
            onClick={handleRefresh}
            className="p-2 rounded-lg bg-[#1A2332] text-[#64748B] hover:text-[#F1F5F9] hover:bg-[#1E293B] transition-colors"
          >
            <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </motion.div>

      {/* Gauge + Stats Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="bg-[#111827] rounded-xl border border-[#1E293B] p-4 md:p-6"
      >
        <div className="flex flex-col lg:flex-row items-center gap-6 lg:gap-10">
          {/* Gauge */}
          <div className="shrink-0">
            <SentimentGauge sd={sd} />
          </div>

          {/* Stats */}
          <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-4 w-full">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-[#1A2332] rounded-xl p-4"
            >
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp size={14} className="text-[#00E396]" />
                <span className="text-xs text-[#64748B]">看多</span>
              </div>
              <div className="text-xl font-bold text-[#00E396]">
                <AnimatedCounter value={sd.bu} />
              </div>
              <div className="text-xs text-[#475569]">{total > 0 ? ((sd.bu / total) * 100).toFixed(0) : 0}%</div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="bg-[#1A2332] rounded-xl p-4"
            >
              <div className="flex items-center gap-2 mb-1">
                <Info size={14} className="text-[#FBBF24]" />
                <span className="text-xs text-[#64748B]">观望</span>
              </div>
              <div className="text-xl font-bold text-[#FBBF24]">
                <AnimatedCounter value={sd.ne} />
              </div>
              <div className="text-xs text-[#475569]">{total > 0 ? ((sd.ne / total) * 100).toFixed(0) : 0}%</div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="bg-[#1A2332] rounded-xl p-4"
            >
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown size={14} className="text-[#FF4560]" />
                <span className="text-xs text-[#64748B]">看空</span>
              </div>
              <div className="text-xl font-bold text-[#FF4560]">
                <AnimatedCounter value={sd.be} />
              </div>
              <div className="text-xs text-[#475569]">{total > 0 ? ((sd.be / total) * 100).toFixed(0) : 0}%</div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="bg-[#1A2332] rounded-xl p-4"
            >
              <div className="flex items-center gap-2 mb-1">
                <Flame size={14} className="text-[#8B5CF6]" />
                <span className="text-xs text-[#64748B]">极度亢奋</span>
              </div>
              <div className="text-xl font-bold text-[#8B5CF6]">
                <AnimatedCounter value={sd.eh} />
              </div>
              <div className="text-xs text-[#475569]">次</div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
              className="bg-[#1A2332] rounded-xl p-4"
            >
              <div className="flex items-center gap-2 mb-1">
                <Snowflake size={14} className="text-[#64748B]" />
                <span className="text-xs text-[#64748B]">极度悲观</span>
              </div>
              <div className="text-xl font-bold text-[#94A3B8]">
                <AnimatedCounter value={sd.el} />
              </div>
              <div className="text-xs text-[#475569]">次</div>
            </motion.div>
          </div>
        </div>

        {/* Warning banners */}
        <AnimatePresence>
          {sd.eh > 5 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#8B5CF6]/10 border border-[#8B5CF6]/30"
            >
              <AlertTriangle size={16} className="text-[#8B5CF6] shrink-0" />
              <span className="text-sm text-[#8B5CF6]">市场极度亢奋，注意追高风险</span>
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {sd.el > 5 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#FF4560]/10 border border-[#FF4560]/30"
            >
              <AlertTriangle size={16} className="text-[#FF4560] shrink-0" />
              <span className="text-sm text-[#FF4560]">市场极度悲观，或存在反弹机会</span>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Sentiment Time Series */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
        className="bg-[#111827] rounded-xl border border-[#1E293B] p-4 md:p-5"
      >
        <h2 className="text-lg font-semibold text-[#F1F5F9] mb-4 flex items-center gap-2">
          <Activity size={18} className="text-[#8B5CF6]" />
          情绪时间序列
        </h2>
        <div className="h-64 md:h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={areaData}>
              <defs>
                <linearGradient id="gradBu" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00E396" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#00E396" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradNe" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FBBF24" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#FBBF24" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradBe" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FF4560" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#FF4560" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
              <XAxis dataKey="time" tick={{ fill: '#475569', fontSize: 11 }} axisLine={{ stroke: '#1E293B' }} tickLine={false} />
              <YAxis tick={{ fill: '#475569', fontSize: 11 }} axisLine={{ stroke: '#1E293B' }} tickLine={false} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1E293B', border: '1px solid #334155', borderRadius: '8px', fontSize: '12px' }}
                labelStyle={{ color: '#F1F5F9' }}
              />
              <Area type="monotone" dataKey="看多" stackId="1" stroke="#00E396" fill="url(#gradBu)" animationDuration={1200} />
              <Area type="monotone" dataKey="观望" stackId="1" stroke="#FBBF24" fill="url(#gradNe)" animationDuration={1200} animationBegin={200} />
              <Area type="monotone" dataKey="看空" stackId="1" stroke="#FF4560" fill="url(#gradBe)" animationDuration={1200} animationBegin={400} />
              <Area type="monotone" dataKey="极度亢奋" stroke="#8B5CF6" fill="none" strokeDasharray="4 4" strokeWidth={1.5} animationDuration={1000} animationBegin={600} />
              <Area type="monotone" dataKey="极度悲观" stroke="#64748B" fill="none" strokeDasharray="4 4" strokeWidth={1.5} animationDuration={1000} animationBegin={800} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      {/* Distribution + Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="bg-[#111827] rounded-xl border border-[#1E293B] p-4 md:p-5"
        >
          <h2 className="text-lg font-semibold text-[#F1F5F9] mb-4 flex items-center gap-2">
            <PieChartIcon />
            情绪分布
          </h2>
          <SentimentDistribution sd={sd} />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.4 }}
          className="bg-[#111827] rounded-xl border border-[#1E293B] p-4 md:p-5"
        >
          <h2 className="text-lg font-semibold text-[#F1F5F9] mb-4 flex items-center gap-2">
            <AlertTriangle size={18} className="text-[#FBBF24]" />
            极值预警
          </h2>
          <ExtremeAlerts eh={sd.eh} el={sd.el} monthExtremeHigh={extremeStats.month_extreme_high} monthExtremeLow={extremeStats.month_extreme_low} />
        </motion.div>
      </div>

      {/* Group × Time Heatmap */}
      <div
        className="bg-[#111827] rounded-xl border border-[#1E293B] p-4 md:p-5"
      >
        <h2 className="text-lg font-semibold text-[#F1F5F9] mb-4 flex items-center gap-2">
          <MessageCircle size={18} className="text-[#06B6D4]" />
          群活跃度热力图
        </h2>
        {groups.length === 0 ? (
          <div className="text-center py-8 text-[#64748B] text-sm">暂无群消息数据</div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[600px]">
              {/* Time header */}
              <div className="flex items-center mb-1">
                <div className="w-20 shrink-0" />
                {timeSlots.map((t) => (
                  <div key={t} className="flex-1 text-center text-[10px] text-[#475569] font-mono">
                    {t}
                  </div>
                ))}
              </div>
              {/* Heatmap rows */}
              {groups.map((group, gi) => (
                <div key={group} className="flex items-center mb-[2px]">
                  <div className="w-20 shrink-0 pr-2 text-right text-xs text-[#94A3B8] truncate">
                    {group}
                  </div>
                  <div className="flex-1 flex gap-[2px]">
                    {timeSlots.map((t, ti) => {
                      const cell = groupHeatRows[gi]?.[ti];
                      const style = getGroupCellColor(cell);
                      const msgCount = cell?.msgCount ?? 0;
                      return (
                        <div
                          key={t}
                          className={`flex-1 aspect-[2/3] rounded-sm relative group cursor-pointer transition-opacity hover:opacity-80 ${style.bg} ${style.pulse ? 'animate-pulse' : ''}`}
                          style={{ opacity: style.opacity }}
                          title={`${group} ${t} · 消息:${msgCount} · ${cell?.sent ?? ''}`}
                        >
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-[#1E293B] rounded text-[10px] text-[#F1F5F9] whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10 shadow-lg">
                            {group} {t}
                            <br />
                            消息: {msgCount} · {cell?.sent ?? '-'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {/* Legend */}
        <div className="flex flex-wrap gap-4 mt-4 justify-center">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-[#00E396] opacity-70" />
            <span className="text-xs text-[#94A3B8]">偏多</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-[#FBBF24] opacity-50" />
            <span className="text-xs text-[#94A3B8]">观望</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-[#FF4560] opacity-70" />
            <span className="text-xs text-[#94A3B8]">偏空</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-[#8B5CF6] opacity-60" />
            <span className="text-xs text-[#94A3B8]">分歧</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-[#94A3B8]">颜色越深 = 群消息越活跃</span>
          </div>
        </div>
      </div>

      {/* Sentiment Insights */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.6 }}
        className="bg-[#111827] rounded-xl border border-[#1E293B] p-4 md:p-6 border-l-4 border-l-[#8B5CF6]"
      >
        <h2 className="text-lg font-semibold text-[#8B5CF6] mb-4 flex items-center gap-2">
          <Lightbulb size={18} />
          情绪洞察
        </h2>
        <SentimentInsights sd={sd} />
      </motion.div>
    </div>
  );
}

/* Pie chart icon */
function PieChartIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
      <path d="M22 12A10 10 0 0 0 12 2v10z" />
    </svg>
  );
}
