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
import ReadingProgress from '@/components/ReadingProgress';
import { chartTooltipStyle, chartTooltipLabelStyle } from '@/lib/chart';

const EMPTY_REPORT: ReportData = {
  date: '', marketIndices: [], advanceDecline: null,
  volumeData: { totalVolume: 0, prevVolume: 0, changePercent: 0, hourlyData: [], peakHour: '--', peakVolume: 0, summary: '' },
  hotSectors: [], hotStocks: [], newsItems: [],
  sentimentData: { overall: '--', overallLabel: 'neutral', bullPercent: 0, bearPercent: 0, neutralPercent: 0, extremeEuphoria: 0, extremePessimism: 0, drivers: [], alert: null },
  technicalData: { observations: [], supportLevels: [], resistanceLevels: [], patterns: [], indicatorSummaries: [], signals: [] },
  actionRecommendations: { strategy: 'moderate', score: 0, sectorRotations: [], riskWarnings: [], watchPoints: [], detailed: [] },
  sentimentTimeline: [], overviewText: '', dailyReport: null,
};

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

function SectionWrapper({ children, id, className = '', loading: isLoading, skeletonHeight = '120px' }: { children: React.ReactNode; id: string; className?: string; loading?: boolean; skeletonHeight?: string }) {
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
      {isLoading ? (
        <motion.div
          variants={staggerChild}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-surface-1 border border-hairline/10 rounded-[14px] p-5 md:p-6"
        >
          <div className="space-y-3">
            <div className="h-4 bg-surface-3 rounded animate-pulse" style={{ width: '90%' }} />
            <div className="h-4 bg-surface-3 rounded animate-pulse" style={{ width: '70%' }} />
            <div className="h-4 bg-surface-3 rounded animate-pulse" style={{ width: '80%', height: skeletonHeight }} />
          </div>
        </motion.div>
      ) : children}
    </motion.section>
  );
}

function SectionTitle({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <motion.div variants={staggerChild} className="flex items-center gap-2 mb-4">
      <div className="w-1 h-5 bg-brand-blue rounded-full" />
      <Icon size={18} className="text-brand-blue" />
      <h2 className="text-lg sm:text-xl font-semibold text-ink-primary tracking-tight">{title}</h2>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Navigation items                                                   */
/* ------------------------------------------------------------------ */

const navItems = [
  { id: 'review', label: '复盘', icon: Eye },
  { id: 'groups', label: '社群', icon: MessageSquare },
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
  return { policy: '#0A84FF', industry: '#BF5AF2', company: '#30D158', macro: '#FFD60A' }[cat] || '#A0A0AA';
}
function getImpactColor(impact: NewsItem['impact']): string {
  return { positive: '#30D158', negative: '#FF453A', neutral: '#FFD60A' }[impact] || '#A0A0AA';
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
  const [data, setData] = useState<ReportData>(EMPTY_REPORT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentDate) return;
    setData(EMPTY_REPORT);
    setLoading(true);
    setError(null);
    fetchReport(currentDate)
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [currentDate]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertTriangle size={32} className="text-brand-red mx-auto mb-3" />
          <p className="text-ink-secondary">{error || '加载失败'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 md:space-y-8">
      <ReadingProgress />
      {/* ============================================================ */}
      {/*  HEADER                                                      */}
      {/* ============================================================ */}
      <ReportHeader data={data} />

      {/* ============================================================ */}
      {/*  STICKY NAV                                                  */}
      {/* ============================================================ */}
      <ReportNav activeSection={activeSection} scrollTo={scrollTo} />

      {/* ============================================================ */}
      {/*  DAILY REPORT: Core Review                                    */}
      {/* ============================================================ */}
      {(loading || data.dailyReport?.coreReview) && (
        <SectionWrapper id="review" loading={loading} skeletonHeight="200px">
          <SectionTitle icon={Eye} title="核心复盘与交叉验证" />

          {/* Daily Report Title */}
          <motion.div
            variants={staggerChild}
            className="bg-gradient-to-r from-surface-1 to-surface-2 border border-hairline/10 rounded-[14px] p-5 md:p-6 mb-4"
          >
            <h3 className="text-lg font-bold text-ink-primary">{data.dailyReport?.title}</h3>
          </motion.div>

          {/* Market Consensus */}
          <motion.div
            variants={staggerChild}
            className="bg-surface-1 border border-hairline/10 rounded-[14px] p-5 md:p-6 mb-4"
          >
            <h3 className="text-sm font-semibold text-brand-blue mb-3">1. 市场核心共识</h3>
            <div className="space-y-3">
              {data.dailyReport?.coreReview?.marketConsensus?.map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="text-brand-blue font-bold text-sm mt-0.5 shrink-0">•</span>
                  <div className="flex-1">
                    <p className="text-sm text-ink-primary leading-relaxed">{item.text}</p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {item.groupIds?.map((gid) => (
                        <span key={gid} className="px-1.5 py-0.5 rounded text-[10px] bg-brand-blue/15 text-brand-blue font-medium">
                          {gid}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Divergences */}
          <motion.div
            variants={staggerChild}
            className="bg-surface-1 border border-hairline/10 rounded-[14px] p-5 md:p-6 mb-4"
          >
            <h3 className="text-sm font-semibold text-brand-yellow mb-3">2. 观点分歧与多空博弈</h3>
            <div className="space-y-3">
              {data.dailyReport?.coreReview?.divergences?.map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="text-brand-yellow font-bold text-sm mt-0.5 shrink-0">•</span>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-ink-primary mb-1">{item.topic}</p>
                    <p className="text-xs text-ink-secondary leading-relaxed">{item.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Key Sectors Table */}
          <motion.div
            variants={staggerChild}
            className="bg-surface-1 border border-hairline/10 rounded-[14px] p-5 md:p-6"
          >
            <h3 className="text-sm font-semibold text-brand-green mb-3">3. 核心关注板块与高频标的</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-ink-tertiary text-xs border-b border-hairline/10">
                    <th className="text-left py-2 pr-3 font-medium">板块</th>
                    <th className="text-center py-2 px-3 font-medium">提及群数</th>
                    <th className="text-left py-2 px-3 font-medium">核心标的</th>
                    <th className="text-left py-2 pl-3 font-medium">情绪</th>
                  </tr>
                </thead>
                <tbody>
                  {data.dailyReport?.coreReview?.keySectors?.map((s, i) => (
                    <tr key={i} className="border-b border-hairline/50 last:border-0">
                      <td className="py-2.5 pr-3 text-ink-primary font-medium text-xs">{s.sector}</td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="px-2 py-0.5 rounded-full bg-brand-blue/15 text-brand-blue text-xs font-medium">
                          {s.groupCount}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-ink-secondary text-xs">{s.stocks}</td>
                      <td className="py-2.5 pl-3">
                        <span className={`text-xs font-medium ${
                          s.sentiment.includes('强') ? 'text-brand-green' :
                          s.sentiment.includes('弱') ? 'text-brand-red' :
                          'text-brand-yellow'
                        }`}>
                          {s.sentiment}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        </SectionWrapper>
      )}

      {/* ============================================================ */}
      {/*  DAILY REPORT: Group Views                                    */}
      {/* ============================================================ */}
      {(loading || data.dailyReport?.groupViews) && (
        <SectionWrapper id="groups" loading={loading} skeletonHeight="150px">
          <SectionTitle icon={MessageSquare} title="各社群独立观点精华" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
            {data.dailyReport?.groupViews?.map((gv) => (
              <motion.div
                key={gv.groupId}
                variants={staggerChild}
                className={`bg-surface-1 border rounded-[14px] p-4 md:p-5 ${
                  gv.sentimentJudgment ? 'border-hairline/10 hover:border-hairline/30' : 'border-hairline/50 opacity-60'
                } transition-colors duration-200`}
              >
                {/* Group Header */}
                <div className="flex items-center gap-2 mb-3">
                  <span className="px-2 py-0.5 rounded text-[10px] bg-brand-purple/15 text-brand-purple font-bold">
                    {gv.groupId}
                  </span>
                  <h4 className="text-sm font-semibold text-ink-primary">{gv.groupName}</h4>
                </div>

                {/* Sentiment Judgment */}
                {gv.sentimentJudgment ? (
                  <div className="mb-3">
                    <span className="text-[10px] text-ink-tertiary uppercase tracking-wider">情绪周期判断</span>
                    <p className="text-xs text-brand-yellow leading-relaxed mt-1">{gv.sentimentJudgment}</p>
                  </div>
                ) : (
                  <div className="mb-3">
                    <p className="text-xs text-ink-tertiary italic">无显著观点</p>
                  </div>
                )}

                {/* Core View */}
                <div className="border-t border-hairline/10 pt-3">
                  <span className="text-[10px] text-ink-tertiary uppercase tracking-wider">核心操作/观点</span>
                  <p className="text-xs text-ink-secondary leading-relaxed mt-1">{gv.coreView}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </SectionWrapper>
      )}

      {/* ============================================================ */}
      {/*  SECTION 1: Market Overview                                  */}
      {/* ============================================================ */}
      <SectionWrapper id="overview" loading={loading} skeletonHeight="80px">
        <SectionTitle icon={FileText} title="市场综述" />
        <motion.div
          variants={staggerChild}
          className="bg-surface-1 border border-hairline/10 rounded-[14px] p-5 md:p-6"
        >
          <p className="text-sm md:text-base text-ink-primary leading-relaxed md:leading-[1.8] max-w-3xl">
            {data.overviewText.split(/(\d+[\d,]*(?:\.\d+)?%?)/g).map((part, i) => {
              if (/^\d+[\d,]*(?:\.\d+)?%?$/.test(part)) {
                return (
                  <span key={i} className="font-semibold text-brand-green">
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
      <SectionWrapper id="market" loading={loading} skeletonHeight="200px">
        <SectionTitle icon={BarChart3} title="大盘分析" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          {/* Sentiment Gauge */}
          <motion.div
            variants={staggerChild}
            className="bg-surface-1 border border-hairline/10 rounded-[14px] p-5 md:p-6 flex flex-col items-center justify-center"
          >
            <SentimentGauge data={data.sentimentData} />
          </motion.div>

          {/* Intraday Chart */}
          <motion.div
            variants={staggerChild}
            className="lg:col-span-2 bg-surface-1 border border-hairline/10 rounded-[14px] p-5 md:p-6"
          >
            <h3 className="text-sm font-medium text-ink-secondary mb-4">指数分时走势</h3>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.volumeData.hourlyData.map(h => ({ time: h.time, value: h.volume }))}>
                  <defs>
                    <linearGradient id="indexGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0A84FF" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#0A84FF" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#28282E" />
                  <XAxis dataKey="time" stroke="#5A5A64" fontSize={11} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis domain={['dataMin - 10', 'dataMax + 10']} stroke="#5A5A64" fontSize={11} tickLine={false} axisLine={false} width={50} />
                  <Tooltip
                    contentStyle={chartTooltipStyle}
                    labelStyle={chartTooltipLabelStyle}
                  />
                  <Area type="monotone" dataKey="value" stroke="#0A84FF" strokeWidth={2} fill="url(#indexGradient)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </motion.div>
        </div>

        {/* Sentiment Timeline */}
        <motion.div
          variants={staggerChild}
          className="mt-4 bg-surface-1 border border-hairline/10 rounded-[14px] p-5 md:p-6"
        >
          <h3 className="text-sm font-medium text-ink-secondary mb-4">情绪演化摘要</h3>
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
      <SectionWrapper id="statistics" loading={loading} skeletonHeight="60px">
        {data.advanceDecline && <>
        <SectionTitle icon={Activity} title="涨跌统计" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <StatCard label="上涨家数" value={data.advanceDecline.rising} color="#30D158" suffix="家" />
          <StatCard label="下跌家数" value={data.advanceDecline.falling} color="#FF453A" suffix="家" />
          <StatCard label="涨停家数" value={data.advanceDecline.limitUp} color="#FF6961" suffix="家" />
          <StatCard label="跌停家数" value={data.advanceDecline.limitDown} color="#64D2FF" suffix="家" />
        </div>

        {/* Advance/Decline Bar */}
        <motion.div
          variants={staggerChild}
          className="mt-4 bg-surface-1 border border-hairline/10 rounded-[14px] p-5"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-ink-secondary">涨跌分布</span>
            <span className="text-xs text-ink-tertiary">{data.advanceDecline.risingPercent.toFixed(1)}% 上涨</span>
          </div>
          <div className="flex h-4 rounded-full overflow-hidden bg-surface-2">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${data.advanceDecline.risingPercent}%` }}
              transition={{ duration: 1, delay: 0.3, ease: 'easeOut' }}
              className="h-full bg-brand-green"
            />
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${100 - data.advanceDecline.risingPercent}%` }}
              transition={{ duration: 1, delay: 0.5, ease: 'easeOut' }}
              className="h-full bg-brand-red"
            />
          </div>
          <div className="flex justify-between mt-2 text-xs">
            <span className="text-brand-green">涨 {data.advanceDecline.rising} 家</span>
            <span className="text-brand-yellow">平 {data.advanceDecline.unchanged} 家</span>
            <span className="text-brand-red">跌 {data.advanceDecline.falling} 家</span>
          </div>
        </motion.div>
        </>}
      </SectionWrapper>

      {/* ============================================================ */}
      {/*  SECTION 4: Volume Analysis                                  */}
      {/* ============================================================ */}
      <SectionWrapper id="volume" loading={loading} skeletonHeight="160px">
        <SectionTitle icon={Droplets} title="量能分析" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          <motion.div
            variants={staggerChild}
            className="bg-surface-1 border border-hairline/10 rounded-[14px] p-5 md:p-6 flex flex-col justify-center items-center text-center"
          >
            <span className="text-xs text-ink-tertiary mb-2">今日消息总量</span>
            <span className="text-3xl md:text-4xl font-bold text-ink-primary tracking-tight">
              {data.volumeData.totalVolume.toLocaleString()}
            </span>
            <div className="flex items-center gap-1 mt-2">
              {data.volumeData.changePercent > 0 ? (
                <ArrowUp size={14} className="text-brand-green" />
              ) : (
                <ArrowDown size={14} className="text-brand-red" />
              )}
              <span className={`text-sm font-medium ${data.volumeData.changePercent > 0 ? 'text-brand-green' : 'text-brand-red'}`}>
                {data.volumeData.changePercent > 0 ? '+' : ''}
                {data.volumeData.changePercent.toFixed(1)}%
              </span>
              <span className="text-xs text-ink-tertiary">vs 昨日</span>
            </div>
            <div className="mt-4 text-xs text-ink-tertiary">
              峰值时段: <span className="text-ink-primary">{data.volumeData.peakHour}</span>
            </div>
          </motion.div>

          <motion.div
            variants={staggerChild}
            className="lg:col-span-2 bg-surface-1 border border-hairline/10 rounded-[14px] p-5 md:p-6"
          >
            <h3 className="text-sm font-medium text-ink-secondary mb-4">消息量分时趋势</h3>
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.volumeData.hourlyData}>
                  <defs>
                    <linearGradient id="volGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0A84FF" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#0A84FF" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#28282E" />
                  <XAxis dataKey="time" stroke="#5A5A64" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#5A5A64" fontSize={11} tickLine={false} axisLine={false} width={40} />
                  <Tooltip
                    contentStyle={chartTooltipStyle}
                    labelStyle={chartTooltipLabelStyle}
                  />
                  <Area type="monotone" dataKey="volume" stroke="#0A84FF" strokeWidth={2} fill="url(#volGradient)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </motion.div>
        </div>

        <motion.div variants={staggerChild} className="mt-4 bg-surface-1 border border-hairline/10 rounded-[14px] p-5">
          <p className="text-sm text-ink-primary leading-relaxed">{data.volumeData.summary}</p>
        </motion.div>
      </SectionWrapper>

      {/* ============================================================ */}
      {/*  SECTION 5: Hot Sector Deep Dive                             */}
      {/* ============================================================ */}
      <SectionWrapper id="sectors" loading={loading} skeletonHeight="150px">
        <SectionTitle icon={Flame} title="热点板块深度分析" />
        <div className="space-y-4">
          {data.hotSectors.map((sector) => (
            <motion.div
              key={sector.name}
              variants={staggerChild}
              className="bg-surface-1 border border-hairline/10 rounded-[14px] p-5 md:p-6 hover:border-hairline/30 transition-colors duration-200"
            >
              {/* Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-3">
                  <Layers size={18} className="text-brand-blue" />
                  <h3 className="text-base font-semibold text-ink-primary">{sector.name}</h3>
                  <span className="text-sm font-medium text-brand-blue">热度 {sector.heatScore}</span>
                  <TrendBadge trend={sector.trend} desc={sector.trendDesc} />
                </div>
                <div className="flex items-center gap-4 text-xs text-ink-tertiary">
                  <span>提及 {sector.mentionCount} 次</span>
                  <span>{sector.groupCount} 个群</span>
                </div>
              </div>

              {/* Analysis */}
              <p className="text-sm text-ink-primary leading-relaxed mb-4">{sector.analysis}</p>

              {/* Top Stocks */}
              <div className="flex flex-wrap gap-2 mb-3">
                {sector.topStocks.map((stock) => (
                  <button
                    key={stock.code}
                    onClick={() => navigate(`/stock/${stock.code}`)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-surface-2 text-xs text-ink-secondary hover:bg-surface-3 hover:text-ink-primary transition-colors"
                  >
                    {stock.name}
                    <span className="text-brand-blue">{stock.heat}</span>
                  </button>
                ))}
              </div>

              {/* Sparkline */}
              <div className="h-[40px] w-full max-w-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={sector.heatHistory.map((v, i) => ({ i, v }))}>
                    <defs>
                      <linearGradient id={`spark-${sector.name}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0A84FF" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#0A84FF" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area type="monotone" dataKey="v" stroke="#0A84FF" strokeWidth={1.5} fill={`url(#spark-${sector.name})`} dot={false} />
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
      <SectionWrapper id="stocks" loading={loading} skeletonHeight="200px">
        <SectionTitle icon={Trophy} title="热门个股点评" />
        <motion.div variants={staggerChild} className="bg-surface-1 border border-hairline/10 rounded-[14px] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-2 text-ink-tertiary text-xs">
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
      <SectionWrapper id="news" loading={loading} skeletonHeight="100px">
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
      <SectionWrapper id="sentiment" loading={loading} skeletonHeight="180px">
        <SectionTitle icon={Activity} title="情绪面分析" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          {/* Donut Chart */}
          <motion.div
            variants={staggerChild}
            className="bg-surface-1 border border-hairline/10 rounded-[14px] p-5 md:p-6 flex flex-col items-center"
          >
            <h3 className="text-sm font-medium text-ink-secondary mb-4">情绪分布</h3>
            <div className="w-[200px] h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: '看多', value: data.sentimentData.bullPercent, color: '#30D158' },
                      { name: '看空', value: data.sentimentData.bearPercent, color: '#FF453A' },
                      { name: '观望', value: data.sentimentData.neutralPercent, color: '#FFD60A' },
                    ]}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="none"
                  >
                    <Cell fill="#30D158" />
                    <Cell fill="#FF453A" />
                    <Cell fill="#FFD60A" />
                  </Pie>
                  <Tooltip
                    contentStyle={chartTooltipStyle}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="text-center mt-2">
              <span className="text-2xl font-bold text-ink-primary">{data.sentimentData.bullPercent}%</span>
              <span className="text-sm text-brand-green ml-2">{data.sentimentData.overall}</span>
            </div>
          </motion.div>

          {/* Sentiment Details */}
          <motion.div
            variants={staggerChild}
            className="bg-surface-1 border border-hairline/10 rounded-[14px] p-5 md:p-6 space-y-4"
          >
            <SentimentDetailRow label="看多" value={data.sentimentData.bullPercent} color="#30D158" />
            <SentimentDetailRow label="观望" value={data.sentimentData.neutralPercent} color="#FFD60A" />
            <SentimentDetailRow label="看空" value={data.sentimentData.bearPercent} color="#FF453A" />

            <div className="border-t border-hairline/10 pt-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-ink-tertiary">极度亢奋</span>
                <span className={`font-medium ${data.sentimentData.extremeEuphoria > 2 ? 'text-brand-heat' : 'text-ink-primary'}`}>
                  {data.sentimentData.extremeEuphoria} 次
                  {data.sentimentData.extremeEuphoria > 2 && <AlertTriangle size={12} className="inline ml-1" />}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-ink-tertiary">极度悲观</span>
                <span className="font-medium text-ink-primary">{data.sentimentData.extremePessimism} 次</span>
              </div>
            </div>

            {data.sentimentData.alert && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-brand-yellow/10 border border-brand-yellow/20">
                <AlertTriangle size={14} className="text-brand-yellow mt-0.5 shrink-0" />
                <p className="text-xs text-brand-yellow">{data.sentimentData.alert}</p>
              </div>
            )}

            <div>
              <h4 className="text-xs font-medium text-ink-tertiary mb-2">情绪驱动因素</h4>
              <ul className="space-y-1.5">
                {data.sentimentData.drivers.map((driver, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-ink-secondary">
                    <ChevronRight size={12} className="text-brand-blue mt-0.5 shrink-0" />
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
      <SectionWrapper id="technical" loading={loading} skeletonHeight="150px">
        <SectionTitle icon={Compass} title="技术面研判" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
          {/* Technical Signals */}
          <motion.div
            variants={staggerChild}
            className="bg-surface-1 border border-hairline/10 rounded-[14px] p-5 md:p-6"
          >
            <h3 className="text-sm font-medium text-ink-secondary mb-4">热点技术信号</h3>
            <div className="space-y-3">
              {data.technicalData.signals.map((signal, i) => (
                <motion.div
                  key={signal.name}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1, duration: 0.3 }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-ink-primary">{signal.name}</span>
                    <span className="text-sm font-medium text-brand-blue">{signal.count} 次</span>
                  </div>
                  <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(signal.count / 12) * 100}%` }}
                      transition={{ duration: 0.8, delay: 0.2 + i * 0.1, ease: 'easeOut' }}
                      className="h-full bg-brand-blue rounded-full"
                    />
                  </div>
                  <span className="text-[10px] text-ink-tertiary mt-0.5 block">{signal.sectors.join('、')}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Technical Observations */}
          <motion.div
            variants={staggerChild}
            className="bg-surface-1 border border-hairline/10 rounded-[14px] p-5 md:p-6 space-y-4"
          >
            <div>
              <h3 className="text-sm font-medium text-ink-secondary mb-3">关键技术位</h3>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <span className="text-[10px] text-brand-green uppercase tracking-wider">支撑位</span>
                  <div className="space-y-1.5 mt-1">
                    {data.technicalData.supportLevels.map((sl) => (
                      <div key={sl.level} className="text-xs">
                        <span className="text-ink-primary font-medium">{sl.level}</span>
                        <span className="text-ink-tertiary ml-2">{sl.note}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] text-brand-red uppercase tracking-wider">阻力位</span>
                  <div className="space-y-1.5 mt-1">
                    {data.technicalData.resistanceLevels.map((rl) => (
                      <div key={rl.level} className="text-xs">
                        <span className="text-ink-primary font-medium">{rl.level}</span>
                        <span className="text-ink-tertiary ml-2">{rl.note}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-hairline/10 pt-3">
              <h3 className="text-sm font-medium text-ink-secondary mb-2">形态识别</h3>
              <ul className="space-y-1.5">
                {data.technicalData.patterns.map((p, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-ink-secondary">
                    <Target size={12} className="text-brand-purple mt-0.5 shrink-0" />
                    {p}
                  </li>
                ))}
              </ul>
            </div>

            <div className="border-t border-hairline/10 pt-3">
              <h3 className="text-sm font-medium text-ink-secondary mb-2">指标概览</h3>
              <div className="flex flex-wrap gap-2">
                {data.technicalData.indicatorSummaries.map((ind) => (
                  <span
                    key={ind.name}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs ${
                      ind.signal === 'bull'
                        ? 'bg-brand-green/10 text-brand-green'
                        : ind.signal === 'bear'
                        ? 'bg-brand-red/10 text-brand-red'
                        : 'bg-brand-yellow/10 text-brand-yellow'
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
          className="mt-4 bg-surface-1 border border-hairline/10 rounded-[14px] p-5"
        >
          <h3 className="text-sm font-medium text-ink-secondary mb-3">技术观察</h3>
          <ul className="space-y-2">
            {data.technicalData.observations.map((obs, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-ink-primary">
                <Zap size={14} className="text-brand-yellow mt-0.5 shrink-0" />
                {obs}
              </li>
            ))}
          </ul>
        </motion.div>
      </SectionWrapper>

      {/* ============================================================ */}
      {/*  SECTION 10: Action Recommendations                          */}
      {/* ============================================================ */}
      <SectionWrapper id="advice" loading={loading} skeletonHeight="100px">
        <SectionTitle icon={Lightbulb} title="操作建议" />

        {/* Strategy Score Card */}
        <motion.div
          variants={staggerChild}
          className="bg-surface-1 border border-hairline/10 rounded-[14px] p-5 md:p-6"
        >
          <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-8">
            <div className="text-center md:text-left">
              <span className="text-xs text-ink-tertiary">综合评分</span>
              <div className="flex items-baseline gap-1 mt-1">
                <motion.span
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5, delay: 0.2 }}
                  className={`text-4xl font-bold ${
                    data.actionRecommendations.score >= 70
                      ? 'text-brand-green'
                      : data.actionRecommendations.score >= 40
                      ? 'text-brand-yellow'
                      : 'text-brand-red'
                  }`}
                >
                  {data.actionRecommendations.score}
                </motion.span>
                <span className="text-lg text-ink-tertiary">/100</span>
              </div>
              <span
                className={`inline-block mt-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                  data.actionRecommendations.strategy === 'aggressive'
                    ? 'bg-brand-green/10 text-brand-green'
                    : data.actionRecommendations.strategy === 'moderate'
                    ? 'bg-brand-yellow/10 text-brand-yellow'
                    : 'bg-brand-red/10 text-brand-red'
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
              <div className="p-3 rounded-lg bg-brand-green/5 border-t-2 border-brand-green">
                <div className="flex items-center gap-1 mb-2">
                  <CheckCircle2 size={12} className="text-brand-green" />
                  <span className="text-xs font-medium text-brand-green">关注</span>
                </div>
                <p className="text-xs text-ink-secondary">半导体、AI算力</p>
              </div>
              <div className="p-3 rounded-lg bg-brand-yellow/5 border-t-2 border-brand-yellow">
                <div className="flex items-center gap-1 mb-2">
                  <AlertTriangle size={12} className="text-brand-yellow" />
                  <span className="text-xs font-medium text-brand-yellow">谨慎</span>
                </div>
                <p className="text-xs text-ink-secondary">新能源、追高风险</p>
              </div>
              <div className="p-3 rounded-lg bg-brand-red/5 border-t-2 border-brand-red">
                <div className="flex items-center gap-1 mb-2">
                  <ShieldAlert size={12} className="text-brand-red" />
                  <span className="text-xs font-medium text-brand-red">回避</span>
                </div>
                <p className="text-xs text-ink-secondary">高标股、缩量阴跌</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Detailed Advice */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <motion.div
            variants={staggerChild}
            className="bg-surface-1 border border-hairline/10 rounded-[14px] p-5"
          >
            <h3 className="text-sm font-medium text-ink-secondary mb-3 flex items-center gap-2">
              <Eye size={14} />
              明日关注要点
            </h3>
            <ul className="space-y-2">
              {data.actionRecommendations.watchPoints.map((point, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-ink-secondary">
                  <ChevronRight size={12} className="text-brand-blue mt-0.5 shrink-0" />
                  {point}
                </li>
              ))}
            </ul>
          </motion.div>

          <motion.div
            variants={staggerChild}
            className="bg-surface-1 border border-hairline/10 rounded-[14px] p-5"
          >
            <h3 className="text-sm font-medium text-ink-secondary mb-3 flex items-center gap-2">
              <AlertTriangle size={14} />
              风险提示
            </h3>
            <ul className="space-y-2">
              {data.actionRecommendations.riskWarnings.map((warn, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-brand-red/80">
                  <ShieldAlert size={12} className="mt-0.5 shrink-0" />
                  {warn}
                </li>
              ))}
            </ul>
          </motion.div>
        </div>

        <motion.div variants={staggerChild} className="mt-4 bg-surface-1 border border-hairline/10 rounded-[14px] p-5">
          <h3 className="text-sm font-medium text-ink-secondary mb-3">详细建议</h3>
          <ul className="space-y-2">
            {data.actionRecommendations.detailed.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-ink-primary">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-surface-2 text-[10px] text-brand-blue font-medium shrink-0 mt-0.5">
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
        className="bg-surface-1 border border-hairline/10 rounded-[14px] p-5 text-center space-y-2"
      >
        <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-ink-tertiary">
          <span>数据来源：25个飞书投资群实时采集</span>
          <span className="hidden sm:inline">|</span>
          <span>生成时间：2026-01-15 15:05:23</span>
        </div>
        <p className="text-[11px] text-ink-quaternary italic">
          免责声明：本报告仅供投资研究参考，不构成投资建议。投资有风险，入市需谨慎。
        </p>
      </motion.footer>
    </div>
  );
}

/* ================================================================== */
/*  SUB-COMPONENTS                                                    */
/* ================================================================== */

/* ---- Report Header — Apple-style: content-first, no decoration ---- */
function ReportHeader({ data }: { data: ReportData }) {
  return (
    <motion.header
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="pt-8 md:pt-12 pb-6"
    >
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05, duration: 0.35 }}
        className="text-[11px] font-medium text-ink-tertiary tracking-[0.14em] uppercase mb-3 flex items-center gap-2"
      >
        <CalendarIcon />
        <span className="font-num">{data.date}</span>
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.45, ease: [0.32, 0.72, 0, 1] as [number, number, number, number] }}
        className="text-[36px] md:text-[52px] leading-[1.05] font-semibold text-ink-primary tracking-[-0.028em] mb-3"
      >
        A股热点晨报
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.18, duration: 0.4 }}
        className="text-[15px] md:text-[17px] text-ink-secondary max-w-2xl leading-relaxed mb-8"
      >
        基于 25 个飞书投资群多维数据分析
      </motion.p>

      {/* Key metrics — clean row, no decorative frames */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.26, duration: 0.4 }}
        className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-5 pt-6 hairline-t"
      >
        <HeaderMetric label="市场情绪" value={data.sentimentData.overall} accent="#30D158" />
        <HeaderMetric label="总消息" value={data.volumeData.totalVolume.toLocaleString()} accent="#0A84FF" />
        <HeaderMetric label="活跃群" value="23/25" accent="#BF5AF2" />
        <HeaderMetric label="热点股 / 板块" value={`${data.hotStocks.length} / ${data.hotSectors.length}`} accent="#FFD60A" />
      </motion.div>
    </motion.header>
  );
}

function HeaderMetric({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-ink-tertiary tracking-tight">{label}</span>
      <div className="flex items-baseline gap-2">
        <div className="text-[22px] md:text-[26px] font-semibold text-ink-primary tracking-[-0.02em] font-num">
          {value}
        </div>
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: accent, boxShadow: `0 0 8px ${accent}80` }}
        />
      </div>
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
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2, duration: 0.3 }}
      className="sticky top-14 md:top-[56px] z-40 vibrancy hairline-b -mx-4 md:-mx-6 px-4 md:px-6"
    >
      <div className="overflow-x-auto scrollbar-none">
        <div className="flex items-center gap-0.5 py-1.5 min-w-max relative">
          {navItems.map(({ id, label, icon: Icon }) => {
            const isActive = activeSection === id;
            return (
              <button
                key={id}
                onClick={() => scrollTo(id)}
                className={`relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-[8px] text-[12.5px] font-medium transition-colors duration-150 whitespace-nowrap ${
                  isActive
                    ? 'text-ink-primary'
                    : 'text-ink-tertiary hover:text-ink-secondary'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="report-nav-indicator"
                    className="absolute inset-0 rounded-[8px] bg-hover/[0.08]"
                    transition={{ type: 'spring', stiffness: 400, damping: 34 }}
                  />
                )}
                <Icon size={13} className="relative" />
                <span className="relative">{label}</span>
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
              <stop offset="0%" stopColor="#FF453A" />
              <stop offset="50%" stopColor="#FFD60A" />
              <stop offset="100%" stopColor="#30D158" />
            </linearGradient>
          </defs>
          {/* Background arc */}
          <path d="M 20 90 A 70 70 0 0 1 160 90" fill="none" stroke="#1D1D22" strokeWidth="12" strokeLinecap="round" />
          {/* Colored arc */}
          <path d="M 20 90 A 70 70 0 0 1 160 90" fill="none" stroke="url(#gaugeGradient)" strokeWidth="12" strokeLinecap="round" />
          {/* Needle */}
          <motion.line
            x1="90"
            y1="90"
            x2="90"
            y2="35"
            stroke="#F4F4F7"
            strokeWidth="2.5"
            strokeLinecap="round"
            initial={{ rotate: -90 }}
            animate={{ rotate: rotation }}
            transition={{ type: 'spring', stiffness: 100, damping: 15, delay: 0.3 }}
            style={{ transformOrigin: '90px 90px' }}
          />
          {/* Center dot */}
          <circle cx="90" cy="90" r="5" fill="#F4F4F7" />
        </svg>
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-center">
          <span className="text-lg font-bold text-ink-primary">{data.overall}</span>
        </div>
      </div>
      <span className="text-xs text-ink-tertiary mt-3">市场情绪</span>
    </div>
  );
}

/* ---- Sentiment Timeline Row ---- */
function SentimentTimelineRow({ item }: { item: SentimentTimelineItem }) {
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="w-12 text-ink-tertiary shrink-0">{item.time}</span>
      <span className="w-20 text-ink-secondary shrink-0">{item.label}</span>
      <div className="flex-1 h-1.5 flex rounded-full overflow-hidden bg-surface-2 max-w-[160px]">
        <div className="h-full bg-brand-green" style={{ width: `${item.bullBar}%` }} />
        <div className="h-full bg-brand-yellow" style={{ width: `${item.neutralBar}%` }} />
        <div className="h-full bg-brand-red" style={{ width: `${item.bearBar}%` }} />
      </div>
      <span className={`w-10 shrink-0 font-medium ${item.overall === '偏多' ? 'text-brand-green' : item.overall === '分歧' ? 'text-brand-yellow' : 'text-ink-secondary'}`}>
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
      className="bg-surface-1 border border-hairline/10 rounded-[14px] p-4 text-center"
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
      <div className="text-[11px] text-ink-tertiary mt-1">
        {label} <span className="text-ink-quaternary">{suffix}</span>
      </div>
    </motion.div>
  );
}

/* ---- Trend Badge ---- */
function TrendBadge({ trend, desc }: { trend: 'up' | 'down' | 'flat'; desc: string }) {
  const config = {
    up: { icon: TrendingUp, color: 'text-brand-green bg-brand-green/10' },
    down: { icon: TrendingDown, color: 'text-brand-red bg-brand-red/10' },
    flat: { icon: Minus, color: 'text-brand-yellow bg-brand-yellow/10' },
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
  const heatColor = stock.heatScore >= 80 ? 'text-brand-heat' : stock.heatScore >= 60 ? 'text-brand-orange' : 'text-brand-green';
  const rankStyle =
    stock.rank === 1
      ? 'bg-gradient-to-br from-[#FFD700] to-[#FFA500] text-[#0A0A0C]'
      : stock.rank === 2
      ? 'bg-gradient-to-br from-[#C0C0C0] to-[#A0A0A0] text-[#0A0A0C]'
      : stock.rank === 3
      ? 'bg-gradient-to-br from-[#CD7F32] to-[#B87333] text-[#0A0A0C]'
      : 'bg-surface-2 text-ink-tertiary';

  return (
    <tr
      onClick={() => navigate(`/stock/${stock.code}`)}
      className="border-t border-hairline/10 hover:bg-surface-3/50 transition-colors cursor-pointer"
    >
      <td className="px-4 py-3">
        <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold ${rankStyle}`}>
          {stock.rank}
        </span>
      </td>
      <td className="px-4 py-3 font-medium text-ink-primary">{stock.name}</td>
      <td className="px-4 py-3 text-ink-tertiary hidden sm:table-cell">{stock.code}</td>
      <td className={`px-4 py-3 font-semibold ${heatColor}`}>{stock.heatScore}</td>
      <td className="px-4 py-3 text-brand-green hidden md:table-cell">{stock.bullCount}</td>
      <td className="px-4 py-3 text-brand-red hidden md:table-cell">{stock.bearCount}</td>
      <td className="px-4 py-3">
        <span className="inline-block px-2 py-0.5 rounded-md bg-surface-2 text-xs text-ink-secondary">{stock.sector}</span>
      </td>
      <td className="px-4 py-3">
        {stock.trend === 'up' ? (
          <TrendingUp size={16} className="text-brand-green" />
        ) : stock.trend === 'down' ? (
          <TrendingDown size={16} className="text-brand-red" />
        ) : (
          <Minus size={16} className="text-brand-yellow" />
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
      className={`bg-surface-1 border rounded-[14px] p-4 md:p-5 ${
        news.isImportant ? 'border-l-[3px] border-l-[#FF6961] border-y-[#28282E] border-r-[#28282E]' : 'border-hairline/10'
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
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-brand-heat/10 text-brand-heat">
            重要
          </span>
        )}
        <span
          className="inline-flex items-center text-[10px] font-medium"
          style={{ color: getImpactColor(news.impact) }}
        >
          {getImpactLabel(news.impact)}
        </span>
        <span className="text-[10px] text-ink-quaternary ml-auto flex items-center gap-1">
          <Clock size={10} />
          {news.time}
        </span>
      </div>
      <h4 className="text-sm font-medium text-ink-primary mb-1">{news.title}</h4>
      <p className="text-xs text-ink-secondary leading-relaxed">{news.summary}</p>
      <p className="text-[10px] text-ink-quaternary mt-2">来源: {news.source}</p>
    </motion.div>
  );
}

/* ---- Sentiment Detail Row ---- */
function SentimentDetailRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm text-ink-tertiary">{label}</span>
        <span className="text-sm font-semibold" style={{ color }}>
          {value}%
        </span>
      </div>
      <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
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
