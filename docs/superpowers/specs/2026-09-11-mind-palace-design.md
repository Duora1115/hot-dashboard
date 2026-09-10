# 大V 观点宫殿（Mind Palace）设计

- 日期：2026-09-11
- 状态：待 review
- 涉及：`backend/palace.py`（新增）、`scripts/backfill.py`（新增）、`scripts/build_palace.py`（新增）、`backend/server.py`、`backend/collector.py`、`src/pages/Kols.tsx`（新增）、`src/pages/KolDetail.tsx`（新增）、`src/pages/StockDetail.tsx`、`src/lib/api.ts`、`src/App.tsx`、`src/components/Navbar.tsx`、`src/types/api.ts`、`tests/`

## 1. 背景与目标

现有站点是「快照导向」：每 5 分钟把当天全部消息累加算成一个快照（Top10 股票），写进 `day_*.json`。同一条消息在当日 100+ 个快照里被重复存储约 40 倍；`group_details` 只保留 Top10 股票的明细，且每条只有 `time` + `text`，**没有发送者、没有 message_id**。这条管线适合「实时大盘热度」，不适合承载「历史观点档案」。

用户购买了 25 个付费炒股群（覆盖不同风格的活跃资金），需要把这些群的内容沉淀成可检索、可对照的知识库——一个「观点宫殿」，从两个方向透视：

- **大V → 股票**：每个大V过去两个月讨论了哪些股票、对每只票说过什么、他是什么风格。
- **股票 → 大V**：一只票历史上有哪些大V讨论过、各自的操作与观点是什么。

**目标**
- 新增**消息档案库**：全量消息、按群存原文、带发送者、按 message_id 去重、长期保留，并通过 lark-cli 回补过去约两个月历史。
- 新增**观点抽取层**：复用现有 `analyze_text()`，为每条提及股票的消息产出结构化观点。
- 新增**聚合层与 API**：支持大V维度与股票维度两个方向的查询。
- 新增**前端两个页面**，并在现有个股页加「大V观点」区块。

**非目标**
- **不做大V打分 / 前向收益**（本期不做，但档案层为其预留：有了全量消息 + 时间戳，后续可直接接行情算 T+1/T+3/T+5）。
- **不做力导向关系图**（大V详情页先做「股票列表 + 观点时间线」）。
- **不引入 LLM**：风格画像纯规则，结构里预留 `ai_summary` 字段供将来使用。
- **不扩群**：只做现有 25 个群。
- **不改实时快照管线**：`day_*.json`、Top10、看板各页行为不变；档案只是在采集时顺带多写一份。

## 2. 现状勘察结论（设计依据）

- **真实数据源在云端** `http://47.253.54.6:8765`：`/api/dates` 返回 48 天，范围 2026-07-25 → 2026-09-10，其中 35 天为有效交易日（其余是周末/小文件）；`/api/status` 报 `group_count=25`。
- **本地 `data/` 是旧副本**：33 天，范围 2026-06-05 → 2026-07-09。
- 两份合起来覆盖约 2 个月，但 **2026-07-10 → 2026-07-24 存在约两周空洞**，依赖回补填补。
- **`lark-cli` 只在云端可用**，本地未安装。采集命令为 `lark-cli im +chat-messages-list --chat-id <id> --page-size 50 --sort desc`（见 `backend/collector.py:180`）。
- **抽取逻辑可直接复用**：`analyze_text(text, cfg)`（`backend/collector.py:383`）对单条消息返回 `by_code`，即 `{code: {sectors, bull, bear, actions}}`，其中板块/多空/操作按「就近窗口」归因（`attribute_message`）。
- **保留策略不会误伤档案**：`cleanup_old_files()` 只 glob `data_dir/day_*.json`，档案放在 `data/archive/` 子目录，天然不受 `retention_days=14` 影响。
- **前端取数约定**：所有请求走 `src/lib/api.ts` 的 `fetchJson`，页面路由在 `src/App.tsx`，已有 8 个路由（`/`、`/replay`、`/stock/:code`、`/sectors`、`/sentiment`、`/report`、`/compare`、`/chain`）。

## 3. 架构与数据流

```
┌─ 采集 ────────────────────────────────────────────────┐
│ scripts/backfill.py  (lark-cli 翻 ~2 个月，断点续传)    │
│ collector 实时抓取 → 顺带 append（复用已抓到的消息）     │
└───────────────────────┬───────────────────────────────┘
                        ↓
┌─ 档案层（真相源 · 追加式 · 长期保留）──────────────────┐
│ data/archive/<chat_id>.jsonl                           │
│   每行：{id, ts, group, sender, text}                  │
└───────────────────────┬───────────────────────────────┘
                        ↓  scripts/build_palace.py
                        ↓  analyze_text()（复用现有抽取）
┌─ 抽取层（派生 · 可幂等重建）──────────────────────────┐
│ data/palace/opinions/<chat_id>.jsonl                   │
│   每行：{ts, id, code, name, bull, bear, actions,       │
│          sectors, text}                                │
└───────────────────────┬───────────────────────────────┘
                        ↓  build_palace.py 汇总
┌─ 索引层（预计算 · 无正文 · 体积小）───────────────────┐
│ data/palace/kols.json          每群画像                 │
│ data/palace/stock_index.json   每票跨群汇总             │
└───────────────────────┬───────────────────────────────┘
                        ↓
┌─ 服务层 ──────────────────────────────────────────────┐
│ backend/palace.py  PalaceStore（懒加载 + LRU，仿 DataStore）│
│ /api/palace/*                                          │
└───────────────────────┬───────────────────────────────┘
                        ↓
┌─ 前端 ────────────────────────────────────────────────┐
│ /kols 大V列表 · /kol/:chatId 大V详情 · /stock/:code 扩展 │
└───────────────────────────────────────────────────────┘
```

## 4. 数据模型

### 4.1 档案层 `data/archive/<chat_id>.jsonl`

按群分文件。理由：单群追加不必锁全库、可单独回补、同步粒度小、读单群时不触碰其他群、便于定位损坏范围。

```jsonc
{
  "id": "om_xxx",                      // message_id，去重键
  "ts": "2026-07-06 08:09",            // 本地时间（CST），取自 create_time
  "group": "253_橙子不糊涂",            // 群名（= 大V）
  "sender": "ou_xxx",                  // 发送者 ID，仅存档，模型按「群=大V」用
  "text": "……"                          // 原文，不做清理
}
```

约定：
- **原样落盘**，不做任何过滤或改写；过滤只发生在抽取层。
- **去重键 = `id`**。`backfill.py` 与实时追加都必须先查已存在的 id 集合。
- 文件名用 `chat_id`（含 `oc_` 前缀），`group` 名字段保留冗余便于阅读。

### 4.2 抽取层 `data/palace/opinions/<chat_id>.jsonl`

```jsonc
{
  "ts": "2026-07-06 08:09",
  "id": "om_xxx",                      // 回指档案，用于溯源
  "code": "301308",
  "name": "江波龙",
  "bull": true, "bear": false,
  "actions": ["买入信号"],
  "sectors": ["半导体"],
  "text": "……"                          // 与档案中该消息的 text 相同
}
```

约定：
- **一条「观点」= 一条消息 × 它提及的一只票**。一条消息提 3 只票 → 3 行。
- 字段来自 `analyze_text()` 的 `by_code`；`name` 由 `load_stock_mapping()` 反查，缺失时回落到消息链接文本。
- `text` 直接冗余存储（换取 UI 展示无需回档案 join）。单群两个月量级为几千到几万行、单文件数 MB，可接受。
- **可幂等重建**：删除整个 `opinions/` 后重跑 `build_palace.py`，结果一致。档案层是唯一真相源。

### 4.3 索引层

**`data/palace/kols.json`** —— 每群画像，前端列表页一次拉取：

```jsonc
{
  "generated_at": "2026-09-11T10:00:00+08:00",
  "coverage": { "from": "2026-06-05", "to": "2026-09-10", "groups": 25,
                "missing_days": ["2026-07-10", "2026-07-11"] },
  // missing_days = [from, to] 区间内「全部群消息数为 0」的工作日（周末不计）
  "kols": {
    "oc_xxx": {
      "name": "253_橙子不糊涂",
      "msg_count": 12345, "opinion_count": 2345,
      "active_days": 58, "stock_count": 87,
      "first_ts": "2026-06-05 09:12", "last_ts": "2026-09-10 15:01",
      "style": {
        "bias": { "bull": 1200, "bear": 300, "ratio": 0.80, "label": "偏多" },
        "trading": ["趋势", "中长线"],
        "breadth": { "distinct_stocks": 87, "concentration": 0.12 },
        "top_sectors": [["半导体", 120], ["AI算力", 80]],
        "session": { "intraday": 0.6, "after_hours": 0.4 },
        "ai_summary": null
      }
    }
  }
}
```

**`data/palace/stock_index.json`** —— 每票跨群汇总，**不含正文**：

```jsonc
{
  "301308": {
    "name": "江波龙",
    "group_count": 5, "total_mentions": 42,
    "first_ts": "2026-06-20 10:03", "last_ts": "2026-09-09 14:20",
    "groups": {
      "oc_xxx": { "name": "253_橙子不糊涂", "count": 12, "last_ts": "2026-07-06 08:09",
                  "bull": 8, "bear": 2, "actions": ["买入信号", "风险提示"] }
    }
  }
}
```

正文只在 `opinions/` 里存一份，两个索引都不存正文，**不重复存储**。

## 5. 采集与回补

### 5.1 `scripts/backfill.py`

- 参数：`--group <chat_id|all>`、`--since <YYYY-MM-DD>`、`--until <YYYY-MM-DD>`（缺省 since = 今天 -60 天）。
- 用 `lark-cli im +chat-messages-list --chat-id <id> --page-size 50 --sort desc` 逐页往回翻，直到越过 `--since` 或 `has_more=false`。
- **幂等**：写入前读取该群档案已有 id 集合，只追加 id 不存在的新消息。
- **断点续传**：每群维护 `data/archive/.state.json`，记录「已回补到的最早时间戳」；重跑时从断点继续，不从头翻。
- **失败可见**：单群失败不影响其他群；退出码与日志汇总每群的成功/失败/翻到的起止时间。

### 5.2 实时接入

在 `collector` 抓取到新消息后（`fetch_messages_incremental` 已拿到完整 message dict，含 `sender`/`create_time`/`message_id`），**顺带 append 到对应群档案**。这样当天数据不需要二次抓取，档案自动跟新。

「顺带 append」必须**不能影响主采集流程**：写档案失败只记 warning，不抛出、不改变采集结果。

## 6. 聚合层 PalaceStore（`backend/palace.py`）

仿 `backend/data_store.py` 的 `DataStore`：

- **启动**：扫描 `data/palace/opinions/*.jsonl` 取元信息（每群行数、时间跨度、股票数）；加载 `kols.json` 与 `stock_index.json` 进内存（两者都不含正文，体积可控）。
- **按需**：单群观点文件走 **LRU 懒加载**（复用现有 `RawDataLRU` 的思路），不在启动时全量加载。
- **对外方法**：
  - `list_kols()` → 全部画像
  - `get_kol(chat_id)` → 画像 + 该群股票聚合（按 `code` 聚合观点：提及数、多空、操作、首末时间、最近 3 条代表性观点）
  - `get_kol_stock(chat_id, code)` → 该群对该票的完整观点时间线（含正文）
  - `get_stock_kols(code)` → 该票的跨群汇总（读 `stock_index.json`）
  - `get_meta()` → 覆盖范围、生成时间、缺失日期

## 7. 风格画像（纯规则）

从该群全部观点统计 6 个维度，写进 `kols.json` 的 `style`：

1. **多空倾向** `bias`：`bull / (bull + bear)`，附档位标签（`偏多` ≥0.65 / `偏空` ≤0.35 / 其余 `中性`）。分母为 0 时 `ratio=null`、`label="无信号"`。
2. **操作风格** `trading`：对以下三组词表在观点正文中计数，取分最高的一到两个作为标签。
   - 打板短线：涨停、打板、一字、封板、竞价、接力、首板
   - 低吸埋伏：低吸、回调、分批、埋伏、左侧、补仓
   - 趋势中长线：格局、持有、趋势、主升、中线、基本面
3. **覆盖广度** `breadth`：distinct 股票数 + 集中度（Top1 股票提及数 / 总提及数）。
4. **常聊板块** `top_sectors`：从观点的 `sectors` 聚合取前若干。
5. **活跃度 / 时段** `session`：盘中（09:30–15:00）与盘外消息占比。
6. `ai_summary`：固定为 `null`，前端在为空时不渲染。

词表规模小、可解释、零新增依赖。将来接 LLM 时只填 `ai_summary`，不改其他字段。

## 8. API

| 端点 | 说明 |
|---|---|
| `GET /api/palace/meta` | 覆盖范围、生成时间、缺失日期，前端顶部据此提示 |
| `GET /api/palace/kols` | 大V列表 + 画像概要 |
| `GET /api/palace/kols/{chat_id}` | 画像 + 该群讨论过的股票（排序：提及次数 / 最近活跃） |
| `GET /api/palace/kols/{chat_id}/stocks/{code}` | 该群对某票的观点时间线（含正文） |
| `GET /api/palace/stocks/{code}` | 该票跨群汇总：哪些大V讨论过、各自操作与多空 |

- 全部为只读 GET，沿用现有响应约定与 `jsonio` 读盘方式。
- **不新增写接口**；重建（`build_palace.py`）由 cron 在服务端跑，不经 API 触发。

## 9. 前端页面与交互

三块界面：`/kols` 列表、`/kol/:chatId` 详情、`/stock/:code` 追加区块。布局沿用现有看板的卡片/表格语言，交互契约见 9.5，状态覆盖见 9.6。

### 9.1 `/kols` 大V列表

卡片墙，响应式 4 列 / 窄屏 2 列。每张卡：序号、群名、风格标签、多空倾向条（绿多 / 红空）、倾向文案（`偏多 80%` + `多 1200 · 空 300`）、常聊板块 chips、脚注（`87 只票 / 2345 观点 / 09-10`）。

- **排序**：活跃度 / 观点数 / 股票数，默认活跃度。
- **搜索**：按群号或群名过滤。
- **筛选条**：顶部显示数据新鲜度，如 `数据 06-05 → 09-10 · 缺 07-10~07-24`（取自 `/api/palace/meta`）。

### 9.2 `/kol/:chatId` 大V详情

- **顶部风格画像条**，四块并排：多空倾向（条 + 比值 + 多空计数）、操作风格（标签 + 词频计数）、覆盖广度（股票数 + 集中度）、活跃度（活跃天数 + 观点数 + 盘中/盘外占比）。
- **主体为左右分栏**：左侧股票表 5 列（股票 / 提及 / 多空 / 最近操作 / 最近），表头可排序（提及次数 / 多空 / 最近）；右侧为选中股票的观点时间线（时间倒序，含原文，标出多空与操作标签）。
- 选中左侧任意一行 → 右侧时间线切换，URL 变为 `/kol/:chatId/:code`。

### 9.3 `/stock/:code` 扩展

在现有 `StockDetail.tsx` 底部增加「大V观点」区块：表头为 大V/群 · 提及 · 多空 · 最近操作 · 最近，可排序；点行选中该大V，URL 变为 `/stock/:code?from=:chatId`，下方展示该大V对该票的观点（复用 `GET /api/palace/kols/{chat_id}/stocks/{code}`）。

**这是本期唯一改动的现有页面**，改动限定为「底部新增一个区块」，不动既有逻辑与布局。

### 9.4 导航

`Navbar` 新增「大V」入口指向 `/kols`。`App.tsx` 新增三条路由（`/kols`、`/kol/:chatId`、`/kol/:chatId/:code`，后两条复用同一个 `KolDetail` 组件），沿用现有 `Suspense` + 懒加载写法。

### 9.5 交互契约（跨页生效）

1. **控件语义**：所有可点控件用 `<button>` / `<a>`，不用带 onclick 的 `div`/`span`。排序按钮用 `aria-pressed`，表头排序用 `aria-sort`，列表/表格的选中项用 `aria-current`，且选中态有可见样式（左侧强调条），不只在 hover 时出现。
2. **深链**：选中态写进 URL（`/kols`、`/kol/:chatId/:code`、`/stock/:code?from=:chatId`），刷新与分享可还原，浏览器前进/后退可用。
3. **输入标签**：搜索框必须有 `<label>`，不用 placeholder 顶替标签。
4. **状态不只用颜色**：多空同时给出 `+8 / -2` 数字与文字标签；数字用 `tabular-nums` 等宽对齐。
5. **键盘**：Tab 可达全部控件并保留全局 `:focus-visible` 焦点环；卡片墙支持 ←/→ 在卡片间移动。
6. **动效克制**：只保留入场淡入与 URL 变化闪烁两处；尊重 `prefers-reduced-motion`；**状态正确性不依赖 `animationend`**（列表渲染由数据驱动，不靠动画回调改状态）。
7. **对比度**：正文与次级文字均 ≥4.5:1。次级文字色用 `#90909A`（`#1D1D22` 底上 5.3:1），不用 `#71717A`（仅 3.5:1）。
8. **窄屏**：≤1000px 时表格去掉「多空」「最近」两列，**不做横向滚动**；卡片墙降为 2 列。

### 9.6 状态覆盖

以下四种状态在真实数据里必然出现，实现时必须覆盖（现有 `day_*.json` 数据本就缺 07-10~07-24）：

- **加载中**：骨架屏占位 + `role="status"` 播报，不用转圈图标。
- **搜索无结果**：说明原因（当前只匹配群号与群名、不搜观点正文）+ 给出替代出口（推荐几只热门票）。
- **数据缺失 / 断更**：近 30 天无消息的群渲染为降级卡片（斜纹底 + 明确写出原因），排序时沉底，不可点入。
- **覆盖空洞**：`/api/palace/meta` 的 `missing_days` 在列表页顶部如实显示。

## 10. 更新机制

- `scripts/palace_daily.sh` 由云端 crontab 每个交易日 16:10 调用，跑 `scripts/build_palace.py` 重建索引。档案由实时采集（每 5 分钟）持续追加，所以这里不需要回补。
- 每次运行都重读全部档案并逐群覆写 `opinions/`，主要成本在 `analyze_text`；档案层是唯一真相源，删掉 `data/palace/` 重跑结果一致（§4.2）。
- 前端不做实时刷新，页面加载时取一次；`/api/palace/meta` 的 `generated_at` 用于显示数据新鲜度。

## 11. 测试

- **pytest · backfill**：以 mock 的 lark-cli 输出为输入，验证 id 去重、断点续传、`--since/--until` 过滤、单群失败不影响其他群。
- **pytest · 抽取**：给定档案行 → 期望观点行，覆盖「一消息多票」「无股票链接」「板块就近归因」等分支。
- **pytest · 画像**：给定构造的观点集合 → 期望 `bias` / `trading` / `breadth` / `top_sectors` / `session` 指标。
- **pytest · 聚合与 API**：`PalaceStore` 各方法返回值；`/api/palace/*` 端点状态码与结构；缺失群/缺失日期时返回降级结果而非 500。
- **vitest**：如需前端纯函数（如卡片排序）可加，本期不强制。
- **浏览器手动验证**：`/kols` 列表与排序、`/kol/:chatId` 画像与时间线、`/stock/:code` 新区块、空数据与缺失日期提示、窄屏。
- `python3 -m pytest`（本机无 `python` 命令）、`npm run build` + 类型检查。

## 12. 风险与已知限制

- **回补可行性未验证**：`lark-cli` 在云端，本地不可测。`+chat-messages-list` 能否翻到 ~2 个月前、飞书是否有留存上限，**必须在实施第一步用单群验证**。若翻不到，档案起点即为实际能翻到的最早日期，需在 `coverage` 中如实标注。
- **07-10 → 07-24 空洞**：靠回补填补；补不上则长期缺失，由 `/api/palace/meta` 暴露。
- **档案体量存在下界**：`total_messages`（实测约 1000–1200/天，25 群合计）是当天**全部**消息的计数、未按股票过滤，但它受实时采集 `max_pages=3`（每群每次最多 150 条）限制，只是**下界**；回补能翻得更全。第一步须实测单群体量，据此决定是否需要按月分片。若按下界估算，两个月约 6–8 万条、数十 MB 量级。
- **群 = 大V 的归因粒度**：聊天群中群友的发言会被计入该大V的观点。这是用户明确选择的取舍；`sender` 已存档，将来若需下钻到具体发言人无需重新采集。
- **无发送者时的历史数据**：本设计不消费旧 `day_*.json`（其 `group_details` 无 sender、只覆盖 Top10），档案库从回补重新建立，二者互不影响。
- **抽取精度**：沿用现有词库与就近归因，误报/漏报与看板现有口径一致，不是本期新引入的问题。
- **风格标签是统计特征**：`trading` 等标签来自词频，不代表投资建议或业绩评价。

## 13. 兼容性 / 回滚

- 纯新增：档案目录、`palace` 模块、脚本、两个页面、一组只读 API。
- 对现有系统的改动仅三处，且都是追加式：`collector` 顺带写档案、`server` 挂新路由、`StockDetail` 加区块、`App`/`Navbar` 加路由与入口。
- 回滚：删除 `/kols`、`/kol/:chatId` 路由与导航入口，移除 `StockDetail` 新区块，卸载 palace 路由即可；档案与 `data/palace/` 是孤立数据，留着无害。

## 14. 实施顺序

1. **验证回补**（阻塞项）：云端跑单群 `backfill`，确认能翻到 ~2 个月前并实测体量；据结果确定 `--since` 与是否需要分片。
2. **档案层**：`scripts/backfill.py` + collector 顺带 append + 去重/断点/状态文件。
3. **抽取与索引**：`scripts/build_palace.py` 产出 `opinions/`、`kols.json`、`stock_index.json`。
4. **聚合层**：`backend/palace.py` + 5 个 API 端点 + 测试。
5. **前端**：`/kols`、`/kol/:chatId`、`StockDetail` 新区块、导航与路由。
6. **接入调度**：把 `build_palace.py` 接进采集后流程。
