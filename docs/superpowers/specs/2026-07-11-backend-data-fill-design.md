# 后端数据填充设计 — 消除剩余 Mock 数据

**日期:** 2026-07-11
**目标:** 用真实数据替换 Report 页面和 Sentiment 页面的所有 mock 数据

## 背景

当前 Dashboard 的 8 个页面中，6 个已接入后端真实数据。剩余 2 个：
- **Report（晨报）**：100% 纯 mock，需要大盘指数、涨跌统计、板块分析、技术指标、新闻、操作建议等
- **Sentiment（情绪深度）**：2 处硬编码（"本月极度亢奋 12次"）

后端已有数据：25 个飞书群的每 5 分钟快照，包含情绪、操作信号、热门股票/板块及群消息明细。33 天历史数据。

## 设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 行情数据源 | 新浪 + 东方财富免费 API | 无需 API key，稳定 |
| 分析文本生成 | 模板生成 + LLM 接口预留 | 先跑通，后续可切 LLM |
| 技术指标 | 本地 pandas 计算 | 无额外依赖 |
| 架构 | 轻量扩展（新增 3 个模块） | 最小改动，结构清晰 |

## 架构概览

```
backend/
├── server.py          ← 加 5 个 API 路由
├── collector.py       ← 不动
├── market.py          ← 新增：行情数据获取
├── indicators.py      ← 新增：技术指标计算
└── report.py          ← 新增：晨报数据生成

src/
├── pages/Report.tsx   ← 重写：mock → 真实 API
├── pages/Sentiment.tsx ← 修复 2 处硬编码
├── types/api.ts       ← 加 ~50 行 Report 相关类型
└── lib/api.ts         ← 加 fetch 函数
```

---

## 模块 1：market.py — 行情数据

### fetch_indices() → list[MarketIndex]

```
数据源: hq.sinajs.cn/list=s_sh000001,s_sz399001,s_sz399006
返回: [{name, code, value, change, changePercent, open, high, low, prevClose}]
容错: 网络超时/非交易时间 → 返回空列表
```

新浪实时行情接口返回格式（文本）：
```
var hq_str_s_sh000001="上证指数,3287.42,28.56,0.88,12345,1234567";
```
解析逗号分隔字段：名称, 当前价, 涨跌, 涨跌幅%, 成交量(手), 成交额(万)

### fetch_advance_decline() → AdvanceDecline

```
数据源: push2.eastmoney.com/api/qt/clist/get
参数: fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23 (A股全量)
返回: {rising, falling, unchanged, limitUp, limitDown, risingPercent}
容错: 返回 null
```

东方财富返回 JSON，统计涨幅 > 0 为 rising，跌幅 < 0 为 falling，涨停/跌停从幅度判断。

### fetch_kline(code, days=60) → list[KlineBar]

```
数据源: push2his.eastmoney.com/api/qt/stock/kline/get
参数: secid=1.000001 (上证), klt=101 (日K), fqt=0 (不复权), lmt=days
返回: [{date, open, close, high, low, volume}]
用途: 传递给 indicators.py 计算技术指标
```

---

## 模块 2：indicators.py — 技术指标

纯计算模块，无网络请求。输入 K 线数据，输出信号。

### 核心函数

```python
def compute_macd(closes, fast=12, slow=26, signal=9) -> dict
    # 返回 {dif, dea, macd_hist, signal: 'bull'|'bear'|'neutral', description}
    # 金叉 → bull, 死叉 → bear

def compute_rsi(closes, period=14) -> dict
    # 返回 {value, signal, description}
    # > 70 → bear (超买), < 30 → bull (超卖)

def compute_kdj(highs, lows, closes, n=9) -> dict
    # 返回 {k, d, j, signal, description}
    # J > 100 → bear, J < 0 → bull

def compute_boll(closes, period=20) -> dict
    # 返回 {upper, mid, lower, position, description}
    # 价格 > upper → bear, < lower → bull

def compute_all(kline: list[dict]) -> dict
    # 一次性计算所有指标，生成完整 TechnicalData
    # 包括 observations, support_levels, resistance_levels, patterns,
    # indicator_summaries, signals
```

### 支撑/阻力位识别

从最近 N 日 K 线中提取局部极值点，识别关键价格位。

### 形态识别（简化版）

- 连续 N 日上涨 → "连阳上攻"
- 放量突破前高 → "放量突破"
- V 型反转 → "V型反转"

---

## 模块 3：report.py — 晨报数据生成

### generate_report(date_str, day_data, market_data) → ReportData

核心函数，组装所有数据源。

### 各字段生成逻辑

#### overviewText（市场综述）

模板拼接：
```
{date}，A股市场{整体态势}。根据对{group_count}个飞书投资群的实时监测，
今日共采集{total_messages}条消息，涉及{active_groups}个活跃群。
市场情绪整体{sentiment}（看多{bull}%），热点板块集中在{top3_sectors}。
操作信号方面，{action_summary}。
```

#### marketIndices

直接传递 market_data。无行情时返回空数组。

#### advanceDecline

优先用行情 API。无行情时从最后快照的 stk 数据估算。

#### volumeData（量能分析）

从 snapshots 按小时聚合 msg 字段：
```python
hourly = {}
for snap in snapshots:
    hour = snap['t'].split(' ')[1][:2] + ':00'
    hourly[hour] = hourly.get(hour, 0) + snap['msg']
```

有行情数据时用真实成交额替代。

#### hotSectors（热点板块详情）

```python
last_snap = snapshots[-1]
first_snap = snapshots[0]

for sector in last_snap['sec']:
    # trend: 对比 first_snap 和 last_snap 的同一板块 score
    # heatHistory: [snap['sec'][name].sc for snap in snapshots]
    # analysis: AnalysisGenerator.generate_sector_analysis(sector, snapshots)
    # topStocks: 从 stk 中筛选 sec 包含该板块的股票
```

#### hotStocks（热门个股详情）

```python
for stock in last_snap['stk']:
    # trend: 对比首尾快照的 score 变化
    # comment: AnalysisGenerator.generate_stock_comment(stock, snapshots)
```

#### sentimentData

```python
sd = last_snap['sd']
total = sd['bu'] + sd['be'] + sd['ne']
# overall: last_snap['sent']
# bullPercent: sd['bu'] / total * 100
# drivers: 从 top 板块的 sample_text 提取
```

#### technicalData

```python
kline = market.fetch_kline('1.000001')  # 上证指数日K
technical = indicators.compute_all(kline)
```

无行情时返回简化版（从群消息情绪推断）。

#### actionRecommendations

```python
# 对比早/晚快照板块排名变化
early_sectors = snapshots[0]['sec']  # 或第 1/4 处的快照
late_sectors = snapshots[-1]['sec']

# 排名上升 → 资金流入方向
# 排名下降 → 资金流出方向
# 生成 sectorRotations

# 从 act 推导操作倾向
act = last_snap['act']
# buy >> sell → 偏积极
# risk 多 → 加风险警告
```

#### sentimentTimeline

取 8-9 个关键时间点的快照情绪数据：
```python
# 在 snapshots 中找最接近以下时间的快照：
key_times = ['09:30', '10:00', '10:30', '11:00', '11:30', '13:30', '14:00', '14:30', '15:00']
```

#### newsItems（消息面）

从各快照的 sec[].gd[].m（群消息摘要）中提取：
- 按时间排序
- 去重（相似文本合并）
- 取前 8-10 条作为"群内热议"
- category: 根据关键词分类（policy/industry/company/macro）
- impact: 根据所在快照的 sentiment 推断

### AnalysisGenerator — LLM 接口预留

```python
class AnalysisGenerator:
    """分析文本生成器。当前用模板，预留 LLM 接口。"""

    def generate_sector_analysis(self, sector, snapshots) -> str:
        """板块深度分析文本"""
        # 模板: "{name}板块提及{mc}次，覆盖{gc}个群..."

    def generate_stock_comment(self, stock, snapshots) -> str:
        """个股点评文本"""

    def generate_overview(self, stats) -> str:
        """市场综述文本"""

    def generate_recommendations(self, stats) -> dict:
        """操作建议"""

# 未来 LLM 实现：
# class LLMAnalysisGenerator(AnalysisGenerator):
#     def __init__(self, api_key, model):
#         self.api_key = api_key
#         self.model = model
#     def generate_sector_analysis(self, sector, snapshots):
#         prompt = self._build_prompt(sector, snapshots)
#         return self._call_llm(prompt)
```

---

## 新 API 端点（server.py）

```python
GET /api/market/indices
    → market.fetch_indices()
    → 返回 MarketIndex[] | []

GET /api/market/advance-decline
    → market.fetch_advance_decline()
    → 返回 AdvanceDecline | null

GET /api/report/{date}
    → 加载 day_data → 获取 market_data → report.generate_report()
    → 返回完整 ReportData

GET /api/day/{date}/sentiment-timeline
    → 从 snapshots 提取关键时间点情绪
    → 返回 SentimentTimelineItem[]

GET /api/day/{date}/extreme-stats
    → 统计 eh/el 超阈值快照数
    → 返回 {month_extreme_high: int, month_extreme_low: int}
```

---

## 前端改造

### types/api.ts — 新增类型

```typescript
export interface MarketIndex {
  name: string; code: string; value: number;
  change: number; changePercent: number;
  open: number; high: number; low: number; prevClose: number;
}
export interface AdvanceDecline {
  rising: number; falling: number; unchanged: number;
  limitUp: number; limitDown: number; risingPercent: number;
}
// ... 以及 VolumeData, HotSectorDetail, HotStockDetail,
// NewsItem, SentimentData, TechnicalData, ActionRecommendation,
// SentimentTimelineItem, ReportData（从 mockReportData.ts 迁移）
```

### lib/api.ts — 新增 fetch 函数

```typescript
export async function fetchMarketIndices(): Promise<MarketIndex[]>
export async function fetchAdvanceDecline(): Promise<AdvanceDecline | null>
export async function fetchReport(date: string): Promise<ReportData>
export async function fetchSentimentTimeline(date: string): Promise<SentimentTimelineItem[]>
export async function fetchExtremeStats(date: string): Promise<{month_extreme_high: number, month_extreme_low: number}>
```

### Report.tsx — 重写

- 移除所有 mockReportData 导入
- 从 store 获取 currentDate
- useEffect 调用 fetchReport(currentDate)
- 加载中显示骨架屏
- 行情缺失时该区域显示"暂无数据"，其他部分正常
- 日期切换时重新获取

### Sentiment.tsx — 修复

- 调用 fetchExtremeStats(date) 获取真实统计
- 替换硬编码的 "12 次" 和 "5 次"

---

## 文件清单

| 操作 | 文件 | 说明 |
|------|------|------|
| 新建 | `backend/market.py` | 行情数据获取（~80 行） |
| 新建 | `backend/indicators.py` | 技术指标计算（~120 行） |
| 新建 | `backend/report.py` | 晨报数据生成（~250 行） |
| 修改 | `backend/server.py` | 加 5 个路由（~50 行） |
| 重写 | `src/pages/Report.tsx` | mock → 真实 API（保留 UI 结构） |
| 修改 | `src/pages/Sentiment.tsx` | 修复 2 处硬编码（~15 行） |
| 修改 | `src/types/api.ts` | 加 ~50 行类型定义 |
| 修改 | `src/lib/api.ts` | 加 5 个 fetch 函数（~30 行） |
| 安装 | `pip install pandas` | 技术指标计算依赖 |
| 保留 | `src/lib/mockReportData.ts` | 暂时保留（类型定义仍被引用） |

## 容错策略

1. **行情 API 不可用** → market 函数返回空/null → Report 中行情相关区域显示"暂无行情数据"，其他部分正常
2. **K 线数据不足**（新指数/上市不足 60 天）→ 技术指标返回中性信号
3. **日期无数据** → Report API 返回 404 → 前端显示"该日期无数据"
4. **非交易时间** → 行情数据为上一交易日收盘值（新浪接口行为）
