// API Data Types - matching backend API contract

export interface SentimentDetail {
  bu: number; // 看多
  be: number; // 看空
  ne: number; // 观望
  eh: number; // 极度亢奋
  el: number; // 极度悲观
}

export interface StockItem {
  c: string; // 代码
  n: string; // 名称
  sc: number; // 热度分
  mc: number; // 提及次数
  gc: number; // 涉及群数
  ac: number; // 操作次数
  bu: number; // 看多计数
  be: number; // 看空计数
  ft: string; // 首次提及时间
  lt: string; // 最后提及时间
  sec: string[]; // 所属板块（按股票就近归因）
  ms?: string[]; // 消息关联板块（该消息整体涉及的题材，消息级并集）
}

export interface GroupDetail {
  g: string; // 群名
  c: number; // 消息数
  m: Array<{ t: string; x: string }>;
}

export interface SectorItem {
  n: string; // 板块名
  sc: number; // 热度分
  mc: number; // 提及次数
  gc: number; // 涉及群数
  txt: string; // 样本文本
  gd?: GroupDetail[]; // 轻量响应中会被剥离，需判空
}

export interface Snapshot {
  t: string; // 时间 "2026-01-15 09:35"
  msg: number; // 总消息数
  grp: number; // 活跃群数
  sent: string; // 整体情绪 "偏多" | "偏空" | "观望为主" | "分歧"
  sd: SentimentDetail;
  act: Record<string, number>; // 操作信号汇总
  stk: StockItem[]; // Top10 股票
  sec: SectorItem[]; // Top8 板块
}

export interface DayData {
  date: string;
  meta: {
    start: string;
    end: string;
    count: number;
    message_count: number;
  };
  snapshots: Snapshot[];
}

export interface DateInfo {
  date: string;
  size_kb: number;
  message_count: number;
}

export interface ApiStatus {
  status: string;
  current_date: string | null;
  latest_time: string | null;
  group_count: number;
  task_running: boolean;
}

export interface ApiVersion {
  version: string;
}

export interface StockMessageItem {
  time: string;
  text: string;
}

export interface StockGroupMessages {
  group: string;
  messages: StockMessageItem[];
}

// GET /api/stock-messages/{date}?code=... — backend returns a plain array.
export type StockMessagesResponse = StockGroupMessages[];

export interface SectorMessageItem {
  time: string; // "HH:MM"
  text: string;
}

export interface SectorGroupMessages {
  group: string;
  count: number; // 该群消息总数；messages 只留前几条，两者未必相等
  messages: SectorMessageItem[];
}

// GET /api/sector-messages/{date}?name=... — backend returns a plain array.
export type SectorMessagesResponse = SectorGroupMessages[];

/* ---- Report (晨报) 相关类型 ---- */

export interface MarketIndex {
  name: string;
  code: string;
  value: number;
  change: number;
  changePercent: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
}

export interface AdvanceDecline {
  rising: number;
  falling: number;
  unchanged: number;
  limitUp: number;
  limitDown: number;
  risingPercent: number;
}

export interface VolumeData {
  totalVolume: number;
  prevVolume: number | null;
  changePercent: number | null;
  hourlyData: Array<{ time: string; volume: number }>;
  peakHour: string;
  peakVolume: number;
  summary: string;
}

export interface HotSectorDetail {
  name: string;
  heatScore: number;
  mentionCount: number;
  groupCount: number;
  trend: 'up' | 'down' | 'flat';
  trendDesc: string;
  analysis: string;
  topStocks: Array<{ name: string; code: string; heat: number }>;
  heatHistory: number[];
}

export interface HotStockDetail {
  rank: number;
  name: string;
  code: string;
  heatScore: number;
  bullCount: number;
  bearCount: number;
  sector: string;
  trend: 'up' | 'down' | 'flat';
  comment: string;
}

export interface NewsItem {
  id: string;
  category: 'policy' | 'industry' | 'company' | 'macro';
  title: string;
  summary: string;
  impact: 'positive' | 'negative' | 'neutral';
  source: string;
  time: string;
  isImportant: boolean;
}

export interface SentimentData {
  overall: string;
  overallLabel: 'bullish' | 'bearish' | 'neutral';
  bullPercent: number;
  bearPercent: number;
  neutralPercent: number;
  extremeEuphoria: number;
  extremePessimism: number;
  drivers: string[];
  alert?: string | null;
}

export interface TechnicalSignal {
  name: string;
  count: number;
  sectors: string[];
}

export interface TechnicalData {
  observations: string[];
  supportLevels: Array<{ level: string; note: string }>;
  resistanceLevels: Array<{ level: string; note: string }>;
  patterns: string[];
  indicatorSummaries: Array<{ name: string; value: string; signal: 'bull' | 'bear' | 'neutral' }>;
  signals: TechnicalSignal[];
}

export interface ActionRecommendation {
  strategy: 'aggressive' | 'moderate' | 'conservative';
  score: number;
  sectorRotations: Array<{ fromSector: string; toSector: string; reason: string }>;
  riskWarnings: string[];
  watchPoints: string[];
  detailed: string[];
}

export interface SentimentTimelineItem {
  time: string;
  label: string;
  bullBar: number;
  bearBar: number;
  neutralBar: number;
  overall: string;
}

export interface ReportData {
  date: string;
  advanceDecline: AdvanceDecline | null;
  volumeData: VolumeData;
  activeGroups: { active: number; total: number };
  hotSectors: HotSectorDetail[];
  hotStocks: HotStockDetail[];
  newsItems: NewsItem[];
  sentimentData: SentimentData;
  technicalData: TechnicalData;
  actionRecommendations: ActionRecommendation;
  sentimentTimeline: SentimentTimelineItem[];
  overviewText: string;
  dailyReport?: DailyReport | null;
}

export interface ExtremeStats {
  month_extreme_high: number;
  month_extreme_low: number;
}

/* ---- 社群观点大日报 (Daily Report) ---- */

export interface MarketConsensus {
  text: string;
  groupIds: string[];
}

export interface Divergence {
  topic: string;
  text: string;
}

export interface KeySector {
  sector: string;
  groupCount: number;
  stocks: string;
  sentiment: string;
}

export interface CoreReview {
  marketConsensus: MarketConsensus[];
  divergences: Divergence[];
  keySectors: KeySector[];
}

export interface GroupView {
  groupId: string;
  groupName: string;
  sentimentJudgment: string | null;
  coreView: string;
}

export interface DailyReport {
  date: string;
  title: string;
  coreReview: CoreReview;
  groupViews: GroupView[];
}

/* ---- Palace (大V 观点宫殿) 相关类型 ---- */

export interface PalaceCoverage {
  from: string;
  to: string;
  groups: number;
  missing_days: string[];
}

export interface PalaceMeta {
  generated_at: string;
  coverage: PalaceCoverage;
}

export interface PalaceBias {
  bull: number;
  bear: number;
  ratio: number | null;
  label: string; // 偏多 | 偏空 | 中性 | 无信号
}

export interface PalaceBreadth {
  distinct_stocks: number;
  concentration: number;
}

export interface PalaceSession {
  intraday: number;
  after_hours: number;
}

export interface PalaceStyle {
  bias: PalaceBias;
  trading: string[];
  breadth: PalaceBreadth;
  top_sectors: Array<[string, number]>;
  session: PalaceSession;
  ai_summary: string | null; // 本期恒为 null，为空时不渲染
}

export interface PalaceKol {
  chat_id: string;
  name: string;
  msg_count: number;
  opinion_count: number;
  active_days: number;
  stock_count: number;
  first_ts: string;
  last_ts: string;
  style: PalaceStyle;
}

export interface PalaceOpinion {
  ts: string;
  id: string;
  code: string;
  name: string;
  bull: boolean;
  bear: boolean;
  actions: string[];
  sectors: string[];
  text: string;
}

export interface PalaceKolStock {
  code: string;
  name: string;
  count: number;
  bull: number;
  bear: number;
  actions: string[];
  sectors: string[];
  first_ts: string;
  last_ts: string;
}

export interface PalaceKolDetail extends PalaceKol {
  stocks: PalaceKolStock[];
}

export interface PalaceStockGroup {
  chat_id: string;
  name: string;
  count: number;
  bull: number;
  bear: number;
  actions: string[];
  last_ts: string;
}

export interface PalaceStockDetail {
  name: string;
  group_count: number;
  total_mentions: number;
  first_ts: string;
  last_ts: string;
  groups: PalaceStockGroup[];
}

export interface PalaceKolListResponse {
  generated_at: string;
  kols: PalaceKol[];
}

/** 列表页用的单票跨群汇总，比 PalaceStockDetail 少一层 groups。 */
export interface PalaceStockSummary {
  code: string;
  name: string;
  group_count: number;
  total_mentions: number;
  bull: number;
  bear: number;
  last_ts: string;
}

export interface PalaceStockListResponse {
  generated_at: string;
  stocks: PalaceStockSummary[];
}

export interface PalaceKolStockResponse {
  chat_id: string;
  code: string;
  opinions: PalaceOpinion[];
}

/** 观点 + 出处群，用于个股页的跨群合并时间线。 */
export interface PalaceStockOpinion extends PalaceOpinion {
  chat_id: string;
  group: string;
}

export interface PalaceStockOpinionsResponse {
  code: string;
  name: string;
  group_count: number;
  total_mentions: number;
  opinions: PalaceStockOpinion[];
}
