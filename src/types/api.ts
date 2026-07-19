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
  sec: string[]; // 关联板块
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

export interface StockMessage {
  t: string;
  x: string;
  g: string;
}

export interface StockMessagesResponse {
  code: string;
  name: string;
  messages: StockMessage[];
}

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
  prevVolume: number;
  changePercent: number;
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
  marketIndices: MarketIndex[];
  advanceDecline: AdvanceDecline | null;
  volumeData: VolumeData;
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
