# 全站走查问题修复设计（口径 / 逻辑 / 清洗 / 可达性）

- 日期：2026-09-12
- 状态：待 review
- 涉及：`backend/report.py`、`backend/server.py`、`backend/data_store.py`、`src/lib/`、`src/pages/`、`src/components/`
- 走查方式：kimi-webbridge 驱动真实浏览器，在 `https://touyan.fun/`（页脚版本 `v021f8a1`，与本地 HEAD 一致）上从首页逐个导航点完 10 个页面 + 个股/大V 详情，另做 390×844 移动端视口复测

## 1. 背景

线上站点做了一次完整走查，发现 22 项问题，**其中 8 项是「页面上的数字是错的」**——不是样式问题，是口径错误，会让用户拿到错误的判断依据。本设计把这 22 项归成 4 组，给出修复方案。

## 2. 走查复测说明（三条结论被修正）

走查在 00:33–00:48 进行，10:25 又整体复测了一遍。有三条当时的结论需要修正，写在这里以免后人照着错的前提改代码：

- **「仪表盘/回放整页空白」修正为**：不是页面坏了，而是**空状态判据写错了**。判据看的是「快照对象在不在」（`Dashboard.tsx:810` `if (!currentSnapshot)`），而不是「快照里有没有数据」。每天 00:00 到当日首次有效采集之间，当日快照存在但 `msg=0`、`stk=[]`、`sec=[]`，于是判据不成立、页面照常渲染 → 4 个统计卡全是 0，下面内容区全空，既没有「暂无数据」也没有「换个日期」的引导。10:25 复测当日已有 12 条消息，页面正常。**这是每天都会出现的窗口，不是一次性故障。**
- **「板块页表格空」修正为**：同一原因，当日无数据时的表现，不是独立缺陷，并入 F1 一起修。
- **「历史日期显示当前指数」修正为**：确实拉的是实时值且与日期无关，**但这套数据前端根本没渲染**（详见 F7）——所以它不是「展示错误」，是死数据。同时新发现 F22：报告里那块叫「指数分时走势」的图画的其实是消息量。

另外这两条**排除**（是我的截图方式造成的假象，页面本身没问题）：板块热度趋势图、情绪趋势图「没画线」；以及加载瞬间的 0 值闪动（数字滚动动画）。

## 3. 问题清单

严重度：P1 = 数据错误/功能不可用；P2 = 误导或明显粗糙；P3 = 文案与可达性。

### F1 [P1] 空状态判据用「有没有快照」而不是「有没有数据」

- 位置：`src/pages/Dashboard.tsx:810`、`src/pages/Replay.tsx:819`
- 现象：当日快照存在但为空时，页面渲染出全 0 的统计与空白内容区，无任何空状态文案。
- 证据：00:33–00:48 走查，`/api/day/2026-09-12` 只有 1 条空快照，仪表盘 `0 总消息 / 0 活跃群 / 0 热点股票 / 0 热点板块`，内容区全黑；同状态下 `/sectors` 表格只有表头。
- 复现窗口：每天 00:00 至当日首次有效采集之间。

### F2 [P1] 晨报「总消息」是快照累计值求和

- 位置：`backend/report.py:348` `total_vol = sum(s.get("msg", 0) for s in snapshots)`
- `msg` 是**当日累计值**（最后一个快照 = 全天总数），对 118 个快照求和得到荒谬结果。
- 证据：2026-09-10 卡片显示 **68,522**，同日 `meta.message_count = 1187`，而**同一页面的市场综述正文**写的是「今日共采集 **1,187** 条消息」；2026-09-12 卡片 48，`meta.message_count = 12`。

### F3 [P1] 晨报「消息量分时趋势」同一根因

- 位置：`backend/report.py:337-339` `hourly[hour] = hourly.get(hour, 0) + snap.get("msg", 0)`
- 分时图是「同一小时内各快照累计值之和」，形状只反映该小时采了几次，不反映消息量。09-10 的「15:00 高峰 12,080 条/小时」纯属该小时快照最多。

### F4 [P1] 晨报「较昨日 +0.0%」恒为 0

- 位置：`backend/report.py:346-347` `"prevVolume": 0, "changePercent": 0` 硬编码。

### F5 [P1] 晨报「活跃群 23/25」是硬编码字符串

- 位置：`src/pages/Report.tsx:1085` `value="23/25"`
- 证据：2026-09-12 当日 `grp = 4`，页面仍显示 `23/25`。

### F6 [P1] 涨跌家数用聊天情绪估算，冒充真实行情

- 位置：`backend/report.py:324-333`，`/api/market/advance-decline` 返回 `null` 时走兜底：`rising = 看多条数 × 30`、`falling = 看空条数 × 30`、`unchanged = 5100 - 两者`。
- 证据：2026-09-11 显示「**93.8% 上涨**」，而同一页大盘指数是 **-1.18%**。两个数字互相矛盾，且没有任何「估算」标注。

### F7 [P2] 大盘指数是「死数据」：既与日期无关，也根本没渲染（走查结论已修正）

- 位置：`backend/server.py:670-687`，`api_report` 无条件 `fetch_indices()`，与 `date_str` 无关；`/api/report/2026-09-10` 与 `/api/report/2026-09-11` 的 `marketIndices` 完全相同（上证 3888.1106 / -46.293）。
- **但前端从未渲染它**：`grep -n "marketIndices" src/pages/Report.tsx` 只有第 48 行的类型默认值；线上报告页 DOM 里搜不到「上证 / 深证 / 创业板」。
- 结论：这是一条每次都白白拉取、存进缓存、再传给前端被忽略的数据。**修法是删掉，不是修对**——见 §4.4。
- 附带（上游数据，非本仓库生成）：指数自身 `high === value`（下跌日最高价等于收盘价）、`open === prevClose`。

### F22 [P2] 「指数分时走势」图画的其实是消息量，且与「消息量分时趋势」同源

- 位置：`src/pages/Report.tsx:414`（大盘分析里的 `AreaChart`）与 `:530` 附近的同名图表，**都**用 `data.volumeData.hourlyData`。
- 现象：同一份数据画了两遍，其中一遍挂在「大盘分析」下、标题写成「指数分时走势」。用户以为在看指数，实际看的是群消息条数。
- 证据：两处 `dataKey="value"` 的数据源都是 `data.volumeData.hourlyData.map(h => ({ time: h.time, value: h.volume }))`；线上 DOM 里「大盘分析」区块没有指数数值。

### F8 [P1] 群活跃度热力图恒空

- 位置：`src/pages/Sentiment.tsx:538`（`groups`）与 `:101`（`buildGroupHeatmap`）都读 `sec.gd[]`；但 `backend/data_store` 压缩快照时把 `gd` 整个丢掉，`/api/day/{date}` 从不返回它。
- 证据：页面长期显示「暂无群消息数据」。当日 4 个活跃群、15 条情绪样本，热力图仍是空的。
- 说明：`store.get_raw_snapshots(date)` 能拿到带 `gd` 的原始快照，但体积是压缩后的 10 倍以上，不能直接给前端。

### F9 [P1] 对比页「操作信号对比」恒空 + 买卖比恒 ∞

- 位置：`src/pages/Compare.tsx:825` `const actions = ['买入', '卖出', '持有', '风险']`，`:869-871` 同样用 `actionCounts['买入']` / `['卖出']`。
- 而 `actionCounts` 来自 `lastSnap.act`，实际 key 是 `买入信号 / 卖出信号 / 持有建议 / 风险提示`（已用 `/api/day/2026-09-11` 核对）。
- 结果：柱子全取 0 → 图表只有 0~4 的空轴；买卖比 `sellCount > 0 ? ... : '∞'` → 三个日期全显示 `∞`。

### F10 [P1] 情绪页两条互斥预警同时出现

- 位置：`src/pages/Sentiment.tsx:693`（`sd.eh > 5`）与 `:706`（`sd.el > 5`）是两个独立条件，各自渲染。
- 证据：2026-09-10 `eh=82`、`el=10`，页面同时挂出「市场极度亢奋，注意追高风险」和「市场极度悲观，或存在反弹机会」。
- 同源问题：`:441`（`eh > 3`）与 `:450`（`el > 3`）的「情绪洞察」条目阈值同样过低、同样不互斥。

### F11 [P2] 对比页默认把「今天」选进对比

- 位置：`src/pages/Compare.tsx:113-117`，取 `availableDates[0]` / `[1]`，而 `availableDates` 按日期倒序，`[0]` 就是今天。
- 现象：今天数据尚少或为空时，第一列整列「—」，首屏看起来是坏的。

### F12 [P2] 0 条消息也给出情绪结论

- 现象：对比页 `2026-09-12` 当天 0 条消息时，「情绪」列显示「分歧」而非「—」。`biasText(0, 0)` 返回「分歧」，语义上把「没有样本」说成了「多空分歧」。

### F13 [P2] 对比页「持续性」列只有彩色圆点，没有图例

- 位置：`src/pages/Compare.tsx` 股票/板块对比表的末列。用户无从得知颜色含义。

### F14 [P2] 晨报消息卡片「标题」重复「正文」开头

- 位置：`backend/report.py:275-276` `"title": text[:40]`、`"summary": text[:80]` —— 摘要必然以标题开头。
- 证据：每条卡片都显示两遍同样的文字。

### F15 [P2] 消息正文残留 markdown 与采集元数据

- 证据 A（元数据）：`2026-08-06 18:24:42 [编辑]` 作为正文首行渲染（`/api/palace/kols/{id}/stocks/600658` 原文即如此）；晨报卡片有 `【讲师】胖大叔 2026 09 10 23:50:19`。
- 证据 B（markdown）：晨报「消息面汇总」渲染出 `### 橙子不糊涂的科技花园[https://wap.eastmoney.` —— `###` 与截断的链接原样显示。
- 已有能力：`src/lib/palace.ts:92 readableText()` 已能折叠**完整**的 `[文字](url)`；截断的链接（无右括号）折不掉，`###` 也没人管。

### F16 [P2] 日期下拉显示数据体积，且对比度不足

- 位置：`src/pages/Dashboard.tsx:190` `({(d.size_kb / 1024).toFixed(1)} MB)`。
- 对用户来说「35.9 MB」没有意义，他要的是「这天有多少条消息」。
- 对比度不足：该文字用 `text-ink-quaternary`（`hsl(240 4% 36%)` = `rgb(88,88,95)`）。⚠️ **走查时量的背景是页面底色 `surface-0`（`#0A0A0D`），得到约 2.8:1 —— 这是错的**：下拉面板自己画了 `bg-surface-2`（`hsl(240 8% 12%)` = `rgb(28,28,33)`），选中行还是 `bg-surface-3`（`rgb(39,39,48)`）。按真实背景重算：

  | token | 在 surface-2 上 | 在 surface-3（选中行）上 |
  |---|---|---|
  | `ink-quaternary`（原） | 2.41:1 | 2.10:1 |
  | `ink-tertiary` | 3.51:1 | 3.06:1 |
  | `ink-secondary` | **6.86:1** | **5.98:1** |

  结论没变（太低），但**要换到 `ink-secondary` 才过 AA 的 4.5:1**；`ink-tertiary` 看着像提升、实际仍不达标。

### F17 [P2] 个股页「历史讨论」同秒近重复消息

- 现象：`600857` 在 `2026-09-10` 有 5 对消息，**同一时间戳、同一群、不同 message id**，一条中文一条拼音：`中百feng死` / `中百封死`、`买le次日` / `买了次日`、`反正ying该` / `反正应该`。
- 现有去重按精确文本比对（`backend/server.py:_deduplicate_messages`），抓不到这种。

### F18 [P3] 「返回 Dashboard」中英混排

- 位置：`src/pages/StockDetail.tsx:111`、`:1116`。导航栏对应的中文是「仪表盘」。

### F19 [P3] 产业链右侧面板缺「补涨候选」徽章

- 位置：`src/components/chain/DetailPanel.tsx:83` 未上榜邻居只显示「未上榜」；`src/components/chain/ChainList.tsx:72` 同一状态有「补涨候选」徽章。
- 页面帮助文案写的是「未上榜的票会被标成 **补涨候选**」，右面板却只写「未上榜」，两处口径不一致。

### F20 [P3] 图标按钮缺 `aria-label`

- 位置：Dashboard 刷新按钮（`Dashboard.tsx:204` 附近）、Replay 播放/暂停/跳到开头/跳到结尾（`Replay.tsx:620/660` 等）、移动端内容区图标 tab。
- 影响：无障碍树里这些元素的 name 为空。

### F21 [P3] 移动端顶部图标 tab 无文字，且与底部导航重复

- 位置：`Dashboard.tsx:263-267`（`tabs`）与 `MobileBottomNav`（`Dashboard.tsx:775-798`）。
- 现象：390px 视口下**同一功能有两套切换器**——内容区顶部一排**只有图标没有文字**的 tab，和底部一排带文字的 tab。四个图标（折线/层叠/波形/闪电）单独看含义不明。

## 4. 修复设计

### 4.1 前端纯逻辑一律抽到 `src/lib/`（可测性约束）

`vitest.config.ts` 只收 `src/**/*.test.ts`，`environment: 'node'`，没有 jsdom / testing-library。**组件测不了**。因此凡是能写成纯函数的修复，一律抽到 `src/lib/<name>.ts` 并配 `src/lib/<name>.test.ts`；剩下真属于「渲染」的部分，靠本地真浏览器验证（见 §6）。

新增：`src/lib/actions.ts`、`src/lib/sentiment.ts`、`src/lib/dataState.ts`、`src/lib/messageText.ts`。

### 4.2 F2/F3/F4 —— 晨报量能用「当日口径」

```python
meta = day_data.get("meta", {})
total_vol = int(meta.get("message_count", 0))     # 全天消息总数，不再求和
```

分时改为**逐快照增量**（`msg` 是累计值）：

```python
prev = 0
for snap in snapshots:                # 已按时间升序
    cur = int(snap.get("msg", 0))
    delta = cur - prev
    if delta < 0:      # 跨天重置/脏数据，按当前累计值兜底
        delta = cur
    prev = cur
    hourly[hour] = hourly.get(hour, 0) + delta
```

「较昨日」需要前一天的总数：`generate_report` 增加入参 `prev_message_count: int | None`，由 `api_report` 查**上一个有数据的日期**后传入（复用 §4.3 的「跳过空日期」逻辑）。拿不到时 `prevVolume` 为 `None`，前端文案从 `+0.0% 较昨日` 改成「较昨日暂无数据」。

### 4.3 F1 —— 空状态判据改成「有没有数据」，并把「跳过空日期」收敛成一个 helper

新增 `src/lib/dataState.ts`：

```ts
/** 一条快照里到底有没有内容。msg/grp/stk/sec 全空即视为空。 */
export function hasContent(snap: Snapshot | null | undefined): boolean

/** 从倒序的可用日期里挑第一个「有数据」的日期；全都没有则返回第一个。 */
export function pickDefaultDate(dates: DateInfo[], isNonEmpty: (d: string) => boolean): string
```

**判据要落在「这一天有没有数据」，不是「当前这个快照有没有数据」**，两个页面的层级并不相同：

- `Dashboard.tsx` 渲染的是 `aggregateSnapshots` 聚合后的**全天视图**，聚合为空 ⟺ 整天空 —— 所以 `!hasContent(currentSnapshot)` 本身就是天级判据，直接用。
- `Replay.tsx` 是**逐帧**看的，`displaySnapshot` 是用户拖到的那一帧。单帧为空是正常的（`aggregate.ts` 注释：「任意单个快照可能为空或异常（采集抖动、去重回归等）」），实测本机 25 个 day 文件里有 20 个至少含一个全空帧（多数在 index 0，也有中段的）。所以判据必须是 `snapshots.some(hasContent)`：整天没数据才显示空状态，否则照常渲染那一帧。**若按帧判，拖到空帧会整页被替换 —— 连同时间轴控制器一起消失，用户再也拖不回有数据的帧。**

两处都渲染「当日暂无数据」空状态；Dashboard 另给一个「查看最近有数据的一天」按钮（调用 `loadDate(pickDefaultDate(...))`）。

`store.init()` 现在取 `status.current_date || dates[0].date`（`src/store/useStore.ts:113`）。改为：若当前日期无数据（`/api/day/{date}` 的 `meta.message_count === 0`），回退到最近一个 `message_count > 0` 的日期；一个都没有才用 `current_date`。

`Compare.tsx` 的默认选择复用同一个 helper（修 F11）：默认选前两个**有数据**的日期。

`/api/dates` 目前只给 `size_kb`，前端无法判断哪天有数据 → 见 §4.7，给它加上 `message_count`。

### 4.4 F5/F6/F7 —— 晨报元数据不再说谎

- **F5 活跃群**：`generate_report` 增加 `activeGroups: {active: int, total: int}`。`total` 取 `config` 里的群总数（`/api/status` 的 `group_count`，即 25），`active` 取最后一条快照的 `grp`。前端 `Report.tsx:1085` 改成 `${activeGroups.active}/${activeGroups.total}`。
- **F6 涨跌家数**：**删掉估算分支**。真实源拿不到就让 `advanceDecline = None`，前端 `Report.tsx:454` 的 `{data.advanceDecline && ...}` 加 else 分支渲染「涨跌家数暂不可用（数据源未返回）」。理由：`看多条数 × 30` 不是估算，是编造；把编造值和真实指数并排展示比留白更有害。
- **F7 指数**：**删除**。`api_report` 不再调用 `fetch_indices()`，`generate_report` 去掉 `market_indices` 参数与返回字段 `marketIndices`，前端类型 `ReportData.marketIndices` 一并删掉。理由：没有任何消费方，留着只会让人以为「历史日期的报告里有指数」。`fetch_indices()` 函数本身保留（`/api/market/indices` 端点还在用），只是晨报不再拉。
- **F22 指数分时走势图**：那块的标题与内容不符，改成如实标题「消息量分时走势」；由于与「量能分析」里的图完全同源，**直接删掉这一块**，`大盘分析` 保留情绪仪表 + 情绪演化时间线即可。

### 4.5 F8 —— 热力图改走专用轻量端点

新增 `GET /api/day/{date}/group-activity`，服务端从**原始**快照（`store.get_raw_snapshots`，带 `gd`）聚合出 `群 × 时间槽` 的消息计数，只回小体积计数矩阵：

```json
{ "date": "2026-09-10",
  "groups": ["006_帝凌枫", "..."],
  "slots": ["09:35", "09:40", "..."],
  "cells": [[0, 3, 5], [1, 0, 2]],
  "sentiment": { "06_帝凌枫": "偏多" } }
```

不在 `/api/day` 里塞 `gd`（会把响应撑大十倍以上）。`data_store` 增加 `group_activity(date)` 方法，带自己的派生缓存（TTL 与 `/api/day` 的 day 缓存一致）。

前端 `Sentiment.tsx` 改为拉这个端点，`buildGroupHeatmap` 的入参从快照数组换成端点返回的矩阵。

### 4.6 F9 —— 操作信号 key 归一化

新增 `src/lib/actions.ts`：

```ts
export const ACTION_KEYS = ['买入', '卖出', '持有', '风险'] as const;
export type ActionKey = typeof ACTION_KEYS[number];

/** 后端 act 的 key 是「买入信号/卖出信号/持有建议/风险提示」，这里统一成短名。 */
export function normalizeActionCounts(act: Record<string, number> | undefined): Record<ActionKey, number>

/** 卖出为 0 时返回 null（调用方决定显示「—」而不是 ∞）。 */
export function buySellRatio(counts: Record<ActionKey, number>): number | null
```

`Compare.tsx` 的柱状图与买卖比都改成消费归一化后的结果；买卖比拿不到时显示「—」（F9 顺带修掉「∞ 是数学上无意义的分母为 0」这个表达）。

### 4.7 F10/F12/F13/F16/F17 —— 其余前端逻辑

- **F10**：新增 `src/lib/sentiment.ts`，把「预警/洞察」的取舍写成纯函数：

```ts
export type SentimentAlert = { kind: 'euphoria' | 'panic'; text: string } | null;
/** 亢奋与悲观互斥：按 (亢奋数 - 悲观数) 的符号决定，差值绝对值不过阈值就都不报。 */
export function pickAlert(euphoria: number, pessimism: number, threshold = 5): SentimentAlert
```

  规则三层，顺序不能换（`hot(x) := x >= threshold`）：
  1. `!hot(eh) && !hot(el)` → 不报（本来就没话说）；
  2. **`hot(eh) && hot(el)` 且 `|eh - el| < threshold`** → 不报（两边都高且势均力敌，这才是「剧烈分歧」）；
  3. 否则报数值大的那一方。

  ⚠️ 第 2 条的 `hot(eh) && hot(el)` 限定条件是必须的，不能只写 `|eh - el| < threshold`：后者会把「只有一边刚过线」的情况也吞掉（`eh=8, el=4` → 差值 4 < 5 → 沉默），而这类单边信号原来（`eh > 5`）是会显示横幅的 —— 那等于用一个新 bug 换掉旧 bug。

  以 2026-09-10 为例（`eh=82`、`el=10`）：82 比 10 是 8:1，亢奋明显占优，**该报「亢奋」而不是都不报** —— 原缺陷是「两条同时出现」，不是「报了一条」。

  消费方有三个，都走这一个判据：
  - `Sentiment.tsx:693/706` 的两条横幅（合并成一个 `<AnimatePresence>`）；
  - 洞察条目（`:441/:450`）；
  - **`ExtremeAlerts` 的两条附注**（`:348` 的「市场可能过热，注意回调风险」与 `:376` 的「或存在反弹窗口」）—— 它们原来各自按 `eh > 3` / `el > 3` 独立渲染，`eh=82/el=10` 时同样会同时挂出两条相反的提示，与横幅是同一个毛病。极值**数字**本身（「极度亢奋 82」「极度悲观 10」）是统计事实，照常都显示；只把**附注文字**收敛到占优的一方。

  不改 `getAlertLevel`（`:57-60`）：它驱动的是顶部状态点，语义是「存在极端读数」（事实），与「哪一方占优」（判断）是两回事，`(40,38)` 时点报警而横幅沉默是合理的。
- **F12**：`biasText(0, 0)` 改为返回 `'—'`（`src/lib/palace.ts:113`），调用方按「无样本」渲染；对比页的情绪列同步。
- **F13**：对比表末列加图例（`● 连续在榜 / ● 新进 / ● 掉榜`），文案与配色跟上表头。
- **F16**：`/api/dates` 增加 `message_count`（见 §4.8），前端日期下拉把 `(35.9 MB)` 换成 `1,187 条`；文字色从 `text-ink-quaternary` 提到 `text-ink-tertiary`，保证 ≥4.5:1。
- **F17**：新增 `src/lib/messageText.ts` 的 `dedupeNearDuplicates(items, opts)`：同 `ts` + 同群 + 文本相似度 ≥0.8（去空白与标点后的 Levenshtein 比）时只保留**中文占比更高**的那条（拼音版特征：`[a-z]{2,}` 连续片段多）。个股页「历史讨论」与「群消息溯源」列表渲染前过滤。

### 4.8 F14/F15 —— 消息文本清洗

- **F14（后端）**：`_extract_news_from_raw` 不再 `text[:40]` / `text[:80]`：
  - `title` = 洗过的正文按首个换行切出的第一行（≤40 字，超出加省略号）
  - `summary` = 第一行之后的剩余文本（≤120 字）；没有第二行就留空串，前端 `NewsCard` 在 `summary` 为空时**不渲染那个 `<p>`**。
- **F15（前后端各一半）**：
  - 前端新增 `src/lib/messageText.ts` 的 `cleanMessageText(text)`：在 `readableText` 的基础上，额外剥掉
    - 行首采集元数据：`^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?\s*(\[编辑\])?\s*$` 这样的独立行，以及 `【讲师】xxx 2026 09 10 23:50:19` 形态的前缀
    - 行首 `#{1,6}\s+`（markdown 标题记号）
    - **截断的** markdown 链接（`\[[^\]]*\]\([^)]*$`，到行尾都没有右括号）
  - 后端 `readableText` 的 Python 版（`backend/collector.py:_logical_text` 只管归因，不改存储文本）——**本期不动存量数据**，只在**展示层**清洗，理由：存量 `data/day_*.json` 与 palace 库已经落盘，改存储要重跑全量回填，风险远大于收益。`_extract_news_from_raw` 生成 title/summary 时也调同一个 Python 清洗函数，保证晨报卡片一致。
  - 新增 `backend/textclean.py`（Python 版 `clean_message_text`），与前端保持同一套规则；两边各配一份测试，用例表由本 spec §3 的 F15 证据固定。

### 4.9 F18/F19/F20/F21 —— 文案与可达性

- **F18**：`返回 Dashboard` → `返回仪表盘`（两处）。
- **F19**：`DetailPanel` 的未上榜邻居在「同环节」条件成立时改用与 `ChainList` 一致的「补涨候选」徽章；判断逻辑抽到 `src/lib/chain.ts` 的 `isCandidate(node, peers)`（已有 `src/lib/chain.test.ts` 可扩展）。同时把右面板标题「同环节邻居」统一为「同环节」。
- **F20**：给下列元素补 `aria-label`：Dashboard 刷新（`重新加载数据`）、Replay 播放/暂停（随状态切换文案）/跳到开头/跳到结尾、移动端内容区图标 tab（用 `tab.label`）、移动端底部导航（已有文字，加 `aria-current`）。
- **F21**：移动端（`<sm`）**隐藏内容区顶部那排图标 tab**，只保留底部带文字的导航；`MobileBottomNav` 的按钮补 `aria-label`。

## 5. 非目标

- 不改热度公式、不改归因算法、不改词库。
- 不回填/重写存量 `data/day_*.json` 与 palace 库（F15 只在展示层清洗）。
- 不引入外部行情源来修 F6/F7（拿不到真实涨跌家数就诚实留白，不接新数据源）。
- 不加前端组件测试框架（不引入 jsdom / testing-library）。
- 不动产业链图谱的 canvas 渲染方式。

## 6. 验证方案

三层，缺一不可：

1. **后端单测**：`python3 -m pytest tests/ -v`（注意本仓库无 `python` 命令）。新增 `tests/test_report_volume.py`、`tests/test_group_activity.py`、`tests/test_textclean.py`。
2. **前端单测**：`npm test`（vitest，只收 `src/**/*.test.ts`）。新增 `src/lib/actions.test.ts`、`sentiment.test.ts`、`dataState.test.ts`、`messageText.test.ts`；扩展 `chain.test.ts`、`palace.test.ts`。
3. **本地真浏览器**：本地起 `python3 -m uvicorn backend.server:app --port 8765` + `npm run dev`（vite 固定在 **3000** 端口，`vite.config.ts:66`），用 kimi-webbridge 打开 `http://127.0.0.1:3000/`（vite 已把 `/api` 代理到 8765，`vite.config.ts:67-72`）逐条复验，截图存 `docs/superpowers/plans/assets/2026-09-12-site-audit/`，把「问题号 → 复验步骤 → 截图路径 → 结论」记进 `docs/superpowers/plans/2026-09-12-site-audit-fixes-verification.md`。

**注意**：本地 `data/` 是旧副本（云端才是采集真身），本地日期/数据与线上不同。因此本地复验只验证**逻辑正确性**（口径算对、空状态出现、图表有柱子），不比对具体数字；数字口径用线上 API 的原始响应做断言（F2 的 68,522 vs 1,187 就是这种）。
