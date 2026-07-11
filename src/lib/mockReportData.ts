/**
 * Mock Report Data — comprehensive mock data for the Report (晨报) page
 * and supporting data structures for cross-day comparisons.
 */

import type { Snapshot } from '@/types/api';

/* ------------------------------------------------------------------ */
/*  Types specific to report data                                      */
/* ------------------------------------------------------------------ */

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
  alert?: string;
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
  sectorRotations: Array<{
    fromSector: string;
    toSector: string;
    reason: string;
  }>;
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
  advanceDecline: AdvanceDecline;
  volumeData: VolumeData;
  hotSectors: HotSectorDetail[];
  hotStocks: HotStockDetail[];
  newsItems: NewsItem[];
  sentimentData: SentimentData;
  technicalData: TechnicalData;
  actionRecommendations: ActionRecommendation;
  sentimentTimeline: SentimentTimelineItem[];
  overviewText: string;
}

/* ------------------------------------------------------------------ */
/*  Helper: generate intraday index data                               */
/* ------------------------------------------------------------------ */

function generateIntradayData(
  baseValue: number,
  volatility: number,
  trend: number,
): Array<{ time: string; value: number; volume: number }> {
  const times = [
    '09:30', '09:35', '09:40', '09:45', '09:50', '09:55',
    '10:00', '10:05', '10:10', '10:15', '10:20', '10:25', '10:30',
    '10:35', '10:40', '10:45', '10:50', '10:55', '11:00', '11:15',
    '11:20', '11:25', '11:30', '13:00', '13:05', '13:10', '13:15',
    '13:20', '13:25', '13:30', '13:35', '13:40', '13:45', '13:50',
    '13:55', '14:00', '14:05', '14:10', '14:15', '14:20', '14:25',
    '14:30', '14:35', '14:40', '14:45', '14:50', '14:55', '15:00',
  ];

  let value = baseValue;
  const data: Array<{ time: string; value: number; volume: number }> = [];

  times.forEach((time, i) => {
    const change = (Math.random() - 0.5) * volatility + trend;
    value += change;
    const volume = Math.floor(200 + Math.random() * 800 + Math.sin(i * 0.3) * 300);
    data.push({ time, value: Math.round(value * 100) / 100, volume: Math.max(50, volume) });
  });

  return data;
}

/* ------------------------------------------------------------------ */
/*  Helper: generate sparkline data                                    */
/* ------------------------------------------------------------------ */

function generateSparkline(base: number, points: number): number[] {
  const data: number[] = [];
  let v = base;
  for (let i = 0; i < points; i++) {
    v += (Math.random() - 0.48) * base * 0.08;
    data.push(Math.round(Math.max(10, v)));
  }
  return data;
}

/* ------------------------------------------------------------------ */
/*  Helper: generate hourly volume data                                */
/* ------------------------------------------------------------------ */

function generateHourlyVolume(): Array<{ time: string; volume: number }> {
  return [
    { time: '09:30', volume: 1240 },
    { time: '10:00', volume: 2341 },
    { time: '10:30', volume: 1987 },
    { time: '11:00', volume: 1560 },
    { time: '11:30', volume: 980 },
    { time: '13:30', volume: 1420 },
    { time: '14:00', volume: 1876 },
    { time: '14:30', volume: 1650 },
    { time: '15:00', volume: 893 },
  ];
}

/* ------------------------------------------------------------------ */
/*  Helper: generate sentiment timeline                                */
/* ------------------------------------------------------------------ */

function generateSentimentTimeline(): SentimentTimelineItem[] {
  return [
    { time: '09:30', label: '开盘', bullBar: 60, bearBar: 15, neutralBar: 25, overall: '偏多' },
    { time: '10:00', label: '早盘升温', bullBar: 70, bearBar: 12, neutralBar: 18, overall: '偏多' },
    { time: '10:30', label: '情绪高涨', bullBar: 78, bearBar: 10, neutralBar: 12, overall: '偏多' },
    { time: '11:00', label: '略有回落', bullBar: 55, bearBar: 20, neutralBar: 25, overall: '偏多' },
    { time: '11:30', label: '午间收盘', bullBar: 50, bearBar: 22, neutralBar: 28, overall: '分歧' },
    { time: '13:30', label: '午后开盘', bullBar: 52, bearBar: 25, neutralBar: 23, overall: '分歧' },
    { time: '14:00', label: '分化加剧', bullBar: 48, bearBar: 30, neutralBar: 22, overall: '分歧' },
    { time: '14:30', label: '尾盘回暖', bullBar: 62, bearBar: 18, neutralBar: 20, overall: '偏多' },
    { time: '15:00', label: '收盘', bullBar: 68, bearBar: 13, neutralBar: 19, overall: '偏多' },
  ];
}

/* ------------------------------------------------------------------ */
/*  Main report data                                                   */
/* ------------------------------------------------------------------ */

export const reportData: ReportData = {
  date: '2026-01-15',

  overviewText:
    '2026年1月15日，A股市场整体呈现偏强态势。根据对25个飞书投资群的实时监测，今日共采集12,847条消息，涉及23个活跃群。市场情绪整体偏多（看多68%），较前一交易日有所升温。热点板块集中在半导体（热度156）、AI算力（热度142）和新能源（热度138）三大方向。操作信号方面，买入信号（23次）明显多于卖出信号（8次），显示市场参与者的积极情绪。整体而言，市场赚钱效应良好，建议关注热点持续性，控制追高风险。',

  marketIndices: [
    {
      name: '上证指数',
      code: '000001',
      value: 3287.42,
      change: 28.56,
      changePercent: 0.88,
      open: 3262.18,
      high: 3295.63,
      low: 3258.90,
      prevClose: 3258.86,
    },
    {
      name: '深证成指',
      code: '399001',
      value: 10256.78,
      change: 112.34,
      changePercent: 1.11,
      open: 10152.30,
      high: 10289.45,
      low: 10148.22,
      prevClose: 10144.44,
    },
    {
      name: '创业板指',
      code: '399006',
      value: 2156.32,
      change: 32.18,
      changePercent: 1.52,
      open: 2128.50,
      high: 2162.80,
      low: 2125.30,
      prevClose: 2124.14,
    },
  ],

  advanceDecline: {
    rising: 2856,
    falling: 1892,
    unchanged: 352,
    limitUp: 62,
    limitDown: 8,
    risingPercent: 55.8,
  },

  volumeData: {
    totalVolume: 12847,
    prevVolume: 10450,
    changePercent: 22.9,
    hourlyData: generateHourlyVolume(),
    peakHour: '10:00-10:30',
    peakVolume: 2341,
    summary:
      '今日消息总量12,847条，较昨日增长22.9%。上午开盘后10:00-10:30为消息高峰期（2,341条/30分钟），对应半导体板块集体爆发时段。午后量能有所回落，但14:00后随着AI算力板块再度活跃，消息量出现第二波小高峰。',
  },

  hotSectors: [
    {
      name: '半导体',
      heatScore: 156,
      mentionCount: 47,
      groupCount: 23,
      trend: 'up',
      trendDesc: '强势上涨',
      analysis:
        '提及47次，覆盖23个群，为本日最热门板块。中芯国际量产消息刷屏，北方华创设备订单超预期，板块整体看多情绪浓厚。产业链上下游联动明显，设备、材料、设计环节均有资金关注。',
      topStocks: [
        { name: '中芯国际', code: '688981', heat: 85 },
        { name: '北方华创', code: '002371', heat: 72 },
        { name: '韦尔股份', code: '603501', heat: 61 },
        { name: '海光信息', code: '688041', heat: 54 },
        { name: '中微公司', code: '688012', heat: 48 },
      ],
      heatHistory: generateSparkline(156, 12),
    },
    {
      name: 'AI算力',
      heatScore: 142,
      mentionCount: 41,
      groupCount: 21,
      trend: 'up',
      trendDesc: '稳步上涨',
      analysis:
        '国产算力芯片受关注度高，寒武纪订单预期持续发酵。英伟达链回调后资金转向国产替代方向，算力基建加速预期支撑板块热度。服务器、光模块、液冷等细分领域均有活跃表现。',
      topStocks: [
        { name: '寒武纪', code: '688256', heat: 78 },
        { name: '中科曙光', code: '603019', heat: 65 },
        { name: '浪潮信息', code: '000977', heat: 58 },
        { name: '光迅科技', code: '002281', heat: 52 },
        { name: '润泽科技', code: '300442', heat: 45 },
      ],
      heatHistory: generateSparkline(142, 12),
    },
    {
      name: '新能源',
      heatScore: 138,
      mentionCount: 39,
      groupCount: 20,
      trend: 'up',
      trendDesc: '强势上涨',
      analysis:
        '宁德时代新技术发布催化板块热度，锂电产业链关注度上升。储能数据超预期，光伏产业链价格企稳信号增强。板块整体资金流入明显，机构调研频次增加。',
      topStocks: [
        { name: '宁德时代', code: '300750', heat: 92 },
        { name: '比亚迪', code: '002594', heat: 78 },
        { name: '隆基绿能', code: '601012', heat: 55 },
        { name: '阳光电源', code: '300274', heat: 52 },
        { name: '通威股份', code: '600438', heat: 48 },
      ],
      heatHistory: generateSparkline(138, 12),
    },
    {
      name: '白酒',
      heatScore: 118,
      mentionCount: 33,
      groupCount: 17,
      trend: 'flat',
      trendDesc: '横盘整理',
      analysis:
        '茅台批价稳定，五粮液动销好转，消费复苏预期支撑板块估值。板块整体波动较小，机构持仓稳定，防御属性凸显。关注春节备货旺季催化。',
      topStocks: [
        { name: '贵州茅台', code: '600519', heat: 72 },
        { name: '五粮液', code: '000858', heat: 65 },
        { name: '泸州老窖', code: '000568', heat: 48 },
        { name: '山西汾酒', code: '600809', heat: 42 },
      ],
      heatHistory: generateSparkline(118, 12),
    },
    {
      name: '券商',
      heatScore: 105,
      mentionCount: 29,
      groupCount: 15,
      trend: 'up',
      trendDesc: '异动拉升',
      analysis:
        '市场成交量放大，券商股午后异动明显。东方财富领涨，投行与财富管理业务复苏预期升温。关注后续市场成交额持续性。',
      topStocks: [
        { name: '东方财富', code: '300059', heat: 68 },
        { name: '中信证券', code: '600030', heat: 52 },
        { name: '华泰证券', code: '601688', heat: 42 },
        { name: '国泰君安', code: '601211', heat: 38 },
      ],
      heatHistory: generateSparkline(105, 12),
    },
  ],

  hotStocks: [
    {
      rank: 1,
      name: '宁德时代',
      code: '300750',
      heatScore: 92,
      bullCount: 12,
      bearCount: 3,
      sector: '新能源',
      trend: 'up',
      comment: '新技术发布催化，产业链热度传导，机构看好全年出货增长',
    },
    {
      rank: 2,
      name: '中芯国际',
      code: '688981',
      heatScore: 85,
      bullCount: 8,
      bearCount: 2,
      sector: '半导体',
      trend: 'up',
      comment: '量产进度超预期，设备采购加速，业绩有望兑现',
    },
    {
      rank: 3,
      name: '比亚迪',
      code: '002594',
      heatScore: 78,
      bullCount: 7,
      bearCount: 4,
      sector: '新能源',
      trend: 'up',
      comment: '销量数据超预期，高端品牌放量，智能化布局加速',
    },
    {
      rank: 4,
      name: '贵州茅台',
      code: '600519',
      heatScore: 72,
      bullCount: 5,
      bearCount: 3,
      sector: '白酒',
      trend: 'flat',
      comment: '批价稳定，消费复苏预期支撑，估值合理',
    },
    {
      rank: 5,
      name: '东方财富',
      code: '300059',
      heatScore: 68,
      bullCount: 6,
      bearCount: 2,
      sector: '券商',
      trend: 'up',
      comment: '成交量放大催化，互联网金融弹性标的',
    },
    {
      rank: 6,
      name: '五粮液',
      code: '000858',
      heatScore: 65,
      bullCount: 4,
      bearCount: 3,
      sector: '白酒',
      trend: 'flat',
      comment: '动销好转，渠道库存去化，春节备货预期',
    },
    {
      rank: 7,
      name: '寒武纪',
      code: '688256',
      heatScore: 61,
      bullCount: 6,
      bearCount: 1,
      sector: 'AI算力',
      trend: 'up',
      comment: '国产算力芯片龙头，订单预期持续发酵',
    },
    {
      rank: 8,
      name: '招商银行',
      code: '600036',
      heatScore: 58,
      bullCount: 4,
      bearCount: 2,
      sector: '银行',
      trend: 'flat',
      comment: '高股息策略受青睐，资产质量稳健',
    },
    {
      rank: 9,
      name: '昆仑万维',
      code: '300418',
      heatScore: 55,
      bullCount: 5,
      bearCount: 2,
      sector: 'AI应用',
      trend: 'up',
      comment: '大模型应用落地加速，海外业务增长强劲',
    },
    {
      rank: 10,
      name: '赛力斯',
      code: '601127',
      heatScore: 52,
      bullCount: 4,
      bearCount: 3,
      sector: '整车',
      trend: 'up',
      comment: '华为智选车销量超预期，新车型发布在即',
    },
  ],

  newsItems: [
    {
      id: '1',
      category: 'company',
      title: '中芯国际量产进度超预期',
      summary: '中芯国际新产线良率超预期，设备采购加速，Q1业绩有望兑现。产业链上下游联动明显。',
      impact: 'positive',
      source: '001_震哥仅ls、096_先知研报',
      time: '09:35',
      isImportant: true,
    },
    {
      id: '2',
      category: 'industry',
      title: '新能源政策利好持续发酵',
      summary: '储能装机数据超预期，分布式光伏政策加码，新能源产业链关注度持续升温。',
      impact: 'positive',
      source: '新能源投研群、成长股投资',
      time: '09:40',
      isImportant: false,
    },
    {
      id: '3',
      category: 'industry',
      title: 'AI算力需求旺季来临',
      summary: '国产算力芯片订单饱满，算力基建加速推进，服务器产业链景气度上行。',
      impact: 'positive',
      source: 'AI投资圈、科技股交流群',
      time: '09:45',
      isImportant: false,
    },
    {
      id: '4',
      category: 'company',
      title: '宁德时代新技术发布',
      summary: '宁德时代发布新一代电池技术，能量密度提升15%，成本下降10%，产业链热度传导。',
      impact: 'positive',
      source: '新能源投研群、汽车行业群',
      time: '09:50',
      isImportant: true,
    },
    {
      id: '5',
      category: 'policy',
      title: '资本市场改革政策出台',
      summary: '监管层发布资本市场高质量发展意见，鼓励长期资金入市，优化交易机制。',
      impact: 'positive',
      source: '金融投资群、价值投资圈',
      time: '10:00',
      isImportant: true,
    },
    {
      id: '6',
      category: 'macro',
      title: '12月经济数据出炉',
      summary: '12月PMI数据显示制造业景气度回升，消费数据好于预期，经济韧性显现。',
      impact: 'positive',
      source: '宏观经济研讨群',
      time: '10:15',
      isImportant: false,
    },
    {
      id: '7',
      category: 'industry',
      title: '消费电子复苏信号增强',
      summary: '手机出货量数据回暖，AI手机换机周期启动，消费电子产业链关注度上升。',
      impact: 'neutral',
      source: '科技股交流群',
      time: '10:20',
      isImportant: false,
    },
    {
      id: '8',
      category: 'company',
      title: '某高标股收到监管函',
      summary: '近期涨幅较大的个股收到交易所关注函，短线情绪受到一定影响。',
      impact: 'negative',
      source: '短线交易群',
      time: '10:25',
      isImportant: false,
    },
  ],

  sentimentData: {
    overall: '偏多',
    overallLabel: 'bullish',
    bullPercent: 68,
    bearPercent: 14,
    neutralPercent: 18,
    extremeEuphoria: 3,
    extremePessimism: 1,
    drivers: [
      '半导体板块爆发，带动市场做多情绪',
      '政策面利好频出，长期资金入市预期',
      '成交量放大，市场活跃度提升',
      '北向资金持续净流入，外资看好A股',
    ],
    alert: '午后出现分歧迹象，需关注看空比例是否继续上升',
  },

  technicalData: {
    observations: [
      '上证指数放量突破3260点压力位，短期趋势转多',
      '创业板指站上年线，技术形态改善',
      '半导体板块多只个股创历史新高',
      '市场成交活跃，量价配合良好',
    ],
    supportLevels: [
      { level: '3250', note: '5日均线与前期平台支撑' },
      { level: '3220', note: '20日均线强支撑' },
      { level: '3200', note: '整数关口心理支撑' },
    ],
    resistanceLevels: [
      { level: '3300', note: '前期高点阻力' },
      { level: '3320', note: '年线压力位' },
      { level: '3350', note: '密集成交区上沿' },
    ],
    patterns: [
      '上证指数：头肩底形态确认，量度升幅目标3320',
      '创业板指：突破下降趋势线，进入上升通道',
      '半导体指数：V型反转后加速上行',
    ],
    indicatorSummaries: [
      { name: 'MACD', value: '金叉向上，红柱扩大', signal: 'bull' },
      { name: 'RSI', value: '62，处于强势区域', signal: 'bull' },
      { name: 'KDJ', value: 'J值85，短期偏热', signal: 'neutral' },
      { name: '布林带', value: '股价运行在中轨上方', signal: 'bull' },
      { name: '均线系统', value: '5日>10日>20日，多头排列', signal: 'bull' },
    ],
    signals: [
      { name: '放量突破', count: 12, sectors: ['半导体', 'AI算力'] },
      { name: '涨停', count: 8, sectors: ['半导体', '新能源'] },
      { name: '回调买入', count: 6, sectors: ['白酒', '银行'] },
      { name: '支撑位', count: 5, sectors: ['券商', '整车'] },
      { name: '新高', count: 4, sectors: ['半导体', '新能源'] },
    ],
  },

  actionRecommendations: {
    strategy: 'moderate',
    score: 65,
    sectorRotations: [
      { fromSector: '高标题材', toSector: '半导体', reason: '半导体有基本面支撑，持续性更好' },
      { fromSector: '银行', toSector: 'AI算力', reason: '算力基建加速，成长弹性更大' },
    ],
    riskWarnings: [
      '午后情绪出现分歧，追高需谨慎',
      '部分高标股缩量回调，注意止损',
      '关注北向资金流向变化',
    ],
    watchPoints: [
      '半导体板块龙头持续性',
      '成交量能否维持在万亿以上',
      '晚间美股走势对明日情绪影响',
      '政策面是否有新的催化',
    ],
    detailed: [
      '半导体板块热度持续，关注中芯国际、北方华创等龙头持续性',
      'AI算力板块午后回暖，可逢低关注回调机会',
      '新能源板块横盘整理，暂不急于加仓',
      '整体情绪偏多但午后出现分歧，建议控制仓位',
      '警惕高位股缩量回调风险',
    ],
  },

  sentimentTimeline: generateSentimentTimeline(),
};

/* ------------------------------------------------------------------ */
/*  Intraday data for charts                                           */
/* ------------------------------------------------------------------ */

export const intradayData = generateIntradayData(3270, 8, 0.5);

/* ------------------------------------------------------------------ */
/*  Compare page — mock day data for multiple dates                    */
/* ------------------------------------------------------------------ */

export interface CompareDayData {
  date: string;
  snapshot: Snapshot;
  totalMessages: number;
  sentiment: string;
  topStocks: Array<{ code: string; name: string; heat: number; rank: number }>;
  topSectors: Array<{ name: string; heat: number; rank: number }>;
  actionCounts: Record<string, number>;
  sentimentTimeline: Array<{ time: string; bull: number; bear: number; neutral: number }>;
}

const dateLabels = ['2026-01-15', '2026-01-14', '2026-01-13', '2026-01-10', '2026-01-09'];

const stockNamesPool = [
  { n: '宁德时代', c: '300750' },
  { n: '中芯国际', c: '688981' },
  { n: '比亚迪', c: '002594' },
  { n: '贵州茅台', c: '600519' },
  { n: '东方财富', c: '300059' },
  { n: '五粮液', c: '000858' },
  { n: '寒武纪', c: '688256' },
  { n: '招商银行', c: '600036' },
  { n: '昆仑万维', c: '300418' },
  { n: '赛力斯', c: '601127' },
  { n: '隆基绿能', c: '601012' },
  { n: '科大讯飞', c: '002230' },
  { n: '阳光电源', c: '300274' },
  { n: '通威股份', c: '600438' },
  { n: '中信证券', c: '600030' },
];

const sectorNamesPool = [
  '半导体', 'AI算力', '新能源', '白酒', '券商', '整车', '华为链', '银行',
  '消费电子', '医药', '地产', '军工',
];

function shuffleArray<T>(arr: T[], seed: number): T[] {
  const shuffled = [...arr];
  let s = seed;
  for (let i = shuffled.length - 1; i > 0; i--) {
    s = (s * 16807) % 2147483647;
    const j = s % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function generateCompareMockData(): CompareDayData[] {
  return dateLabels.map((date, dayIndex) => {
    const shuffledStocks = shuffleArray(stockNamesPool, dayIndex + 42);
    const shuffledSectors = shuffleArray(sectorNamesPool, dayIndex + 99);

    const top10Stocks = shuffledStocks.slice(0, 10).map((s, i) => ({
      code: s.c,
      name: s.n,
      heat: Math.max(40, 95 - i * 5 - Math.floor(Math.random() * 8)),
      rank: i + 1,
    }));

    const top8Sectors = shuffledSectors.slice(0, 8).map((s, i) => ({
      name: s,
      heat: Math.max(50, 160 - i * 14 - Math.floor(Math.random() * 10)),
      rank: i + 1,
    }));

    const sentiments = ['偏多', '分歧', '观望为主', '偏多', '偏空'];
    const messagesArr = [12847, 10234, 9876, 11250, 10560];

    const timeline: Array<{ time: string; bull: number; bear: number; neutral: number }> = [];
    const times = ['09:30', '10:00', '10:30', '11:00', '11:30', '13:30', '14:00', '14:30', '15:00'];
    let bull = 55 + Math.floor(Math.random() * 15);
    let bear = 15 + Math.floor(Math.random() * 10);
    times.forEach((time) => {
      bull += Math.floor((Math.random() - 0.5) * 15);
      bear += Math.floor((Math.random() - 0.5) * 10);
      bull = Math.max(20, Math.min(80, bull));
      bear = Math.max(5, Math.min(40, bear));
      const neutral = Math.max(5, 100 - bull - bear);
      timeline.push({ time, bull, bear, neutral });
    });

    return {
      date,
      snapshot: {
        t: `${date} 10:30`,
        msg: messagesArr[dayIndex],
        grp: 21 + Math.floor(Math.random() * 4),
        sent: sentiments[dayIndex],
        sd: {
          bu: 50 + Math.floor(Math.random() * 15),
          be: 10 + Math.floor(Math.random() * 8),
          ne: 15 + Math.floor(Math.random() * 10),
          eh: Math.floor(Math.random() * 4),
          el: Math.floor(Math.random() * 3),
        },
        act: {
          买: 18 + Math.floor(Math.random() * 8),
          卖: 5 + Math.floor(Math.random() * 6),
          加仓: 5 + Math.floor(Math.random() * 6),
          减仓: 2 + Math.floor(Math.random() * 4),
          持有: 8 + Math.floor(Math.random() * 8),
          风险: 2 + Math.floor(Math.random() * 4),
          谨慎: 1 + Math.floor(Math.random() * 3),
        },
        stk: [],
        sec: [],
      },
      totalMessages: messagesArr[dayIndex],
      sentiment: sentiments[dayIndex],
      topStocks: top10Stocks,
      topSectors: top8Sectors,
      actionCounts: {
        买入: 18 + Math.floor(Math.random() * 8),
        卖出: 5 + Math.floor(Math.random() * 6),
        持有: 8 + Math.floor(Math.random() * 8),
        风险: 3 + Math.floor(Math.random() * 4),
      },
      sentimentTimeline: timeline,
    };
  });
}

export const compareMockData: CompareDayData[] = generateCompareMockData();

/* ------------------------------------------------------------------ */
/*  Helper: get a day of compare data by date                          */
/* ------------------------------------------------------------------ */

export function getCompareDay(date: string): CompareDayData | undefined {
  return compareMockData.find((d) => d.date === date);
}

/* ------------------------------------------------------------------ */
/*  Helper: generate category badge for news                           */
/* ------------------------------------------------------------------ */

export function getNewsCategoryLabel(cat: NewsItem['category']): string {
  const labels: Record<NewsItem['category'], string> = {
    policy: '政策',
    industry: '行业',
    company: '公司',
    macro: '宏观',
  };
  return labels[cat];
}

export function getNewsCategoryColor(cat: NewsItem['category']): string {
  const colors: Record<NewsItem['category'], string> = {
    policy: 'bg-[#8B5CF6]/15 text-[#8B5CF6]',
    industry: 'bg-[#3B82F6]/15 text-[#3B82F6]',
    company: 'bg-[#06B6D4]/15 text-[#06B6D4]',
    macro: 'bg-[#FBBF24]/15 text-[#FBBF24]',
  };
  return colors[cat];
}

export function getImpactColor(impact: NewsItem['impact']): string {
  const colors: Record<NewsItem['impact'], string> = {
    positive: 'text-[#00E396]',
    negative: 'text-[#FF4560]',
    neutral: 'text-[#FBBF24]',
  };
  return colors[impact];
}

export function getImpactLabel(impact: NewsItem['impact']): string {
  const labels: Record<NewsItem['impact'], string> = {
    positive: '利好',
    negative: '利空',
    neutral: '中性',
  };
  return labels[impact];
}
