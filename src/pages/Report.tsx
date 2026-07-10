import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useInView } from 'framer-motion';
import {
  FileText,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Minus,
  Droplets,
  Flame,
  Trophy,
  MessageSquare,
  Activity,
  Compass,
  Lightbulb,
  ArrowUp,
  ArrowDown,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Layers,
  Zap,
  Target,
  ShieldAlert,
  Eye,
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
import { fetchReport } from '@/lib/api';
import type { ReportData, HotStockDetail, NewsItem, SentimentTimelineItem } from '@/types/api';
import { useStore } from '@/store/useStore';

/* ------------------------------------------------------------------ */
/*  Animation config                                                   */
/* ------------------------------------------------------------------ */

const staggerContainer = {
  animate: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
};

const staggerChild = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

/* ------------------------------------------------------------------ */
/*  Section wrapper with scroll-triggered animation                  */
/* ------------------------------------------------------------------ */

function SectionWrapper({ children, id, className = '' }: { children: React.ReactNode; id: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-80px' });
  return (
    <motion.section
      ref={ref}
      id={id}
      initial="initial"
      animate={isInView ? 'animate' : 'initial'}
      variants={staggerContainer}
      className={className}
    >
      {children}
    </motion.section>
  );
}

function SectionTitle({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <motion.div variants={staggerChild} className="flex items-center gap-2 mb-4">
      <div className="w-1 h-5 bg-[#3B82F6] rounded-full" />
      <Icon size={18} className="text-[#3B82F6]" />
      <h2 className="text-lg sm:text-xl font-semibold text-[#F1F5F9] tracking-tight">{title}</h2>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Navigation items                                                   */
/* ------------------------------------------------------------------ */

const navItems = [
  { id: 'overview', label: '综述', icon: FileText },
  { id: 'market', label: '大盘', icon: BarChart3 },
  { id: 'statistics', label: '涨跌', icon: Activity },
  { id: 'volume', label: '量能', icon: Droplets },
  { id: 'sectors', label: '热点', icon: Flame },
  { id: 'stocks', label: '个股', icon: Trophy },
  { id: 'news', label: '消息', icon: MessageSquare },
  { id: 'sentiment', label: '情绪', icon: Activity },
  { id: 'technical', label: '技术', icon: Compass },
  { id: 'advice', label: '建议', icon: Lightbulb },
];

/* ------------------------------------------------------------------ */
/*  Local helper functions for news/impact display                     */
/* ------------------------------------------------------------------ */

function getNewsCategoryLabel(cat: NewsItem['category']): string {
  return { policy: '政策', industry: '行业', company: '公司', macro: '宏观' }[cat] || cat;
}
function getNewsCategoryColor(cat: NewsItem['category']): string {
  return { policy: '#3B82F6', industry: '#8B5CF6', company: '#00E396', macro: '#FBBF24' }[cat] || '#94A3B8';
}
function getImpactColor(impact: NewsItem['impact']): string {
  return { positive: '#00E396', negative: '#FF4560', neutral: '#FBBF24' }[impact] || '#94A3B8';
}
function getImpactLabel(impact: NewsItem['impact']): string {
  return { positive: '利好', negative: '利空', neutral: '中性' }[impact] || impact;
}

/* ================================================================== */
/*  REPORT PAGE                                                       */
/* ================================================================== */

export default function Report() {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState('overview');

  /* ---- Scroll spy ---- */
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      { rootMargin: '-100px 0px -60% 0px' }
    );
    navItems.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  const scrollTo = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const currentDate = useStore((s) => s.currentDate);
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentDate) return;
    setLoading(true);
    setError(null);
    fetchReport(currentDate)
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [currentDate]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-[#1A2332] rounded w-1/3" />
          <div className="h-32 bg-[#1A2332] rounded" />
          <div className="h-64 bg-[#1A2332] rounded" />
          <div className="h-48 bg-[#1A2332] rounded" />
        </div>
      </div>
    );
  }

  if (error || !data || !data.advanceDecline) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertTriangle size={32} className="text-[#FF4560] mx-auto mb-3" />
          <p className="text-[#94A3B8]">{error || '加载失败'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 md:space-y-8">
      {/* ============================================================ */}
      {/*  HEADER                                                      */}
      {/* ============================================================ */}
      <ReportHeader data={data} />

      {/* ============================================================ */}
      {/*  STICKY NAV                                                  */}
      {/* ============================================================ */}
      <ReportNav activeSection={activeSection} scrollTo={scrollTo} />

      {/* ============================================================ */}
      {/*  SECTION 1: Market Overview                                  */}
      {/* ============================================================ */}
      <SectionWrapper id="overview">
        <SectionTitle icon={FileText} title="市场综述" />
        <motion.div
          variants={staggerChild}
          className="bg-[#111827] border border-[#1E293B] rounded-[14px] p-5 md:p-6"
        >
          <p className="text-sm md:text-base text-[#F1F5F9] leading-relaxed md:leading-[1.8] max-w-3xl">
            {data.overviewText.split(/(\d+[\d,]*(?:\.\d+)?%?)/g).map((part, i) => {
              if (/^\d+[\d,]*(?:\.\d+)?%?$/.test(part)) {
                return (
                  <span key={i} className="font-semibold text-[#00E396]">
                    {part}
                  </span>
                );
              }
              return <span key={i}>{part}</span>;
            })}
          </p>
        </motion.div>
      </SectionWrapper>

      {/* ============================================================ */}
      {/*  SECTION 2: Market Index Analysis                            */}
      {/* ============================================================ */}
      <SectionWrapper id="market">
        <SectionTitle icon={BarChart3} title="大盘分析" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          {/* Sentiment Gauge */}
          <motion.div
            variants={staggerChild}
            className="bg-[#111827] border border-[#1E293B] rounded-[14px] p-5 md:p-6 flex flex-col items-center justify-center"
          >
            <SentimentGauge data={data.sentimentData} />
          </motion.div>

          {/* Intraday Chart */}
          <motion.div
            variants={staggerChild}
            className="lg:col-span-2 bg-[#111827] border border-[#1E293B] rounded-[14px] p-5 md:p-6"
          >
            <h3 className="text-sm font-medium text-[#94A3B8] mb-4">指数分时走势</h3>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.volumeData.hourlyData.map(h => ({ time: h.time, value: h.volume }))}>
                  <defs>
                    <linearGradient id="indexGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#3B82F6" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                  <XAxis dataKey="time" stroke="#475569" fontSize={11} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis domain={['dataMin - 10', 'dataMax + 10']} stroke="#475569" fontSize={11} tickLine={false} axisLine={false} width={50} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1A2332', border: '1px solid #334155', borderRadius: '8px', fontSize: '12px' }}
                    labelStyle={{ color: '#94A3B8' }}
                  />
                  <Area type="monotone" dataKey="value" stroke="#3B82F6" strokeWidth={2} fill="url(#indexGradient)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </motion.div>
        </div>

        {/* Sentiment Timeline */}
        <motion.div
          variants={staggerChild}
          className="mt-4 bg-[#111827] border border-[#1E293B] rounded-[14px] p-5 md:p-6"
        >
          <h3 className="text-sm font-medium text-[#94A3B8] mb-4">情绪演化摘要</h3>
          <div className="space-y-3">
            {data.sentimentTimeline.map((item) => (
              <SentimentTimelineRow key={item.time} item={item} />
            ))}
          </div>
        </motion.div>
      </SectionWrapper>

      {/* ============================================================ */}
      {/*  SECTION 3: Advance / Decline Statistics                     */}
      {/* ============================================================ */}
      <SectionWrapper id="statistics">
        <SectionTitle icon={Activity} title="涨跌统计" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <StatCard label="上涨家数" value={data.advanceDecline.rising} color="#00E396" suffix="家" />
          <StatCard label="下跌家数" value={data.advanceDecline.falling} color="#FF4560" suffix="家" />
          <StatCard label="涨停家数" value={data.advanceDecline.limitUp} color="#EF4444" suffix="家" />
          <StatCard label="跌停家数" value={data.advanceDecline.limitDown} color="#06B6D4" suffix="家" />
        </div>

        {/* Advance/Decline Bar */}
        <motion.div
          variants={staggerChild}
          className="mt-4 bg-[#111827] border border-[#1E293B] rounded-[14px] p-5"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-[#94A3B8]">涨跌分布</span>
            <span className="text-xs text-[#64748B]">{data.advanceDecline.risingPercent.toFixed(1)}% 上涨</span>
          </div>
          <div className="flex h-4 rounded-full overflow-hidden bg-[#1A2332]">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${data.advanceDecline.risingPercent}%` }}
              transition={{ duration: 1, delay: 0.3, ease: 'easeOut' }}
              className="h-full bg-[#00E396]"
            />
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${100 - data.advanceDecline.risingPercent}%` }}
              transition={{ duration: 1, delay: 0.5, ease: 'easeOut' }}
              className="h-full bg-[#FF4560]"
            />
          </div>
          <div className="flex justify-between mt-2 text-xs">
            <span className="text-[#00E396]">涨 {data.advanceDecline.rising} 家</span>
            <span className="text-[#FBBF24]">平 {data.advanceDecline.unchanged} 家</span>
            <span className="text-[#FF4560]">跌 {data.advanceDecline.falling} 家</span>
          </div>
        </motion.div>
      </SectionWrapper>

      {/* ============================================================ */}
      {/*  SECTION 4: Volume Analysis                                  */}
      {/* ============================================================ */}
      <SectionWrapper id="volume">
        <SectionTitle icon={Droplets} title="量能分析" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          <motion.div
            variants={staggerChild}
            className="bg-[#111827] border border-[#1E293B] rounded-[14px] p-5 md:p-6 flex flex-col justify-center items-center text-center"
          >
            <span className="text-xs text-[#64748B] mb-2">今日消息总量</span>
            <span className="text-3xl md:text-4xl font-bold text-[#F1F5F9] tracking-tight">
              {data.volumeData.totalVolume.toLocaleString()}
            </span>
            <div className="flex items-center gap-1 mt-2">
              {data.volumeData.changePercent > 0 ? (
                <ArrowUp size={14} className="text-[#00E396]" />
              ) : (
                <ArrowDown size={14} className="text-[#FF4560]" />
              )}
              <span className={`text-sm font-medium ${data.volumeData.changePercent > 0 ? 'text-[#00E396]' : 'text-[#FF4560]'}`}>
                {data.volumeData.changePercent > 0 ? '+' : ''}
                {data.volumeData.changePercent.toFixed(1)}%
              </span>
              <span className="text-xs text-[#64748B]">vs 昨日</span>
            </div>
            <div className="mt-4 text-xs text-[#64748B]">
              峰值时段: <span className="text-[#F1F5F9]">{data.volumeData.peakHour}</span>
            </div>
          </motion.div>

          <motion.div
            variants={staggerChild}
            className="lg:col-span-2 bg-[#111827] border border-[#1E293B] rounded-[14px] p-5 md:p-6"
          >
            <h3 className="text-sm font-medium text-[#94A3B8] mb-4">消息量分时趋势</h3>
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.volumeData.hourlyData}>
                  <defs>
                    <linearGradient id="volGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#3B82F6" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                  <XAxis dataKey="time" stroke="#475569" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#475569" fontSize={11} tickLine={false} axisLine={false} width={40} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1A2332', border: '1px solid #334155', borderRadius: '8px', fontSize: '12px' }}
                    labelStyle={{ color: '#94A3B8' }}
                  />
                  <Area type="monotone" dataKey="volume" stroke="#3B82F6" strokeWidth={2} fill="url(#volGradient)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </motion.div>
        </div>

        <motion.div variants={staggerChild} className="mt-4 bg-[#111827] border border-[#1E293B] rounded-[14px] p-5">
          <p className="text-sm text-[#F1F5F9] leading-relaxed">{data.volumeData.summary}</p>
        </motion.div>
      </SectionWrapper>

      {/* ============================================================ */}
      {/*  SECTION 5: Hot Sector Deep Dive                             */}
      {/* ============================================================ */}
      <SectionWrapper id="sectors">
        <SectionTitle icon={Flame} title="热点板块深度分析" />
        <div className="space-y-4">
          {data.hotSectors.map((sector) => (
            <motion.div
              key={sector.name}
              variants={staggerChild}
              className="bg-[#111827] border border-[#1E293B] rounded-[14px] p-5 md:p-6 hover:border-[#475569] transition-colors duration-200"
            >
              {/* Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-3">
                  <Layers size={18} className="text-[#3B82F6]" />
                  <h3 className="text-base font-semibold text-[#F1F5F9]">{sector.name}</h3>
                  <span className="text-sm font-medium text-[#3B82F6]">热度 {sector.heatScore}</span>
                  <TrendBadge trend={sector.trend} desc={sector.trendDesc} />
                </div>
                <div className="flex items-center gap-4 text-xs text-[#64748B]">
                  <span>提及 {sector.mentionCount} 次</span>
                  <span>{sector.groupCount} 个群</span>
                </div>
              </div>

              {/* Analysis */}
              <p className="text-sm text-[#F1F5F9] leading-relaxed mb-4">{sector.analysis}</p>

              {/* Top Stocks */}
              <div className="flex flex-wrap gap-2 mb-3">
                {sector.topStocks.map((stock) => (
                  <button
                    key={stock.code}
                    onClick={() => navigate(`/stock/${stock.code}`)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#1A2332] text-xs text-[#94A3B8] hover:bg-[#1E293B] hover:text-[#F1F5F9] transition-colors"
                  >
                    {stock.name}
                    <span className="text-[#3B82F6]">{stock.heat}</span>
                  </button>
                ))}
              </div>

              {/* Sparkline */}
              <div className="h-[40px] w-full max-w-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={sector.heatHistory.map((v, i) => ({ i, v }))}>
                    <defs>
                      <linearGradient id={`spark-${sector.name}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area type="monotone" dataKey="v" stroke="#3B82F6" strokeWidth={1.5} fill={`url(#spark-${sector.name})`} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </motion.div>
          ))}
        </div>
      </SectionWrapper>

      {/* ============================================================ */}
      {/*  SECTION 6: Hot Stocks Review                                */}
      {/* ============================================================ */}
      <SectionWrapper id="stocks">
        <SectionTitle icon={Trophy} title="热门个股点评" />
        <motion.div variants={staggerChild} className="bg-[#111827] border border-[#1E293B] rounded-[14px] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#1A2332] text-[#64748B] text-xs">
                  <th className="text-left px-4 py-3 font-medium">排名</th>
                  <th className="text-left px-4 py-3 font-medium">名称</th>
                  <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">代码</th>
                  <th className="text-left px-4 py-3 font-medium">热度</th>
                  <th className="text-left px-4 py-3 font-medium hidden md:table-cell">看多</th>
                  <th className="text-left px-4 py-3 font-medium hidden md:table-cell">看空</th>
                  <th className="text-left px-4 py-3 font-medium">板块</th>
                  <th className="text-left px-4 py-3 font-medium">趋势</th>
                </tr>
              </thead>
              <tbody>
                {data.hotStocks.map((stock) => (
                  <StockTableRow key={stock.code} stock={stock} />
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      </SectionWrapper>

      {/* ============================================================ */}
      {/*  SECTION 7: News Summary                                     */}
      {/* ============================================================ */}
      <SectionWrapper id="news">
        <SectionTitle icon={MessageSquare} title="消息面汇总" />
        <div className="space-y-3">
          {/* Important news first */}
          {data.newsItems
            .filter((n) => n.isImportant)
            .map((news) => (
              <NewsCard key={news.id} news={news} />
            ))}
          {/* Regular news */}
          {data.newsItems
            .filter((n) => !n.isImportant)
            .map((news) => (
              <NewsCard key={news.id} news={news} />
            ))}
        </div>
      </SectionWrapper>

      {/* ============================================================ */}
      {/*  SECTION 8: Sentiment Analysis                               */}
      {/* ============================================================ */}
      <SectionWrapper id="sentiment">
        <SectionTitle icon={Activity} title="情绪面分析" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          {/* Donut Chart */}
          <motion.div
            variants={staggerChild}
            className="bg-[#111827] border border-[#1E293B] rounded-[14px] p-5 md:p-6 flex flex-col items-center"
          >
            <h3 className="text-sm font-medium text-[#94A3B8] mb-4">情绪分布</h3>
            <div className="w-[200px] h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: '看多', value: data.sentimentData.bullPercent, color: '#00E396' },
                      { name: '看空', value: data.sentimentData.bearPercent, color: '#FF4560' },
                      { name: '观望', value: data.sentimentData.neutralPercent, color: '#FBBF24' },
                    ]}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="none"
                  >
                    <Cell fill="#00E396" />
                    <Cell fill="#FF4560" />
                    <Cell fill="#FBBF24" />
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1A2332', border: '1px solid #334155', borderRadius: '8px', fontSize: '12px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="text-center mt-2">
              <span className="text-2xl font-bold text-[#F1F5F9]">{data.sentimentData.bullPercent}%</span>
              <span className="text-sm text-[#00E396] ml-2">{data.sentimentData.overall}</span>
            </div>
          </motion.div>

          {/* Sentiment Details */}
          <motion.div
            variants={staggerChild}
            className="bg-[#111827] border border-[#1E293B] rounded-[14px] p-5 md:p-6 space-y-4"
          >
            <SentimentDetailRow label="看多" value={data.sentimentData.bullPercent} color="#00E396" />
            <SentimentDetailRow label="观望" value={data.sentimentData.neutralPercent} color="#FBBF24" />
            <SentimentDetailRow label="看空" value={data.sentimentData.bearPercent} color="#FF4560" />

            <div className="border-t border-[#1E293B] pt-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-[#64748B]">极度亢奋</span>
                <span className={`font-medium ${data.sentimentData.extremeEuphoria > 2 ? 'text-[#EF4444]' : 'text-[#F1F5F9]'}`}>
                  {data.sentimentData.extremeEuphoria} 次
                  {data.sentimentData.extremeEuphoria > 2 && <AlertTriangle size={12} className="inline ml-1" />}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-[#64748B]">极度悲观</span>
                <span className="font-medium text-[#F1F5F9]">{data.sentimentData.extremePessimism} 次</span>
              </div>
            </div>

            {data.sentimentData.alert && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-[#FBBF24]/10 border border-[#FBBF24]/20">
                <AlertTriangle size={14} className="text-[#FBBF24] mt-0.5 shrink-0" />
                <p className="text-xs text-[#FBBF24]">{data.sentimentData.alert}</p>
              </div>
            )}

            <div>
              <h4 className="text-xs font-medium text-[#64748B] mb-2">情绪驱动因素</h4>
              <ul className="space-y-1.5">
                {data.sentimentData.drivers.map((driver, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-[#94A3B8]">
                    <ChevronRight size={12} className="text-[#3B82F6] mt-0.5 shrink-0" />
                    {driver}
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        </div>
      </SectionWrapper>

      {/* ============================================================ */}
      {/*  SECTION 9: Technical Analysis                               */}
      {/* ============================================================ */}
      <SectionWrapper id="technical">
        <SectionTitle icon={Compass} title="技术面研判" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
          {/* Technical Signals */}
          <motion.div
            variants={staggerChild}
            className="bg-[#111827] border border-[#1E293B] rounded-[14px] p-5 md:p-6"
          >
            <h3 className="text-sm font-medium text-[#94A3B8] mb-4">热点技术信号</h3>
            <div className="space-y-3">
              {data.technicalData.signals.map((signal, i) => (
                <motion.div
                  key={signal.name}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1, duration: 0.3 }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-[#F1F5F9]">{signal.name}</span>
                    <span className="text-sm font-medium text-[#3B82F6]">{signal.count} 次</span>
                  </div>
                  <div className="h-2 rounded-full bg-[#1A2332] overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(signal.count / 12) * 100}%` }}
                      transition={{ duration: 0.8, delay: 0.2 + i * 0.1, ease: 'easeOut' }}
                      className="h-full bg-[#3B82F6] rounded-full"
                    />
                  </div>
                  <span className="text-[10px] text-[#64748B] mt-0.5 block">{signal.sectors.join('、')}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Technical Observations */}
          <motion.div
            variants={staggerChild}
            className="bg-[#111827] border border-[#1E293B] rounded-[14px] p-5 md:p-6 space-y-4"
          >
            <div>
              <h3 className="text-sm font-medium text-[#94A3B8] mb-3">关键技术位</h3>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <span className="text-[10px] text-[#00E396] uppercase tracking-wider">支撑位</span>
                  <div className="space-y-1.5 mt-1">
                    {data.technicalData.supportLevels.map((sl) => (
                      <div key={sl.level} className="text-xs">
                        <span className="text-[#F1F5F9] font-medium">{sl.level}</span>
                        <span className="text-[#64748B] ml-2">{sl.note}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] text-[#FF4560] uppercase tracking-wider">阻力位</span>
                  <div className="space-y-1.5 mt-1">
                    {data.technicalData.resistanceLevels.map((rl) => (
                      <div key={rl.level} className="text-xs">
                        <span className="text-[#F1F5F9] font-medium">{rl.level}</span>
                        <span className="text-[#64748B] ml-2">{rl.note}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-[#1E293B] pt-3">
              <h3 className="text-sm font-medium text-[#94A3B8] mb-2">形态识别</h3>
              <ul className="space-y-1.5">
                {data.technicalData.patterns.map((p, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-[#94A3B8]">
                    <Target size={12} className="text-[#8B5CF6] mt-0.5 shrink-0" />
                    {p}
                  </li>
                ))}
              </ul>
            </div>

            <div className="border-t border-[#1E293B] pt-3">
              <h3 className="text-sm font-medium text-[#94A3B8] mb-2">指标概览</h3>
              <div className="flex flex-wrap gap-2">
                {data.technicalData.indicatorSummaries.map((ind) => (
                  <span
                    key={ind.name}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs ${
                      ind.signal === 'bull'
                        ? 'bg-[#00E396]/10 text-[#00E396]'
                        : ind.signal === 'bear'
                        ? 'bg-[#FF4560]/10 text-[#FF4560]'
                        : 'bg-[#FBBF24]/10 text-[#FBBF24]'
                    }`}
                  >
                    {ind.name}: {ind.value}
                  </span>
                ))}
              </div>
            </div>
          </motion.div>
        </div>

        {/* Observations */}
        <motion.div
          variants={staggerChild}
          className="mt-4 bg-[#111827] border border-[#1E293B] rounded-[14px] p-5"
        >
          <h3 className="text-sm font-medium text-[#94A3B8] mb-3">技术观察</h3>
          <ul className="space-y-2">
            {data.technicalData.observations.map((obs, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-[#F1F5F9]">
                <Zap size={14} className="text-[#FBBF24] mt-0.5 shrink-0" />
                {obs}
              </li>
            ))}
          </ul>
        </motion.div>
      </SectionWrapper>

      {/* ============================================================ */}
      {/*  SECTION 10: Action Recommendations                          */}
      {/* ============================================================ */}
      <SectionWrapper id="advice">
        <SectionTitle icon={Lightbulb} title="操作建议" />

        {/* Strategy Score Card */}
        <motion.div
          variants={staggerChild}
          className="bg-[#111827] border border-[#1E293B] rounded-[14px] p-5 md:p-6"
        >
          <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-8">
            <div className="text-center md:text-left">
              <span className="text-xs text-[#64748B]">综合评分</span>
              <div className="flex items-baseline gap-1 mt-1">
                <motion.span
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5, delay: 0.2 }}
                  className={`text-4xl font-bold ${
                    data.actionRecommendations.score >= 70
                      ? 'text-[#00E396]'
                      : data.actionRecommendations.score >= 40
                      ? 'text-[#FBBF24]'
                      : 'text-[#FF4560]'
                  }`}
                >
                  {data.actionRecommendations.score}
                </motion.span>
                <span className="text-lg text-[#64748B]">/100</span>
              </div>
              <span
                className={`inline-block mt-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                  data.actionRecommendations.strategy === 'aggressive'
                    ? 'bg-[#00E396]/10 text-[#00E396]'
                    : data.actionRecommendations.strategy === 'moderate'
                    ? 'bg-[#FBBF24]/10 text-[#FBBF24]'
                    : 'bg-[#FF4560]/10 text-[#FF4560]'
                }`}
              >
                {data.actionRecommendations.strategy === 'aggressive'
                  ? '积极进攻'
                  : data.actionRecommendations.strategy === 'moderate'
                  ? '偏多谨慎'
                  : '保守防御'}
              </span>
            </div>

            {/* Three-column recommendations */}
            <div className="flex-1 grid grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-[#00E396]/5 border-t-2 border-[#00E396]">
                <div className="flex items-center gap-1 mb-2">
                  <CheckCircle2 size={12} className="text-[#00E396]" />
                  <span className="text-xs font-medium text-[#00E396]">关注</span>
                </div>
                <p className="text-xs text-[#94A3B8]">半导体、AI算力</p>
              </div>
              <div className="p-3 rounded-lg bg-[#FBBF24]/5 border-t-2 border-[#FBBF24]">
                <div className="flex items-center gap-1 mb-2">
                  <AlertTriangle size={12} className="text-[#FBBF24]" />
                  <span className="text-xs font-medium text-[#FBBF24]">谨慎</span>
                </div>
                <p className="text-xs text-[#94A3B8]">新能源、追高风险</p>
              </div>
              <div className="p-3 rounded-lg bg-[#FF4560]/5 border-t-2 border-[#FF4560]">
                <div className="flex items-center gap-1 mb-2">
                  <ShieldAlert size={12} className="text-[#FF4560]" />
                  <span className="text-xs font-medium text-[#FF4560]">回避</span>
                </div>
                <p className="text-xs text-[#94A3B8]">高标股、缩量阴跌</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Detailed Advice */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <motion.div
            variants={staggerChild}
            className="bg-[#111827] border border-[#1E293B] rounded-[14px] p-5"
          >
            <h3 className="text-sm font-medium text-[#94A3B8] mb-3 flex items-center gap-2">
              <Eye size={14} />
              明日关注要点
            </h3>
            <ul className="space-y-2">
              {data.actionRecommendations.watchPoints.map((point, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-[#94A3B8]">
                  <ChevronRight size={12} className="text-[#3B82F6] mt-0.5 shrink-0" />
                  {point}
                </li>
              ))}
            </ul>
          </motion.div>

          <motion.div
            variants={staggerChild}
            className="bg-[#111827] border border-[#1E293B] rounded-[14px] p-5"
          >
            <h3 className="text-sm font-medium text-[#94A3B8] mb-3 flex items-center gap-2">
              <AlertTriangle size={14} />
              风险提示
            </h3>
            <ul className="space-y-2">
              {data.actionRecommendations.riskWarnings.map((warn, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-[#FF4560]/80">
                  <ShieldAlert size={12} className="mt-0.5 shrink-0" />
                  {warn}
                </li>
              ))}
            </ul>
          </motion.div>
        </div>

        <motion.div variants={staggerChild} className="mt-4 bg-[#111827] border border-[#1E293B] rounded-[14px] p-5">
          <h3 className="text-sm font-medium text-[#94A3B8] mb-3">详细建议</h3>
          <ul className="space-y-2">
            {data.actionRecommendations.detailed.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-[#F1F5F9]">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[#1A2332] text-[10px] text-[#3B82F6] font-medium shrink-0 mt-0.5">
                  {i + 1}
                </span>
                {item}
              </li>
            ))}
          </ul>
        </motion.div>
      </SectionWrapper>

      {/* ============================================================ */}
      {/*  REPORT FOOTER                                               */}
      {/* ============================================================ */}
      <motion.footer
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="bg-[#111827] border border-[#1E293B] rounded-[14px] p-5 text-center space-y-2"
      >
        <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-[#64748B]">
          <span>数据来源：25个飞书投资群实时采集</span>
          <span className="hidden sm:inline">|</span>
          <span>生成时间：2026-01-15 15:05:23</span>
        </div>
        <p className="text-[11px] text-[#475569] italic">
          免责声明：本报告仅供投资研究参考，不构成投资建议。投资有风险，入市需谨慎。
        </p>
      </motion.footer>
    </div>
  );
}

/* ================================================================== */
/*  SUB-COMPONENTS                                                    */
/* ================================================================== */

/* ---- Report Header ---- */
function ReportHeader({ data }: { data: ReportData }) {
  return (
    <motion.header
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="relative rounded-[14px] overflow-hidden"
      style={{
        minHeight: '220px',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
      }}
    >
      {/* Background pattern overlay */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: `radial-gradient(circle at 20% 50%, rgba(59,130,246,0.3) 0%, transparent 50%),
                            radial-gradient(circle at 80% 50%, rgba(139,92,246,0.2) 0%, transparent 50%)`,
        }}
      />

      <div className="relative z-10 p-6 md:p-8 flex flex-col items-center text-center h-full justify-center">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.4 }}
          className="text-xs text-[#64748B] mb-2 flex items-center gap-2"
        >
          <CalendarIcon />
          {data.date}
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5, ease: [0.25, 0.46, 0.45, 0.9] as [number, number, number, number] }}
          className="text-3xl md:text-5xl font-bold text-[#F1F5F9] tracking-tight mb-2"
        >
          A股热点晨报
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="text-sm md:text-base text-[#94A3B8] mb-6"
        >
          基于25个飞书投资群多维数据分析
        </motion.p>

        {/* Key metrics */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.4 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-3 w-full max-w-2xl"
        >
          <HeaderMetric label="市场情绪" value={data.sentimentData.overall} color="#00E396" />
          <HeaderMetric label="总消息" value={data.volumeData.totalVolume.toLocaleString()} color="#3B82F6" />
          <HeaderMetric label="活跃群" value="23/25" color="#8B5CF6" />
          <HeaderMetric label="热点股/板" value={`${data.hotStocks.length}/${data.hotSectors.length}`} color="#FBBF24" />
        </motion.div>
      </div>
    </motion.header>
  );
}

function HeaderMetric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-[#111827]/60 backdrop-blur-md rounded-[10px] p-3 border border-[#1E293B]">
      <div className="text-sm md:text-lg font-semibold" style={{ color }}>
        {value}
      </div>
      <div className="text-[11px] text-[#64748B] mt-0.5">{label}</div>
    </div>
  );
}

function CalendarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

/* ---- Sticky Navigation ---- */
function ReportNav({ activeSection, scrollTo }: { activeSection: string; scrollTo: (id: string) => void }) {
  return (
    <motion.nav
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.3 }}
      className="sticky top-14 md:top-[56px] z-40 bg-[#111827]/90 backdrop-blur-xl border-y border-[#1E293B] -mx-4 md:-mx-6 px-4 md:px-6"
    >
      <div className="overflow-x-auto scrollbar-none">
        <div className="flex items-center gap-1 py-1 min-w-max">
          {navItems.map(({ id, label, icon: Icon }) => {
            const isActive = activeSection === id;
            return (
              <button
                key={id}
                onClick={() => scrollTo(id)}
                className={`relative flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-colors duration-150 whitespace-nowrap ${
                  isActive
                    ? 'text-[#F1F5F9]'
                    : 'text-[#64748B] hover:text-[#94A3B8] hover:bg-[#1A2332]'
                }`}
              >
                <Icon size={13} />
                {label}
                {isActive && (
                  <motion.div
                    layoutId="report-nav-indicator"
                    className="absolute bottom-0 left-1.5 right-1.5 h-0.5 bg-[#3B82F6] rounded-full"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </motion.nav>
  );
}

/* ---- Sentiment Gauge ---- */
function SentimentGauge({ data }: { data: ReportData['sentimentData'] }) {
  const rotation = -90 + (data.bullPercent / 100) * 180;
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-[180px] h-[100px]">
        <svg viewBox="0 0 180 100" className="w-full h-full">
          <defs>
            <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#FF4560" />
              <stop offset="50%" stopColor="#FBBF24" />
              <stop offset="100%" stopColor="#00E396" />
            </linearGradient>
          </defs>
          {/* Background arc */}
          <path d="M 20 90 A 70 70 0 0 1 160 90" fill="none" stroke="#1A2332" strokeWidth="12" strokeLinecap="round" />
          {/* Colored arc */}
          <path d="M 20 90 A 70 70 0 0 1 160 90" fill="none" stroke="url(#gaugeGradient)" strokeWidth="12" strokeLinecap="round" />
          {/* Needle */}
          <motion.line
            x1="90"
            y1="90"
            x2="90"
            y2="35"
            stroke="#F1F5F9"
            strokeWidth="2.5"
            strokeLinecap="round"
            initial={{ rotate: -90 }}
            animate={{ rotate: rotation }}
            transition={{ type: 'spring', stiffness: 100, damping: 15, delay: 0.3 }}
            style={{ transformOrigin: '90px 90px' }}
          />
          {/* Center dot */}
          <circle cx="90" cy="90" r="5" fill="#F1F5F9" />
        </svg>
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-center">
          <span className="text-lg font-bold text-[#F1F5F9]">{data.overall}</span>
        </div>
      </div>
      <span className="text-xs text-[#64748B] mt-3">市场情绪</span>
    </div>
  );
}

/* ---- Sentiment Timeline Row ---- */
function SentimentTimelineRow({ item }: { item: SentimentTimelineItem }) {
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="w-12 text-[#64748B] shrink-0">{item.time}</span>
      <span className="w-20 text-[#94A3B8] shrink-0">{item.label}</span>
      <div className="flex-1 h-1.5 flex rounded-full overflow-hidden bg-[#1A2332] max-w-[160px]">
        <div className="h-full bg-[#00E396]" style={{ width: `${item.bullBar}%` }} />
        <div className="h-full bg-[#FBBF24]" style={{ width: `${item.neutralBar}%` }} />
        <div className="h-full bg-[#FF4560]" style={{ width: `${item.bearBar}%` }} />
      </div>
      <span className={`w-10 shrink-0 font-medium ${item.overall === '偏多' ? 'text-[#00E396]' : item.overall === '分歧' ? 'text-[#FBBF24]' : 'text-[#94A3B8]'}`}>
        {item.overall}
      </span>
    </div>
  );
}

/* ---- Stat Card ---- */
function StatCard({ label, value, color, suffix }: { label: string; value: number; color: string; suffix: string }) {
  return (
    <motion.div
      variants={staggerChild}
      className="bg-[#111827] border border-[#1E293B] rounded-[14px] p-4 text-center"
    >
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="text-2xl md:text-3xl font-bold"
        style={{ color }}
      >
        {value.toLocaleString()}
      </motion.div>
      <div className="text-[11px] text-[#64748B] mt-1">
        {label} <span className="text-[#475569]">{suffix}</span>
      </div>
    </motion.div>
  );
}

/* ---- Trend Badge ---- */
function TrendBadge({ trend, desc }: { trend: 'up' | 'down' | 'flat'; desc: string }) {
  const config = {
    up: { icon: TrendingUp, color: 'text-[#00E396] bg-[#00E396]/10' },
    down: { icon: TrendingDown, color: 'text-[#FF4560] bg-[#FF4560]/10' },
    flat: { icon: Minus, color: 'text-[#FBBF24] bg-[#FBBF24]/10' },
  };
  const { icon: Icon, color } = config[trend];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      <Icon size={12} />
      {desc}
    </span>
  );
}

/* ---- Stock Table Row ---- */
function StockTableRow({ stock }: { stock: HotStockDetail }) {
  const navigate = useNavigate();
  const heatColor = stock.heatScore >= 80 ? 'text-[#EF4444]' : stock.heatScore >= 60 ? 'text-[#F59E0B]' : 'text-[#10B981]';
  const rankStyle =
    stock.rank === 1
      ? 'bg-gradient-to-br from-[#FFD700] to-[#FFA500] text-[#0B0E14]'
      : stock.rank === 2
      ? 'bg-gradient-to-br from-[#C0C0C0] to-[#A0A0A0] text-[#0B0E14]'
      : stock.rank === 3
      ? 'bg-gradient-to-br from-[#CD7F32] to-[#B87333] text-[#0B0E14]'
      : 'bg-[#1A2332] text-[#64748B]';

  return (
    <tr
      onClick={() => navigate(`/stock/${stock.code}`)}
      className="border-t border-[#1E293B] hover:bg-[#1E293B]/50 transition-colors cursor-pointer"
    >
      <td className="px-4 py-3">
        <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold ${rankStyle}`}>
          {stock.rank}
        </span>
      </td>
      <td className="px-4 py-3 font-medium text-[#F1F5F9]">{stock.name}</td>
      <td className="px-4 py-3 text-[#64748B] hidden sm:table-cell">{stock.code}</td>
      <td className={`px-4 py-3 font-semibold ${heatColor}`}>{stock.heatScore}</td>
      <td className="px-4 py-3 text-[#00E396] hidden md:table-cell">{stock.bullCount}</td>
      <td className="px-4 py-3 text-[#FF4560] hidden md:table-cell">{stock.bearCount}</td>
      <td className="px-4 py-3">
        <span className="inline-block px-2 py-0.5 rounded-md bg-[#1A2332] text-xs text-[#94A3B8]">{stock.sector}</span>
      </td>
      <td className="px-4 py-3">
        {stock.trend === 'up' ? (
          <TrendingUp size={16} className="text-[#00E396]" />
        ) : stock.trend === 'down' ? (
          <TrendingDown size={16} className="text-[#FF4560]" />
        ) : (
          <Minus size={16} className="text-[#FBBF24]" />
        )}
      </td>
    </tr>
  );
}

/* ---- News Card ---- */
function NewsCard({ news }: { news: NewsItem }) {
  return (
    <motion.div
      variants={staggerChild}
      className={`bg-[#111827] border rounded-[14px] p-4 md:p-5 ${
        news.isImportant ? 'border-l-[3px] border-l-[#EF4444] border-y-[#1E293B] border-r-[#1E293B]' : 'border-[#1E293B]'
      }`}
    >
      <div className="flex flex-wrap items-start gap-2 mb-2">
        <span
          className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium"
          style={{ color: getNewsCategoryColor(news.category), backgroundColor: getNewsCategoryColor(news.category) + '20' }}
        >
          {getNewsCategoryLabel(news.category)}
        </span>
        {news.isImportant && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-[#EF4444]/10 text-[#EF4444]">
            重要
          </span>
        )}
        <span
          className="inline-flex items-center text-[10px] font-medium"
          style={{ color: getImpactColor(news.impact) }}
        >
          {getImpactLabel(news.impact)}
        </span>
        <span className="text-[10px] text-[#475569] ml-auto flex items-center gap-1">
          <Clock size={10} />
          {news.time}
        </span>
      </div>
      <h4 className="text-sm font-medium text-[#F1F5F9] mb-1">{news.title}</h4>
      <p className="text-xs text-[#94A3B8] leading-relaxed">{news.summary}</p>
      <p className="text-[10px] text-[#475569] mt-2">来源: {news.source}</p>
    </motion.div>
  );
}

/* ---- Sentiment Detail Row ---- */
function SentimentDetailRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm text-[#64748B]">{label}</span>
        <span className="text-sm font-semibold" style={{ color }}>
          {value}%
        </span>
      </div>
      <div className="h-2 rounded-full bg-[#1A2332] overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
        />
      </div>
    </div>
  );
}
