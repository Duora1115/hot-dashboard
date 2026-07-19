import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useSpring, useMotionValue, useTransform } from 'framer-motion';
import {
  TrendingUp,
  Layers,
  Activity,
  Zap,
  MessageCircle,
  Users,
  BarChart3,
  Grid3x3,
  ChevronDown,
  RefreshCw,
  Flame,
} from 'lucide-react';
import { useStore } from '@/store/useStore';
import type { Snapshot, StockItem, SectorItem } from '@/types/api';

/* ------------------------------------------------------------------ */
/*  AnimatedCounter — counts up on mount / value change               */
/* ------------------------------------------------------------------ */
function AnimatedCounter({ value, duration = 0.6 }: { value: number; duration?: number }) {
  const motionVal = useMotionValue(0);
  const springVal = useSpring(motionVal, { duration: duration * 1000, bounce: 0 });
  const display = useTransform(springVal, (v) => Math.round(v).toLocaleString());
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    motionVal.set(value);
  }, [value, motionVal]);

  useEffect(() => {
    const unsub = display.on('change', (v) => {
      if (ref.current) ref.current.textContent = v;
    });
    return unsub;
  }, [display]);

  return <span ref={ref}>0</span>;
}

/* ------------------------------------------------------------------ */
/*  HeatBar — gradient progress bar                                   */
/* ------------------------------------------------------------------ */
function HeatBar({ score, height = 6 }: { score: number; height?: number }) {
  const getColor = () => {
    if (score >= 80) return 'bg-[#EF4444]';
    if (score >= 60) return 'bg-[#F59E0B]';
    return 'bg-[#10B981]';
  };

  return (
    <div className="w-full rounded-full bg-[#1E293B] overflow-hidden" style={{ height }}>
      <motion.div
        className={`h-full rounded-full ${getColor()}`}
        initial={{ width: 0 }}
        animate={{ width: `${score}%` }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  RankBadge — ranking circle                                        */
/* ------------------------------------------------------------------ */
function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-[#0B0E14] bg-gradient-to-br from-[#FFD700] to-[#FFA500]">
        1
      </div>
    );
  }
  if (rank === 2) {
    return (
      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-[#0B0E14] bg-gradient-to-br from-[#C0C0C0] to-[#A0A0A0]">
        2
      </div>
    );
  }
  if (rank === 3) {
    return (
      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-[#0B0E14] bg-gradient-to-br from-[#CD7F32] to-[#B87333]">
        3
      </div>
    );
  }
  return (
    <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium text-[#64748B] bg-[#1A2332]">
      {rank}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  KPI Card                                                          */
/* ------------------------------------------------------------------ */
function KpiCard({
  icon: Icon,
  label,
  value,
  color,
  index,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: number;
  color: string;
  index: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.4,
        delay: index * 0.08,
        ease: [0.25, 0.46, 0.45, 0.9] as [number, number, number, number],
      }}
      className="flex items-center gap-3 bg-[#111827] border border-[#1E293B] rounded-[14px] px-4 py-3 shadow-card"
    >
      <div className={`p-2 rounded-lg ${color}`}>
        <Icon size={16} />
      </div>
      <div>
        <div className="text-xl md:text-2xl font-semibold text-[#F1F5F9] tracking-tight leading-none">
          <AnimatedCounter value={value} />
        </div>
        <div className="text-xs text-[#64748B] mt-0.5">{label}</div>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  StatusBar — KPI row + date picker + mode switcher                 */
/* ------------------------------------------------------------------ */
function StatusBar({ snapshot }: { snapshot: Snapshot }) {
  const currentDate = useStore((s) => s.currentDate);
  const availableDates = useStore((s) => s.availableDates);
  const replayMode = useStore((s) => s.replayMode);
  const switchMode = useStore((s) => s.switchMode);
  const setCurrentDate = useStore((s) => s.setCurrentDate);
  const loadDate = useStore((s) => s.loadDate);
  const [showDatePicker, setShowDatePicker] = useState(false);

  return (
    <div className="space-y-4">
      {/* Top row: date picker + mode switch */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Date picker */}
          <div className="relative">
            <button
              onClick={() => setShowDatePicker(!showDatePicker)}
              className="flex items-center gap-2 bg-[#1A2332] hover:bg-[#1E293B] text-[#F1F5F9] text-sm px-3 py-1.5 rounded-[10px] border border-[#334155] transition-colors"
            >
              <span className="font-mono text-xs">{currentDate}</span>
              <ChevronDown size={14} className="text-[#64748B]" />
            </button>
            <AnimatePresence>
              {showDatePicker && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowDatePicker(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: -5, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -5, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute top-full left-0 mt-1 z-50 bg-[#1A2332] border border-[#334155] rounded-[10px] py-1 min-w-[160px] shadow-elevated"
                  >
                    {availableDates.map((d) => (
                      <button
                        key={d.date}
                        onClick={() => {
                          setCurrentDate(d.date);
                          loadDate(d.date);
                          setShowDatePicker(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                          d.date === currentDate
                            ? 'bg-[#1E293B] text-[#3B82F6]'
                            : 'text-[#94A3B8] hover:bg-[#1E293B] hover:text-[#F1F5F9]'
                        }`}
                      >
                        <span className="font-mono">{d.date}</span>
                        <span className="text-[#475569] ml-2 text-xs">({(d.size_kb / 1024).toFixed(1)} MB)</span>
                      </button>
                    ))}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          {/* Refresh button */}
          <button
            onClick={() => loadDate(currentDate)}
            className="p-1.5 rounded-lg text-[#64748B] hover:text-[#94A3B8] hover:bg-[#1A2332] transition-colors"
          >
            <RefreshCw size={16} />
          </button>
        </div>

        {/* Mode switcher */}
        <div className="flex items-center bg-[#1A2332] rounded-[10px] p-0.5 border border-[#1E293B]">
          <button
            onClick={() => switchMode('live')}
            className={`relative px-3 py-1.5 rounded-[8px] text-xs font-medium transition-colors ${
              replayMode === 'live' ? 'text-[#F1F5F9]' : 'text-[#64748B] hover:text-[#94A3B8]'
            }`}
          >
            {replayMode === 'live' && (
              <motion.div
                layoutId="mode-indicator"
                className="absolute inset-0 bg-[#1E293B] rounded-[8px]"
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#FF4560]" />
              实时
            </span>
          </button>
          <button
            onClick={() => switchMode('replay')}
            className={`relative px-3 py-1.5 rounded-[8px] text-xs font-medium transition-colors ${
              replayMode === 'replay' ? 'text-[#F1F5F9]' : 'text-[#64748B] hover:text-[#94A3B8]'
            }`}
          >
            {replayMode === 'replay' && (
              <motion.div
                layoutId="mode-indicator"
                className="absolute inset-0 bg-[#1E293B] rounded-[8px]"
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-1.5">
              <Flame size={12} />
              回放
            </span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={MessageCircle} label="总消息" value={snapshot.msg} color="text-[#3B82F6] bg-[#3B82F6]/10" index={0} />
        <KpiCard icon={Users} label="活跃群" value={snapshot.grp} color="text-[#8B5CF6] bg-[#8B5CF6]/10" index={1} />
        <KpiCard icon={BarChart3} label="热点股票" value={snapshot.stk.length} color="text-[#00E396] bg-[#00E396]/10" index={2} />
        <KpiCard icon={Grid3x3} label="热点板块" value={snapshot.sec.length} color="text-[#F59E0B] bg-[#F59E0B]/10" index={3} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab Navigation                                                    */
/* ------------------------------------------------------------------ */
const tabs = [
  { key: 'stocks', label: '股票热点', icon: TrendingUp },
  { key: 'sectors', label: '板块热度', icon: Layers },
  { key: 'sentiment', label: '市场情绪', icon: Activity },
  { key: 'actions', label: '操作信号', icon: Zap },
];

function TabNav({ activeTab, onTabChange }: { activeTab: string; onTabChange: (t: string) => void }) {
  return (
    <div className="flex items-center justify-center gap-1 bg-[#111827] rounded-[10px] p-1 border border-[#1E293B]">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key;
        const Icon = tab.icon;
        return (
          <button
            key={tab.key}
            onClick={() => onTabChange(tab.key)}
            className={`relative flex items-center gap-2 px-4 py-2 rounded-[8px] text-sm font-medium transition-colors duration-150 ${
              isActive ? 'text-[#F1F5F9]' : 'text-[#64748B] hover:text-[#94A3B8]'
            }`}
          >
            {isActive && (
              <motion.div
                layoutId="tab-indicator"
                className="absolute inset-0 bg-[#1A2332] rounded-[8px] border-b-2 border-[#3B82F6]"
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-2">
              <Icon size={16} />
              <span className="hidden sm:inline">{tab.label}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  StockCard                                                         */
/* ------------------------------------------------------------------ */
function StockCard({
  stock,
  rank,
  featured = false,
}: {
  stock: StockItem;
  rank: number;
  featured?: boolean;
}) {
  const navigate = useNavigate();
  if (featured) {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.5, delay: rank * 0.06 }}
        whileHover={{ y: -3, borderColor: '#475569', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}
        whileTap={{ scale: 0.98 }}
        onClick={() => navigate(`/stock/${stock.c}`)}
        className="col-span-1 xl:col-span-2 bg-gradient-to-b from-[rgba(30,41,59,0.8)] to-[rgba(15,23,42,0.95)] border border-[#1E293B] rounded-[14px] p-5 cursor-pointer transition-colors duration-200 shadow-card"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <RankBadge rank={rank} />
            <div className="flex items-center gap-1.5">
              <Flame size={14} className="text-[#EF4444]" />
              <span className="text-sm text-[#94A3B8]">热度</span>
              <span
                className={`text-lg font-semibold ${
                  stock.sc >= 80 ? 'text-[#EF4444]' : stock.sc >= 60 ? 'text-[#F59E0B]' : 'text-[#10B981]'
                }`}
              >
                {stock.sc}
              </span>
            </div>
          </div>
        </div>

        {/* Stock name */}
        <h3 className="text-xl font-semibold text-[#F1F5F9] mb-1">{stock.n}</h3>
        <p className="text-sm font-mono text-[#64748B] mb-4">({stock.c})</p>

        {/* Heat bar */}
        <HeatBar score={stock.sc} height={8} />

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 mt-4">
          <div className="flex items-center gap-2 text-sm">
            <TrendingUp size={14} className="text-[#00E396]" />
            <span className="text-[#00E396] font-medium">看多 {stock.bu}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <TrendingUp size={14} className="text-[#FF4560] rotate-180" />
            <span className="text-[#FF4560] font-medium">看空 {stock.be}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-[#94A3B8]">
            <MessageCircle size={14} />
            <span>提及{stock.mc}次</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-[#94A3B8]">
            <Users size={14} />
            <span>{stock.gc}个群</span>
          </div>
        </div>

        {/* Sector tags */}
        <div className="flex flex-wrap gap-1.5 mt-4">
          {stock.sec.map((s) => (
            <span
              key={s}
              className="px-2 py-0.5 text-xs font-medium text-[#3B82F6] bg-[#3B82F6]/10 rounded-[6px]"
            >
              {s}
            </span>
          ))}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.5, delay: rank * 0.06 }}
      whileHover={{ y: -3, borderColor: '#475569', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}
      whileTap={{ scale: 0.98 }}
      onClick={() => navigate(`/stock/${stock.c}`)}
      className="bg-gradient-to-b from-[rgba(30,41,59,0.8)] to-[rgba(15,23,42,0.95)] border border-[#1E293B] rounded-[14px] p-4 cursor-pointer transition-colors duration-200 shadow-card"
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <RankBadge rank={rank} />
        <span
          className={`text-base font-semibold ${
            stock.sc >= 80 ? 'text-[#EF4444]' : stock.sc >= 60 ? 'text-[#F59E0B]' : 'text-[#10B981]'
          }`}
        >
          {stock.sc}
        </span>
      </div>

      {/* Stock name */}
      <h3 className="text-base font-semibold text-[#F1F5F9] truncate">{stock.n}</h3>
      <p className="text-xs font-mono text-[#64748B] mb-3">({stock.c})</p>

      {/* Heat bar */}
      <HeatBar score={stock.sc} />

      {/* Stats row */}
      <div className="flex items-center justify-between mt-3 text-xs">
        <div className="flex items-center gap-1.5">
          <TrendingUp size={12} className="text-[#00E396]" />
          <span className="text-[#00E396]">{stock.bu}</span>
          <TrendingUp size={12} className="text-[#FF4560] rotate-180" />
          <span className="text-[#FF4560]">{stock.be}</span>
        </div>
        <div className="flex items-center gap-3 text-[#64748B]">
          <span>💬 {stock.mc}</span>
          <span>👥 {stock.gc}</span>
        </div>
      </div>

      {/* Sector tags */}
      <div className="flex flex-wrap gap-1 mt-3">
        {stock.sec.slice(0, 3).map((s) => (
          <span
            key={s}
            className="px-1.5 py-0.5 text-[11px] font-medium text-[#3B82F6] bg-[#3B82F6]/10 rounded-[6px]"
          >
            {s}
          </span>
        ))}
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  StocksTab                                                         */
/* ------------------------------------------------------------------ */
function StocksTab({ stocks }: { stocks: StockItem[] }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
    >
      {stocks.map((stock, i) => (
        <StockCard
          key={stock.c}
          stock={stock}
          rank={i + 1}
          featured={i === 0}
        />
      ))}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  SectorCard                                                        */
/* ------------------------------------------------------------------ */
function SectorCard({ sector, rank }: { sector: SectorItem; rank: number }) {
  const maxScore = 200;
  const barWidth = Math.min(100, (sector.sc / maxScore) * 100);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.4, delay: rank * 0.07 }}
      whileHover={{ y: -3, borderColor: '#475569', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}
      className="bg-gradient-to-b from-[rgba(30,41,59,0.8)] to-[rgba(15,23,42,0.95)] border border-[#1E293B] rounded-[14px] p-4 cursor-pointer transition-colors duration-200 shadow-card"
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <Layers size={16} className="text-[#3B82F6]" />
        <h3 className="text-lg font-semibold text-[#F1F5F9]">{sector.n}</h3>
      </div>

      {/* Heat score */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl font-semibold text-[#3B82F6]">{sector.sc}</span>
        <span className="text-xs text-[#64748B]">热度</span>
      </div>

      {/* Heat bar - blue gradient */}
      <div className="w-full h-2 rounded-full bg-[#1E293B] overflow-hidden mb-4">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-[#3B82F6] to-[#06B6D4]"
          initial={{ width: 0 }}
          animate={{ width: `${barWidth}%` }}
          transition={{ type: 'spring', stiffness: 200, damping: 20 }}
        />
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 text-xs text-[#94A3B8] mb-3">
        <span className="flex items-center gap-1">
          <MessageCircle size={12} />
          提及 {sector.mc} 次
        </span>
        <span className="flex items-center gap-1">
          <Users size={12} />
          覆盖 {sector.gc} 个群
        </span>
      </div>

      {/* Sample text */}
      <p className="text-xs text-[#64748B] italic truncate">&ldquo;{sector.txt}&rdquo;</p>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  SectorsTab                                                        */
/* ------------------------------------------------------------------ */
function SectorsTab({ sectors }: { sectors: SectorItem[] }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
    >
      {sectors.map((sector, i) => (
        <SectorCard key={sector.n} sector={sector} rank={i} />
      ))}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  SentimentGauge — semi-circular SVG gauge                          */
/* ------------------------------------------------------------------ */
function SentimentGauge({ sd, sent }: { sd: { bu: number; be: number; ne: number }; sent: string }) {
  const total = sd.bu + sd.be + sd.ne || 1;
  const buPct = (sd.bu / total) * 100;
  const bePct = (sd.be / total) * 100;
  const nePct = (sd.ne / total) * 100;

  // Needle angle: -90 (all bear) to +90 (all bull), 180 degree span
  const needleAngle = -90 + (buPct / 100) * 180;

  const getSentimentColor = () => {
    if (sent.includes('多')) return '#00E396';
    if (sent.includes('空')) return '#FF4560';
    return '#FBBF24';
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      className="flex flex-col items-center"
    >
      <svg viewBox="0 0 240 140" className="w-full max-w-[400px]">
        {/* Background arc segments */}
        {/* Bull zone: left 60 degrees */}
        <path d="M 20 120 A 100 100 0 0 1 70 26.8" fill="none" stroke="#00E396" strokeWidth="20" opacity="0.3" />
        {/* Neutral zone: middle 60 degrees */}
        <path d="M 70 26.8 A 100 100 0 0 1 170 26.8" fill="none" stroke="#FBBF24" strokeWidth="20" opacity="0.3" />
        {/* Bear zone: right 60 degrees */}
        <path d="M 170 26.8 A 100 100 0 0 1 220 120" fill="none" stroke="#FF4560" strokeWidth="20" opacity="0.3" />

        {/* Labels */}
        <text x="45" y="115" textAnchor="middle" fill="#00E396" fontSize="11" fontWeight="500">
          看多
        </text>
        <text x="120" y="18" textAnchor="middle" fill="#FBBF24" fontSize="11" fontWeight="500">
          观望
        </text>
        <text x="195" y="115" textAnchor="middle" fill="#FF4560" fontSize="11" fontWeight="500">
          看空
        </text>

        {/* Percentage labels */}
        <text x="30" y="95" textAnchor="middle" fill="#00E396" fontSize="13" fontWeight="600">
          {Math.round(buPct)}%
        </text>
        <text x="120" y="45" textAnchor="middle" fill="#FBBF24" fontSize="13" fontWeight="600">
          {Math.round(nePct)}%
        </text>
        <text x="210" y="95" textAnchor="middle" fill="#FF4560" fontSize="13" fontWeight="600">
          {Math.round(bePct)}%
        </text>

        {/* Needle */}
        <motion.g
          initial={{ rotate: -90 }}
          animate={{ rotate: needleAngle }}
          transition={{ type: 'spring', stiffness: 100, damping: 15 }}
          style={{ originX: '120px', originY: '120px' }}
        >
          <line x1="120" y1="120" x2="120" y2="35" stroke={getSentimentColor()} strokeWidth="3" strokeLinecap="round" />
          <circle cx="120" cy="120" r="5" fill={getSentimentColor()} />
          <polygon points="120,30 116,38 124,38" fill={getSentimentColor()} />
        </motion.g>

        {/* Center text */}
        <text x="120" y="135" textAnchor="middle" fill={getSentimentColor()} fontSize="16" fontWeight="700">
          {sent}
        </text>
      </svg>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  SentimentTab                                                      */
/* ------------------------------------------------------------------ */
function SentimentTab({ snapshot }: { snapshot: Snapshot }) {
  const { sd, sent } = snapshot;
  const total = sd.bu + sd.be + sd.ne || 1;

  const cards = [
    { label: '看多', value: sd.bu, pct: Math.round((sd.bu / total) * 100), color: '#00E396', borderColor: 'border-t-[#00E396]' },
    { label: '观望', value: sd.ne, pct: Math.round((sd.ne / total) * 100), color: '#FBBF24', borderColor: 'border-t-[#FBBF24]' },
    { label: '看空', value: sd.be, pct: Math.round((sd.be / total) * 100), color: '#FF4560', borderColor: 'border-t-[#FF4560]' },
    { label: '极度亢奋', value: sd.eh, pct: null, color: '#EF4444', borderColor: 'border-t-[#EF4444]', alert: sd.eh > 5 },
    { label: '极度悲观', value: sd.el, pct: null, color: '#8B5CF6', borderColor: 'border-t-[#8B5CF6]', alert: sd.el > 5 },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* Gauge */}
      <SentimentGauge sd={{ bu: sd.bu, be: sd.be, ne: sd.ne }} sent={sent} />

      {/* Sentiment detail cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {cards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: i * 0.1 }}
            className={`bg-[#111827] border border-[#1E293B] ${card.borderColor} border-t-[3px] rounded-[14px] p-4 text-center shadow-card ${
              card.alert ? 'animate-flash-border' : ''
            }`}
          >
            <div className="text-xs text-[#64748B] mb-2">{card.label}</div>
            <div className="text-2xl font-semibold" style={{ color: card.color }}>
              <AnimatedCounter value={card.value} />
            </div>
            {card.pct !== null && (
              <div className="text-xs text-[#475569] mt-1">({card.pct}%)</div>
            )}
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  ActionCard                                                        */
/* ------------------------------------------------------------------ */
function ActionCard({
  type,
  count,
  keywords,
  index,
}: {
  type: 'buy' | 'sell' | 'hold' | 'risk';
  count: number;
  keywords: string;
  index: number;
}) {
  const config = {
    buy: {
      label: '买入信号',
      color: '#00E396',
      bgColor: 'bg-[#00E396]/10',
      borderColor: 'border-t-[#00E396]',
      icon: TrendingUp,
    },
    sell: {
      label: '卖出信号',
      color: '#FF4560',
      bgColor: 'bg-[#FF4560]/10',
      borderColor: 'border-t-[#FF4560]',
      icon: TrendingUp,
    },
    hold: {
      label: '持有建议',
      color: '#FBBF24',
      bgColor: 'bg-[#FBBF24]/10',
      borderColor: 'border-t-[#FBBF24]',
      icon: Activity,
    },
    risk: {
      label: '风险提示',
      color: '#FF4560',
      bgColor: 'bg-[#FF4560]/10',
      borderColor: 'border-t-[#FF4560]',
      icon: Zap,
    },
  };

  const c = config[type];
  const Icon = c.icon;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 200, damping: 20, delay: index * 0.1 }}
      className={`bg-[#111827] border border-[#1E293B] ${c.borderColor} border-t-[3px] rounded-[14px] p-5 text-center shadow-card`}
    >
      <div className={`inline-flex items-center justify-center w-12 h-12 rounded-full ${c.bgColor} mb-3`}>
        <Icon size={24} style={{ color: c.color }} />
      </div>
      <div className="text-xs text-[#64748B] mb-2">{c.label}</div>
      <div className="text-3xl font-bold mb-3" style={{ color: c.color }}>
        <AnimatedCounter value={count} />
      </div>
      <div className="text-xs text-[#475569] leading-relaxed">{keywords}</div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  ActionsTab                                                        */
/* ------------------------------------------------------------------ */
function ActionsTab({ act }: { act: Record<string, number> }) {
  const buyCount = act['买入信号'] ?? 0;
  const sellCount = act['卖出信号'] ?? 0;
  const holdCount = act['持有建议'] ?? 0;
  const riskCount = act['风险提示'] ?? 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-4"
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <ActionCard type="buy" count={buyCount} keywords="买入信号" index={0} />
        <ActionCard type="sell" count={sellCount} keywords="卖出信号" index={1} />
        <ActionCard type="hold" count={holdCount} keywords="持有建议" index={2} />
        <ActionCard type="risk" count={riskCount} keywords="风险提示" index={3} />
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  MobileBottomNav                                                   */
/* ------------------------------------------------------------------ */
function MobileBottomNav({ activeTab, onTabChange }: { activeTab: string; onTabChange: (t: string) => void }) {
  return (
    <div className="sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#111827]/95 backdrop-blur-xl border-t border-[#1E293B]">
      <div className="flex items-center justify-around py-2">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => onTabChange(tab.key)}
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors ${
                isActive ? 'text-[#3B82F6]' : 'text-[#64748B]'
              }`}
            >
              <Icon size={18} />
              <span className="text-[10px]">{tab.label.slice(0, 2)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Dashboard Page                                               */
/* ------------------------------------------------------------------ */
export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('stocks');
  const currentSnapshot = useStore((s) => s.currentSnapshot);
  const loading = useStore((s) => s.loading);
  const error = useStore((s) => s.error);

  if (!currentSnapshot) {
    if (loading) {
      return (
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="text-center">
            <img src="/loading-spinner.svg" alt="Loading" className="w-12 h-12 mx-auto mb-4 animate-spin" />
            <p className="text-[#64748B]">加载中...</p>
          </div>
        </div>
      );
    }
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center space-y-2">
          <p className="text-[#64748B] text-lg">暂无数据</p>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            onClick={() => useStore.getState().init()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors"
          >
            重新加载
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-16 sm:pb-0">
      {/* Status Bar */}
      <StatusBar snapshot={currentSnapshot} />

      {/* Tab Nav */}
      <div className="sticky top-14 md:top-[56px] z-30 py-2 -mx-4 px-4 md:-mx-6 md:px-6 bg-[#0B0E14]/95 backdrop-blur-sm">
        <TabNav activeTab={activeTab} onTabChange={setActiveTab} />
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        {activeTab === 'stocks' && (
          <StocksTab key="stocks" stocks={currentSnapshot.stk} />
        )}
        {activeTab === 'sectors' && (
          <SectorsTab key="sectors" sectors={currentSnapshot.sec} />
        )}
        {activeTab === 'sentiment' && (
          <SentimentTab key="sentiment" snapshot={currentSnapshot} />
        )}
        {activeTab === 'actions' && (
          <ActionsTab key="actions" act={currentSnapshot.act} />
        )}
      </AnimatePresence>

      {/* Mobile Bottom Tab Nav */}
      <MobileBottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}
