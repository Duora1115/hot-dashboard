# 全站走查问题修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修掉 2026-09-12 全站走查发现的 22 项问题——8 项数据口径错误、5 项前端逻辑错误、5 项展示/清洗问题、4 项文案与可达性问题。

**Architecture:** 先在**后端**把口径算对（`backend/report.py` 抽出纯函数 `compute_volume_data`，新增 `backend/textclean.py`、`data_store.group_activity`、`/api/day/{date}/group-activity`）；再把**前端可测的纯逻辑**下沉到 `src/lib/` 的新模块（`actions.ts`、`sentiment.ts`、`messageText.ts`、`dataState.ts`），页面只做接线；最后收文案、可达性与移动端。凡是能写成纯函数的都不留在组件里——`vitest.config.ts` 只收 `src/**/*.test.ts` 且 `environment: 'node'`，组件测不了。

**Tech Stack:** Python 3 / FastAPI / pytest / PyYAML / React 19 + TypeScript + Vite + vitest / recharts / framer-motion

**Spec:** `docs/superpowers/specs/2026-09-12-site-audit-fixes-design.md`

## Global Constraints

- 后端测试命令：`python3 -m pytest tests/ -v`（本仓库**没有** `python` 命令）。前端测试命令：`npm test`。类型检查：`npm run build`（含 `tsc -b`）。
- 前端单测只写 `src/**/*.test.ts`，**不引入** jsdom / testing-library / 组件测试。
- **不回填存量数据**：`data/day_*.json` 与 palace 库不动，F15 的文本清洗只发生在展示层与晨报生成时。
- **不改**热度公式、归因算法、`config/settings.yaml` 词库。
- **不接新的外部行情源**：拿不到真实数据就诚实留白（`null` + 前端空状态），不许用估算值冒充。
- 后端测试文件统一用这个头部（照抄，别改）：
  ```python
  import sys
  from pathlib import Path
  sys.path.insert(0, str(Path(__file__).parent.parent))
  ```
- 前端 import 用 `@/` 别名（指向 `src/`）。
- 涉及同步改动的两处：`src/types/api.ts` 与 `src/pages/Report.tsx:48-55` 的 `EMPTY_REPORT` 默认对象必须跟着改，否则 `tsc -b` 会挂。

---

### Task 1: 晨报量能口径（F2 / F3 / F4）

**Files:**
- Modify: `backend/report.py`（抽出 `compute_volume_data`，`generate_report` 增加 `prev_message_count` 入参）
- Modify: `backend/server.py:660-690`（`api_report` 查前一天的消息数并传入）
- Modify: `src/pages/Report.tsx:48-49, 505-524`（`changePercent` 可为 `null`）
- Modify: `src/types/api.ts`（`ReportData.volumeData`）
- Test: `tests/test_report_volume.py`（新建）

**Interfaces:**
- Consumes: 无
- Produces:
  - `backend.report.compute_volume_data(snapshots: list[dict], message_count: int, prev_message_count: int | None) -> dict`，返回 `{"totalVolume": int, "prevVolume": int | None, "changePercent": float | None, "hourlyData": list[{"time": str, "volume": int}], "peakHour": str, "peakVolume": int, "summary": str}`
  - `backend.report.generate_report(date_str, day_data, advance_decline=None, raw_snapshots=None, prev_message_count=None, active_group_count=None) -> dict`
  - `backend.server` 模块级函数 `_prev_message_count(date_str: str) -> int | None`

- [ ] **Step 1: 写失败的测试**

新建 `tests/test_report_volume.py`：

```python
"""晨报量能口径：totalVolume 用当日总数，hourlyData 用逐快照增量。"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.report import compute_volume_data


def _snap(t, msg):
    return {"t": t, "msg": msg}


# msg 是「当日累计值」，不是该快照新增量——这是全部 bug 的根源。
SNAPS = [_snap("2026-09-10 09:30", 100), _snap("2026-09-10 09:35", 160),
         _snap("2026-09-10 10:00", 300), _snap("2026-09-10 10:05", 300)]


def test_total_uses_message_count_not_sum_of_cumulative():
    r = compute_volume_data(SNAPS, message_count=1187, prev_message_count=None)
    assert r["totalVolume"] == 1187, "不能是对累计值求和（那会得到 860）"


def test_hourly_is_per_snapshot_delta():
    r = compute_volume_data(SNAPS, message_count=1187, prev_message_count=None)
    assert r["hourlyData"] == [{"time": "09:00", "volume": 160}, {"time": "10:00", "volume": 140}]


def test_peak_hour_comes_from_deltas():
    r = compute_volume_data(SNAPS, message_count=1187, prev_message_count=None)
    assert r["peakHour"] == "09:00"
    assert r["peakVolume"] == 160


def test_change_percent_is_none_without_previous_day():
    r = compute_volume_data(SNAPS, message_count=1187, prev_message_count=None)
    assert r["prevVolume"] is None
    assert r["changePercent"] is None, "拿不到昨日就返回 None，不要假装是 +0.0%"


def test_change_percent_uses_previous_day_total():
    r = compute_volume_data(SNAPS, message_count=1100, prev_message_count=1000)
    assert r["changePercent"] == 10.0


def test_negative_delta_falls_back_to_cumulative():
    """跨天重置／脏数据：累计值变小说明换了计数起点，按当前累计值兜底。"""
    r = compute_volume_data([_snap("2026-09-10 00:25", 5), _snap("2026-09-10 00:30", 2)],
                            message_count=2, prev_message_count=None)
    assert r["hourlyData"] == [{"time": "00:00", "volume": 7}]
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python3 -m pytest tests/test_report_volume.py -v`
Expected: FAIL — `ImportError: cannot import name 'compute_volume_data' from 'backend.report'`

- [ ] **Step 3: 实现 `compute_volume_data` 并接到 `generate_report`**

在 `backend/report.py` 里，替换原来的 `# --- volumeData ---` 段（现为第 334-355 行附近）：

```python
def compute_volume_data(snapshots: list[dict], message_count: int,
                        prev_message_count: int | None = None) -> dict:
    """当日消息量口径。

    ``snap["msg"]`` 是**当日累计值**（最后一个快照 = 全天总数），所以：
    - 总量直接取 ``meta.message_count``，不能对快照求和（求和会得到 60 倍虚高值）；
    - 分时按**相邻快照增量**累计，否则曲线的形状只反映「那个小时采了几次」。
    """
    hourly: dict[str, int] = {}
    prev = 0
    for snap in snapshots:
        t = snap.get("t", "")
        hour = t.split(" ")[1][:2] + ":00" if " " in t else "00:00"
        cur = int(snap.get("msg", 0) or 0)
        delta = cur - prev
        if delta < 0:          # 跨天重置 / 脏数据，按当前累计值兜底
            delta = cur
        prev = cur
        hourly[hour] = hourly.get(hour, 0) + delta

    hourly_data = [{"time": k, "volume": v} for k, v in sorted(hourly.items())]
    peak = max(hourly_data, key=lambda x: x["volume"]) if hourly_data else {"time": "-", "volume": 0}
    change = None
    if prev_message_count:
        change = round((message_count - prev_message_count) / prev_message_count * 100, 1)
    summary = (f"今日消息总量{message_count:,}条，高峰时段{peak['time']}（{peak['volume']:,}条/小时）。"
               if message_count else "今日暂无消息数据。")
    return {
        "totalVolume": int(message_count),
        "prevVolume": prev_message_count,
        "changePercent": change,
        "hourlyData": hourly_data,
        "peakHour": peak["time"],
        "peakVolume": peak["volume"],
        "summary": summary,
    }
```

然后在 `generate_report` 里把原来那段 `hourly: dict[str, int] = {}` … `volume_data = {...}` 整段删掉，换成一行：

```python
    volume_data = compute_volume_data(snapshots, meta.get("message_count", 0), prev_message_count)
```

函数签名从

```python
def generate_report(date_str: str, day_data: dict, market_indices: list[dict] | None = None,
                    advance_decline: dict | None = None,
                    raw_snapshots: list[dict] | None = None) -> dict:
```

改为（`market_indices` 的删除在 Task 3，这里先加两个新参数）：

```python
def generate_report(date_str: str, day_data: dict, market_indices: list[dict] | None = None,
                    advance_decline: dict | None = None,
                    raw_snapshots: list[dict] | None = None,
                    prev_message_count: int | None = None,
                    active_group_count: int | None = None) -> dict:
```

在 `backend/server.py` 里新增模块级函数（放在 `api_report` 上方）：

```python
def _prev_message_count(date_str: str) -> int | None:
    """上一个「有消息」的日期的消息总数，用于晨报的「较昨日」。"""
    for d in store.get_dates_info():          # 已按日期倒序
        if d["date"] >= date_str:
            continue
        day = store.get_day(d["date"])
        if day and day.get("meta", {}).get("message_count"):
            return day["meta"]["message_count"]
    return None
```

并在 `api_report` 里把调用改成（`cfg` 是 `server.py:41` 的模块级全局，`api_status` 就是这么用的）：

```python
    result = generate_report(date_str, day_data, adv_dec,
                             raw_snapshots=raw_snaps,
                             prev_message_count=_prev_message_count(date_str),
                             active_group_count=len(cfg.get("groups", [])))
```

同时把 `_empty_report`（`backend/report.py:506`）里的 `volumeData` 改成新口径：

```python
        "volumeData": {"totalVolume": 0, "prevVolume": None, "changePercent": None,
                       "hourlyData": [], "peakHour": "-", "peakVolume": 0, "summary": "暂无数据"},
```

- [ ] **Step 4: 跑测试确认通过**

Run: `python3 -m pytest tests/test_report_volume.py -v`
Expected: 6 passed

- [ ] **Step 5: 前端适配 `changePercent` 可为 null**

`src/types/api.ts` 里 `ReportData.volumeData` 改成：

```ts
  volumeData: {
    totalVolume: number;
    prevVolume: number | null;
    changePercent: number | null;
    hourlyData: Array<{ time: string; volume: number }>;
    peakHour: string;
    peakVolume: number;
    summary: string;
  };
```

`src/pages/Report.tsx:49` 的默认值同步改为 `prevVolume: null, changePercent: null`。

把 `src/pages/Report.tsx:505-524` 那块「vs 昨日」整段替换为：

```tsx
            <div className="flex items-center gap-1 mt-2">
              {data.volumeData.changePercent === null ? (
                <span className="text-xs text-ink-tertiary">较昨日暂无数据</span>
              ) : (
                <>
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
                </>
              )}
            </div>
```

- [ ] **Step 6: 跑全量测试与类型检查**

Run: `python3 -m pytest tests/ -v && npm run build`
Expected: 全绿；`tsc -b` 无报错

- [ ] **Step 7: 提交**

```bash
git add backend/report.py backend/server.py backend/data_store.py src/pages/Report.tsx src/types/api.ts tests/test_report_volume.py
git commit -m "fix(report): 量能口径改用当日总数与逐快照增量"
```

---

### Task 2: 晨报活跃群改用真实值（F5）

**Files:**
- Modify: `backend/report.py`（`activeGroups` 字段）
- Modify: `src/pages/Report.tsx:1085`
- Modify: `src/types/api.ts`
- Test: `tests/test_report_volume.py`（追加）

**Interfaces:**
- Consumes: Task 1 的 `generate_report(..., active_group_count=None)`
- Produces: `ReportData.activeGroups: { active: number; total: number }`

- [ ] **Step 1: 写失败的测试**

追加到 `tests/test_report_volume.py`：

```python
from backend.report import _active_groups


def test_active_groups_uses_last_snapshot_and_configured_total():
    snaps = [{"t": "2026-09-10 00:25", "msg": 3, "grp": 1},
             {"t": "2026-09-10 23:55", "msg": 1187, "grp": 24}]
    assert _active_groups(snaps, total=25) == {"active": 24, "total": 25}


def test_active_groups_falls_back_to_zero():
    assert _active_groups([], total=25) == {"active": 0, "total": 25}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python3 -m pytest tests/test_report_volume.py -v`
Expected: FAIL — `ImportError: cannot import name '_active_groups'`

- [ ] **Step 3: 实现并在返回体里加上**

`backend/report.py` 加：

```python
def _active_groups(snapshots: list[dict], total: int | None) -> dict:
    """当日活跃群 / 接入群总数。前端原来把 "23/25" 写死在 Report.tsx 里。"""
    active = int(snapshots[-1].get("grp", 0)) if snapshots else 0
    return {"active": active, "total": int(total or 0)}
```

`generate_report` 的返回字典里加一行：

```python
        "activeGroups": _active_groups(snapshots, active_group_count),
```

`_empty_report(date_str)`（`backend/report.py:506`）也要补上 `"activeGroups": {"active": 0, "total": 0},`。

`src/types/api.ts` 的 `ReportData` 加：

```ts
  activeGroups: { active: number; total: number };
```

`src/pages/Report.tsx` 的 `EMPTY_REPORT`（第 48 行附近）加 `activeGroups: { active: 0, total: 0 },`。

- [ ] **Step 4: 跑测试确认通过**

Run: `python3 -m pytest tests/test_report_volume.py -v`
Expected: 8 passed

- [ ] **Step 5: 前端消费真实值**

`src/pages/Report.tsx:1085`：

```tsx
        <HeaderMetric label="活跃群" value={`${data.activeGroups.active}/${data.activeGroups.total}`} accent="#BF5AF2" />
```

- [ ] **Step 6: 跑类型检查**

Run: `npm run build`
Expected: 通过

- [ ] **Step 7: 提交**

```bash
git add backend/report.py src/pages/Report.tsx src/types/api.ts tests/test_report_volume.py
git commit -m "fix(report): 活跃群用当日真实值，去掉写死的 23/25"
```

---

### Task 3: 涨跌家数不再冒充真实行情（F6 / F7 / F22）

**Files:**
- Modify: `backend/report.py`（删估算分支、删 `marketIndices`、删 `_fallback_technical` 无关部分不动）
- Modify: `backend/server.py:660-690`（不再 `fetch_indices()`）
- Modify: `src/pages/Report.tsx:394-432`（删「指数分时走势」整块）、`:450-495`（涨跌家数空状态）
- Modify: `src/types/api.ts`
- Test: `tests/test_report_volume.py`（追加）

**Interfaces:**
- Consumes: Task 1、Task 2 的 `generate_report`
- Produces:
  - `generate_report` 签名里**移除** `market_indices`；返回体**移除** `marketIndices`
  - `advanceDecline: AdvanceDecline | null`，拿不到真实源时为 `null`
  - 新函数 `_advance_decline_or_none(advance_decline: dict | None) -> dict | None`

- [ ] **Step 1: 写失败的测试**

追加到 `tests/test_report_volume.py`：

```python
from backend.report import _advance_decline_or_none


def test_no_estimate_when_source_missing():
    """旧实现会拿「看多条数 × 30」编一个涨跌家数出来——那会和指数 −1.18% 打架。"""
    assert _advance_decline_or_none(None) is None


def test_real_source_passes_through():
    real = {"rising": 1200, "falling": 420, "unchanged": 3480,
            "limitUp": 13, "limitDown": 2, "risingPercent": 74.1}
    assert _advance_decline_or_none(real) == real
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python3 -m pytest tests/test_report_volume.py -v`
Expected: FAIL — `ImportError: cannot import name '_advance_decline_or_none'`

- [ ] **Step 3: 后端删估算与死指数**

`backend/report.py` 里把 `# --- advanceDecline ---` 那整段（`if advance_decline: ... else: ... 估算 ...`）替换为：

```python
def _advance_decline_or_none(advance_decline: dict | None) -> dict | None:
    """真实源拿不到就返回 None。

    旧实现在这里用「看多条数 × 30 / 看空条数 × 30」编一组涨跌家数，结果 2026-09-11
    页面显示「93.8% 上涨」，而同一页的大盘指数是 −1.18%。编造的市场宽度比留白有害。
    """
    return advance_decline or None
```

调用处改为：

```python
    ad = _advance_decline_or_none(advance_decline)
```

删除 `market_indices = market_indices or []` 与返回体里的 `"marketIndices": market_indices,`，并从签名里去掉 `market_indices` 参数。`_empty_report`（`backend/report.py:506`）里的 `"marketIndices": []` 一并删掉。

`backend/server.py` 的 `api_report`：删掉 `market_idx = []`、`ThreadPoolExecutor` 里 `executor.submit(fetch_indices)` 那一支（保留 `fetch_advance_decline`），调用改为：

```python
    result = generate_report(date_str, day_data, adv_dec,
                             raw_snapshots=raw_snaps,
                             prev_message_count=_prev_message_count(date_str),
                             active_group_count=store.group_count())
```

> `fetch_indices` 的 import 保留——`/api/market/indices` 端点还在用它。

- [ ] **Step 4: 跑测试确认通过**

Run: `python3 -m pytest tests/ -v`
Expected: 全绿（含 `test_report_volume.py` 的 10 个）

- [ ] **Step 5: 前端删重复图 + 涨跌家数空状态**

`src/types/api.ts` 的 `ReportData` 删掉 `marketIndices: MarketIndex[];`（若 `MarketIndex` 类型别处还在用就保留类型本身）。

`src/pages/Report.tsx`：

1. 删掉 `{/* SECTION 2 */}` 里 `<div className="grid grid-cols-1 lg:grid-cols-3 ...">` 内**第二个** `<motion.div>`——即以 `<h3 ...>指数分时走势</h3>` 开头的整块（原第 407-431 行）。它画的是 `data.volumeData.hourlyData`，与「量能分析」里的图同源，标题名不副实。删完后网格只剩情绪仪表，把外层 `grid-cols-1 lg:grid-cols-3` 改成 `grid-cols-1`。
2. 第 454 行的 `{data.advanceDecline && <>` 分支补 else：

```tsx
        {data.advanceDecline ? (
          <>
            {/* …原有的 StatCard + 涨跌分布条，保持不动… */}
          </>
        ) : (
          <p className="text-sm text-ink-tertiary py-6 text-center">
            涨跌家数暂不可用（数据源未返回）
          </p>
        )}
```

3. `EMPTY_REPORT` 里删掉 `marketIndices: [],`。

- [ ] **Step 6: 跑类型检查与测试**

Run: `npm run build && python3 -m pytest tests/ -v`
Expected: 通过

- [ ] **Step 7: 提交**

```bash
git add backend/report.py backend/server.py src/pages/Report.tsx src/types/api.ts tests/test_report_volume.py
git commit -m "fix(report): 涨跌家数不再用聊天情绪估算，删掉未渲染的指数死数据与重复图"
```

---

### Task 4: 后端文本清洗模块（F14 / F15 后端半边）

**Files:**
- Create: `backend/textclean.py`
- Modify: `backend/report.py:271-278`（新闻 title/summary）
- Test: `tests/test_textclean.py`（新建）

**Interfaces:**
- Consumes: 无
- Produces: `backend.textclean.clean_message_text(text: str) -> str`、`backend.textclean.news_title_summary(text: str) -> tuple[str, str]`

- [ ] **Step 1: 写失败的测试**

新建 `tests/test_textclean.py`：

```python
"""消息正文清洗：采集元数据前缀 + markdown 残留。用例取自线上真实数据。"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.textclean import clean_message_text, news_title_summary


def test_folds_complete_markdown_link():
    assert clean_message_text("看[中百](https://wap.eastmoney.com/quote/stock/1.600857.html)封死") \
        == "看中百封死"


def test_folds_image_to_placeholder():
    assert clean_message_text("图![Image](img_v3_abc)完了") == "图[图片]完了"


def test_strips_feishu_edit_header():
    raw = "2026-08-06 18:24:42 [编辑]\n \n缺成这雕样了。\n"
    assert clean_message_text(raw) == "缺成这雕样了。"


def test_strips_lecturer_timestamp_prefix():
    raw = "【讲师】 胖大叔 2026 09 10 23:50:19 2026年9月10日周四复盘 今日兑现了亚盛集团"
    assert clean_message_text(raw).startswith("2026年9月10日周四复盘")


def test_strips_markdown_heading_marker():
    assert clean_message_text("### 橙子不糊涂的科技花园") == "橙子不糊涂的科技花园"


def test_strips_truncated_link_keeps_visible_text():
    """截断的链接（没有右括号）也要折掉，只留显示文字。"""
    assert clean_message_text("看[中百](https://wap.eastmoney.com/quote") == "看中百"


def test_truncated_link_whose_text_is_a_url_is_dropped():
    """显示文字本身就是 URL 时整段丢 —— 留着就是一串没用的地址。"""
    assert clean_message_text("### 橙子不糊涂的科技花园[https://wap.eastmoney.") \
        == "橙子不糊涂的科技花园"


def test_keeps_plain_text_untouched():
    assert clean_message_text("中百这个拉板的话新华还有救") == "中百这个拉板的话新华还有救"


def test_news_title_is_first_line_and_summary_is_the_rest():
    text = "累死了，每个馆都至少足球场那么大\n白天全靠东鹏特饮续命，晚上补了一顿牛肉火锅。"
    title, summary = news_title_summary(text)
    assert title == "累死了，每个馆都至少足球场那么大"
    assert summary.startswith("白天全靠东鹏特饮")
    assert not summary.startswith(title), "摘要不能以标题开头（原来 title=text[:40] summary=text[:80]）"


def test_news_single_line_gives_empty_summary():
    title, summary = news_title_summary("一句话消息")
    assert title == "一句话消息"
    assert summary == ""
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python3 -m pytest tests/test_textclean.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'backend.textclean'`

- [ ] **Step 3: 实现 `backend/textclean.py`**

```python
"""群消息正文的展示层清洗。

群里的票几乎都写成 `[旭创](https://wap.eastmoney.com/quote/stock/0.300308.html)`，
一条链接六十多字符；飞书的转发/编辑还会在正文头上塞时间戳与「[编辑]」标记。
这些都不是用户想读的内容。

**只用于展示与晨报生成，不改存量落盘数据。**

规则要与前端 `src/lib/messageText.ts` 保持一致，两边各有一份测试，用例同表。
"""
import re

# `![Image](url)` 必须在普通链接之前处理：它内部含 `[Image](url)`。
_IMAGE_RE = re.compile(r"!\[[^\]]*\]\([^)]*\)")
_LINK_RE = re.compile(r"\[([^\]]+)\]\([^)]*\)")
# 飞书编辑标记：`2026-08-06 18:24:42 [编辑]` 单独成行。
_EDIT_HEADER_RE = re.compile(r"^\s*\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?\s*(?:\[编辑\])?\s*$", re.MULTILINE)
# `【讲师】 胖大叔 2026 09 10 23:50:19` 形态的前缀。
_LECTURER_RE = re.compile(r"^\s*【[^】]{1,6}】\s*\S{0,20}?\s*\d{4}\s+\d{2}\s+\d{2}\s+\d{2}:\d{2}:\d{2}\s*")
_HEADING_RE = re.compile(r"^\s*#{1,6}\s+", re.MULTILINE)
# `[中百](https://…` 截断：有方括号、有左圆括号，但到行尾都没有右圆括号。
_TRUNCATED_MD_LINK = re.compile(r"\[([^\]]+)\]\([^)]*$", re.MULTILINE)
# `[https://…` 连右方括号都没有（发帖端把链接截断了）——整段丢，留着也是一串地址。
_TRUNCATED_BARE_URL = re.compile(r"\[https?://[^\]\s]{0,200}$", re.MULTILINE | re.IGNORECASE)


def clean_message_text(text: str) -> str:
    """折叠链接、剥掉采集元数据与 markdown 记号，返回可直读的正文。

    **顺序有讲究**：两条截断链接规则必须排在最后。`[编辑]` 这种方括号记号会被
    「截断链接」误吃掉，先剥元数据行才能保住识别；反过来写就会把
    `2026-08-06 18:24:42 [编辑]` 变成 `2026-08-06 18:24:42 编辑`。
    """
    if not text:
        return ""
    out = _IMAGE_RE.sub("[图片]", text)
    out = _LINK_RE.sub(r"\1", out)
    out = _EDIT_HEADER_RE.sub("", out)
    out = _LECTURER_RE.sub("", out)
    out = _HEADING_RE.sub("", out)
    out = _TRUNCATED_MD_LINK.sub(r"\1", out)
    out = _TRUNCATED_BARE_URL.sub("", out)
    # 行内空白折叠、去掉因此产生的空行
    out = re.sub(r"[ \t　]+", " ", out)
    out = re.sub(r"\n\s*\n+", "\n", out)
    return out.strip()


def news_title_summary(text: str, title_limit: int = 40, summary_limit: int = 120) -> tuple[str, str]:
    """晨报卡片：标题取正文第一行，摘要取其余部分（不再让摘要以标题开头）。"""
    cleaned = clean_message_text(text)
    if not cleaned:
        return "", ""
    lines = [ln.strip() for ln in cleaned.split("\n") if ln.strip()]
    title = lines[0][:title_limit]
    rest = " ".join(lines[1:]).strip()
    return title, rest[:summary_limit]
```

- [ ] **Step 4: 跑测试确认通过**

Run: `python3 -m pytest tests/test_textclean.py -v`
Expected: 9 passed

- [ ] **Step 5: 接到晨报新闻抽取**

`backend/report.py` 顶部加 `from backend.textclean import news_title_summary`，把 `_extract_news_from_raw` 里的

```python
                    news.append({
                        "id": f"n{len(news)+1}",
                        "category": category,
                        "title": text[:40],
                        "summary": text[:80],
```

改为：

```python
                    title, summary = news_title_summary(text)
                    if not title:
                        continue
                    news.append({
                        "id": f"n{len(news)+1}",
                        "category": category,
                        "title": title,
                        "summary": summary,
```

- [ ] **Step 6: 跑全量后端测试**

Run: `python3 -m pytest tests/ -v`
Expected: 全绿

- [ ] **Step 7: 提交**

```bash
git add backend/textclean.py backend/report.py tests/test_textclean.py
git commit -m "fix(report): 消息卡片标题摘要不再重复，正文清洗元数据与残缺 markdown"
```

---

### Task 5: 群活跃度热力图数据源（F8 后端）

**Files:**
- Modify: `backend/data_store.py`（新增 `group_activity`）
- Modify: `backend/server.py`（新增端点）
- Test: `tests/test_group_activity.py`（新建）

**Interfaces:**
- Consumes: 无
- Produces:
  - `backend.data_store.DataStore.group_activity(date_str: str) -> dict`
  - `GET /api/day/{date_str}/group-activity` → `{"date": str, "groups": list[str], "slots": list[str], "cells": list[list[int]], "sentiment": dict[str, str]}`

- [ ] **Step 1: 写失败的测试**

新建 `tests/test_group_activity.py`（沿用 `tests/test_sector_messages.py` 的 fixture 写法）：

```python
"""/api/day/{date}/group-activity：从原始快照聚合「群 × 时间槽」消息数。

/api/day 的压缩快照把 sec[].gd 整段剥掉了（占体积九成以上），情绪页的
「群活跃度热力图」因此永远显示「暂无群消息数据」。这个端点回一个小体积计数矩阵。
"""
import json
import sys
import tempfile
from pathlib import Path

import pytest
from starlette.testclient import TestClient

sys.path.insert(0, str(Path(__file__).parent.parent))

from backend import server
from backend.data_store import DataStore

DATE = "2026-07-06"


def _sector(name, group_details):
    return {"name": name, "score": 100, "mention_count": 0, "group_count": len(group_details),
            "groups": [g["group"] for g in group_details], "group_details": group_details,
            "sample_text": ""}


def _group(name, count):
    return {"group": name, "count": count,
            "messages": [{"time": f"{DATE} 09:30", "text": "x"}] }


def _snap(t, sectors, sentiment):
    return {"time": t, "total_messages": 5, "active_groups": 2,
            "overall_sentiment": sentiment, "sentiment_detail": {}, "action_summary": {},
            "top10_stocks": [], "top8_sectors": sectors}


@pytest.fixture
def client():
    tmp = Path(tempfile.mkdtemp(prefix="hotdash-group-act-"))
    day = {
        "date": DATE,
        "total_msgs": 10,
        "snapshots": [
            _snap(f"{DATE} 09:30", [_sector("半导体", [_group("群A", 3)])], "偏多"),
            _snap(f"{DATE} 09:35", [_sector("半导体", [_group("群A", 5), _group("群B", 2)])], "偏空"),
        ],
    }
    (tmp / f"day_{DATE}.json").write_text(json.dumps(day, ensure_ascii=False), encoding="utf-8")
    server.data_dir = tmp
    server.store = DataStore(tmp)
    server.store.startup()
    with TestClient(server.app) as c:
        yield c


def test_groups_slots_and_cells(client):
    r = client.get(f"/api/day/{DATE}/group-activity")
    assert r.status_code == 200
    body = r.json()
    assert body["groups"] == ["群A", "群B"]
    assert body["slots"] == ["09:30", "09:35"]
    # rows 与 groups 同序，cols 与 slots 同序
    assert body["cells"] == [[3, 5], [0, 2]]


def test_sentiment_per_group_uses_latest_snapshot(client):
    body = client.get(f"/api/day/{DATE}/group-activity").json()
    assert body["sentiment"] == {"群A": "偏空", "群B": "偏空"}


def test_unknown_date_returns_empty_shape(client):
    body = client.get("/api/day/2020-01-01/group-activity").json()
    assert body["groups"] == [] and body["slots"] == []
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python3 -m pytest tests/test_group_activity.py -v`
Expected: FAIL — 404（端点不存在）

- [ ] **Step 3: 实现 `DataStore.group_activity`**

在 `backend/data_store.py` 里 `get_raw_snapshots` 附近加：

```python
    def group_activity(self, date_str: str) -> dict:
        """「群 × 时间槽」消息计数矩阵，供情绪页热力图使用。

        gd 在压缩快照里被剥掉了，这里回原始快照现算。只回计数，不回消息原文。
        """
        snaps = self.get_raw_snapshots(date_str)
        groups: list[str] = []
        slots: list[str] = []
        seen_group: set[str] = set()
        counts: dict[tuple[str, str], int] = {}
        sentiment: dict[str, str] = {}

        for snap in snaps:
            t = snap.get("time", "")
            slot = t.split(" ", 1)[1] if " " in t else t
            if slot and slot not in slots:
                slots.append(slot)
            sent = snap.get("overall_sentiment", "")
            for sec in snap.get("top8_sectors", []):
                for gd in sec.get("group_details", []):
                    name = gd.get("group", "")
                    if not name:
                        continue
                    if name not in seen_group:
                        seen_group.add(name)
                        groups.append(name)
                    # 同一快照里同一群可能出现在多个板块，取最大值而不是累加：
                    # 累加会把「板块数」混进「消息数」。
                    key = (name, slot)
                    counts[key] = max(counts.get(key, 0), int(gd.get("count", 0)))
                    if sent:
                        sentiment[name] = sent

        groups.sort()
        cells = [[counts.get((g, s), 0) for s in slots] for g in groups]
        return {"date": date_str, "groups": groups, "slots": slots,
                "cells": cells, "sentiment": sentiment}
```

- [ ] **Step 4: 加端点**

`backend/server.py` 里仿照 `api_day` 加：

```python
@app.get("/api/day/{date_str}/group-activity")
def api_day_group_activity(date_str: str, request: Request):
    """群活跃度热力图的计数矩阵。压缩快照里没有 gd，只能从原始快照现算。"""
    if store.get_day(date_str) is None:
        return JSONResponse({"date": date_str, "groups": [], "slots": [],
                             "cells": [], "sentiment": {}},
                            headers={"Cache-Control": _CACHE_POLICIES["day"]})
    result = store.group_activity(date_str)
    return JSONResponse(result, headers={"Cache-Control": _CACHE_POLICIES["day"]})
```

> 路由顺序注意：`/api/day/{date_str}` 与 `/api/day/{date_str}/group-activity` 段数不同，FastAPI 不会冲突。但 `/api/day/{date_str}/meta` 已存在，放在它旁边即可。

- [ ] **Step 5: 跑测试确认通过**

Run: `python3 -m pytest tests/test_group_activity.py -v`
Expected: 3 passed

- [ ] **Step 6: 提交**

```bash
git add backend/data_store.py backend/server.py tests/test_group_activity.py
git commit -m "feat(api): 新增 group-activity 端点，给情绪页热力图提供数据源"
```

---

### Task 6: `/api/dates` 带上消息条数（F16 后端半边）

**Files:**
- Modify: `backend/data_store.py`（`startup()` 扫描时顺手记条数；`get_dates_info` 读缓存）
- Test: `tests/test_data_store.py`（追加）

**Interfaces:**
- Consumes: 无
- Produces:
  - `DataStore._peek_message_count(path: Path) -> int`（静态方法）
  - `DataStore.get_dates_info()` 的每项变成 `{"date": str, "size_kb": float, "message_count": int}`

**为什么不能直接 `get_day()`**：`startup()` 只预热最近 N 天（`data_store.py:114-117`，`eager_load_days` 默认 1），其余按需懒加载。一天文件 25–36 MB，`get_dates_info` 若逐天 `get_day()` 会把 35 天全部读进内存——每次打开页面都触发一次。所以改成在启动扫描时只读文件开头的 `total_msgs`。

- [ ] **Step 1: 写失败的测试**

追加到 `tests/test_data_store.py`（该文件已有 `data_dir` fixture，用 `tmp_path` 建了 `day_2026-07-06.json` 等，`total_msgs` 为 100）：

```python
def test_dates_info_includes_message_count(data_dir):
    store = DataStore(data_dir)
    store.startup()
    info = {d["date"]: d for d in store.get_dates_info()}
    assert info["2026-07-06"]["message_count"] == 100
    assert "size_kb" in info["2026-07-06"], "size_kb 保留，前端还有别处可能用到"


def test_message_count_read_does_not_load_the_day(data_dir):
    """get_dates_info 不能把整天读进内存 —— 35 天 × 30MB 会让首屏崩掉。"""
    store = DataStore(data_dir)
    store.startup()
    loaded_after_startup = set(store._days)     # startup 只预热 eager_load_days 天（默认 1）
    store.get_dates_info()
    assert set(store._days) == loaded_after_startup, "get_dates_info 不该触发任何懒加载"
```

> `_days` 是 `DataStore` 内部的已加载字典（`data_store.py:179` 写入），`eager_load_days` 默认 1（`data_store.py:90`）。断言写成「前后不变」而不是「必须为空」，避免绑死预热天数。

- [ ] **Step 2: 跑测试确认失败**

Run: `python3 -m pytest tests/test_data_store.py -v -k message_count`
Expected: FAIL — `KeyError: 'message_count'`

- [ ] **Step 3: 实现**

`backend/data_store.py` 顶部确认已 `import re`（没有就加），然后在 `DataStore` 里加静态方法：

```python
    @staticmethod
    def _peek_message_count(path: Path) -> int:
        """从 day 文件开头读 total_msgs，不解析整个文件。

        采集端把 total_msgs 写在 snapshots 之前（文件第 3 行），读 256 字节足够。
        读不到就返回 0 —— 空日期本来就该被前端当成「没数据」。
        """
        try:
            with path.open("rb") as fh:
                head = fh.read(256).decode("utf-8", "ignore")
        except OSError:
            return 0
        m = re.search(r'"total_msgs"\s*:\s*(\d+)', head)
        return int(m.group(1)) if m else 0
```

在 `startup()` 的扫描循环里补上（现在是 `data_store.py:108-110`）：

```python
        for path in day_files:
            date_str = path.stem.replace("day_", "")
            self._dates_info[date_str] = round(path.stat().st_size / 1024, 1)
            self._msg_counts[date_str] = self._peek_message_count(path)
```

`__init__` 里初始化 `self._msg_counts: dict[str, int] = {}`。

`get_dates_info` 改为：

```python
    def get_dates_info(self) -> list[dict]:
        """日期列表 + 体积 + 消息条数。

        message_count 供前端日期下拉显示「1,187 条」与「跳过没有数据的日子」用 ——
        原来只给 size_kb，下拉里显示的是一串对用户毫无意义的 MB。
        """
        return [
            {
                "date": d,
                "size_kb": self._dates_info.get(d, 0),
                "message_count": self._msg_counts.get(d, 0),
            }
            for d in sorted(self._dates_info.keys(), reverse=True)
        ]
```

- [ ] **Step 4: 跑测试确认通过**

Run: `python3 -m pytest tests/test_data_store.py -v && python3 -m pytest tests/ -v`
Expected: 全绿（`test_api_dedup.py` 等对 `/api/dates` 有断言的用例若因新增字段失败，更新断言而不是回退字段）

- [ ] **Step 5: 提交**

```bash
git add backend/data_store.py tests/test_data_store.py
git commit -m "feat(api): /api/dates 返回 message_count"
```

---

### Task 7: 前端 `actions.ts` —— 操作信号 key 归一化（F9）

**Files:**
- Create: `src/lib/actions.ts`
- Create: `src/lib/actions.test.ts`
- Modify: `src/pages/Compare.tsx:820-872`

**Interfaces:**
- Consumes: 无
- Produces:
  - `export const ACTION_KEYS = ['买入', '卖出', '持有', '风险'] as const;`
  - `export type ActionKey = (typeof ACTION_KEYS)[number];`
  - `export function normalizeActionCounts(act: Record<string, number> | undefined): Record<ActionKey, number>`
  - `export function buySellRatio(counts: Record<ActionKey, number>): number | null`

- [ ] **Step 1: 写失败的测试**

新建 `src/lib/actions.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { ACTION_KEYS, buySellRatio, normalizeActionCounts } from './actions';

// /api/day/2026-09-11 的真实形状
const API_ACT = { 风险提示: 24, 买入信号: 76, 卖出信号: 34, 持有建议: 90 };

describe('normalizeActionCounts', () => {
  it('把后端的「买入信号」等长名映射成短名', () => {
    expect(normalizeActionCounts(API_ACT)).toEqual({ 买入: 76, 卖出: 34, 持有: 90, 风险: 24 });
  });

  it('缺失的键补 0', () => {
    expect(normalizeActionCounts({ 买入信号: 5 })).toEqual({ 买入: 5, 卖出: 0, 持有: 0, 风险: 0 });
  });

  it('undefined 也返回完整的零值对象', () => {
    expect(normalizeActionCounts(undefined)).toEqual({ 买入: 0, 卖出: 0, 持有: 0, 风险: 0 });
  });

  it('ACTION_KEYS 与返回对象的键一致（图表轴依赖顺序）', () => {
    expect(Object.keys(normalizeActionCounts(API_ACT))).toEqual([...ACTION_KEYS]);
  });
});

describe('buySellRatio', () => {
  it('正常算出比值', () => {
    expect(buySellRatio(normalizeActionCounts(API_ACT))).toBeCloseTo(2.2, 1);
  });

  it('卖出为 0 时返回 null，而不是 Infinity', () => {
    expect(buySellRatio({ 买入: 5, 卖出: 0, 持有: 0, 风险: 0 })).toBeNull();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- actions`
Expected: FAIL — `Failed to resolve import "./actions"`

- [ ] **Step 3: 实现 `src/lib/actions.ts`**

```ts
/**
 * 后端 `snapshot.act` 的键是「买入信号 / 卖出信号 / 持有建议 / 风险提示」，
 * 而对比页原来按「买入 / 卖出 / 持有 / 风险」取值 —— 全取到 undefined，
 * 于是操作信号图永远没有柱子、买卖比永远是 ∞。这里做一次显式归一化。
 */
export const ACTION_KEYS = ['买入', '卖出', '持有', '风险'] as const;
export type ActionKey = (typeof ACTION_KEYS)[number];

const API_SUFFIX: Record<ActionKey, string> = {
  买入: '买入信号',
  卖出: '卖出信号',
  持有: '持有建议',
  风险: '风险提示',
};

export function normalizeActionCounts(
  act: Record<string, number> | undefined,
): Record<ActionKey, number> {
  const src = act ?? {};
  const out = {} as Record<ActionKey, number>;
  for (const key of ACTION_KEYS) {
    const raw = src[API_SUFFIX[key]] ?? src[key];
    out[key] = typeof raw === 'number' ? raw : 0;
  }
  return out;
}

/** 卖出为 0 时没有意义的比值 —— 返回 null，由调用方显示「—」。 */
export function buySellRatio(counts: Record<ActionKey, number>): number | null {
  if (counts.卖出 <= 0) return null;
  return counts.买入 / counts.卖出;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test -- actions`
Expected: 6 passed

- [ ] **Step 5: 接进 `Compare.tsx`**

`Compare.tsx` 顶部加 `import { ACTION_KEYS, buySellRatio, normalizeActionCounts } from '@/lib/actions';`。

`ActionSignalCompare`（约 822 行）里删掉本地的 `const actions = ['买入','卖出','持有','风险']`，改成：

```tsx
  const chartData = useMemo(() => {
    return ACTION_KEYS.map((action) => {
      const point: Record<string, string | number> = { action };
      days.forEach((day, i) => {
        point[`day${i}`] = normalizeActionCounts(day.actionCounts)[action];
      });
      return point;
    });
  }, [days]);
```

买卖比那段（约 868-871 行）改成：

```tsx
          {days.map((day, i) => {
            const ratio = buySellRatio(normalizeActionCounts(day.actionCounts));
```

并把下面的 `买/卖比: <span ...>{ratio}</span>` 改成 `{ratio === null ? '—' : ratio.toFixed(1)}`。

> `CompareDayData.actionCounts` 的类型（`Record<string, number>`）不用改 —— `normalizeActionCounts` 接受它。

- [ ] **Step 6: 跑测试与构建**

Run: `npm test && npm run build`
Expected: 通过

- [ ] **Step 7: 提交**

```bash
git add src/lib/actions.ts src/lib/actions.test.ts src/pages/Compare.tsx
git commit -m "fix(compare): 操作信号 key 归一化，图表不再空、买卖比不再恒为 ∞"
```

---

### Task 8: 前端 `sentiment.ts` —— 互斥预警（F10）

**Files:**
- Create: `src/lib/sentiment.ts`
- Create: `src/lib/sentiment.test.ts`
- Modify: `src/pages/Sentiment.tsx:435-460, 691-717`

**Interfaces:**
- Consumes: 无
- Produces:
  - `export type SentimentAlert = { kind: 'euphoria' | 'panic'; text: string };`
  - `export function pickAlert(euphoria: number, pessimism: number, threshold?: number): SentimentAlert | null`

- [ ] **Step 1: 写失败的测试**

新建 `src/lib/sentiment.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { pickAlert } from './sentiment';

describe('pickAlert', () => {
  // 2026-09-10 的真实数字：两条互斥横幅同时挂出来
  it('两个都高且差距小于阈值时都不报（剧烈分歧）', () => {
    expect(pickAlert(82, 10, 5)).toBeNull();
  });

  it('亢奋明显占优时报亢奋', () => {
    expect(pickAlert(82, 3, 5)).toEqual({ kind: 'euphoria', text: '市场极度亢奋，注意追高风险' });
  });

  it('悲观明显占优时报悲观', () => {
    expect(pickAlert(2, 40, 5)).toEqual({ kind: 'panic', text: '市场极度悲观，或存在反弹机会' });
  });

  it('一高一低不会同时报两条', () => {
    const a = pickAlert(30, 1, 5);
    expect(a?.kind).toBe('euphoria');
  });

  it('都不过阈值时不报', () => {
    expect(pickAlert(3, 2, 5)).toBeNull();
  });

  it('都不过阈值但差值大也不报（避免噪声）', () => {
    expect(pickAlert(4, 0, 5)).toBeNull();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- sentiment`
Expected: FAIL — `Failed to resolve import "./sentiment"`

- [ ] **Step 3: 实现 `src/lib/sentiment.ts`**

```ts
export type SentimentAlert = { kind: 'euphoria' | 'panic'; text: string };

const EUPHORIA_TEXT = '市场极度亢奋，注意追高风险';
const PANIC_TEXT = '市场极度悲观，或存在反弹机会';

/**
 * 亢奋与悲观**互斥**。
 *
 * 原来 `Sentiment.tsx` 里是两个独立条件（`eh > 5`、`el > 5`），2026-09-10
 * （eh=82 / el=10）两条横幅同时挂出，页面自相矛盾。
 *
 * 规则：两个数都要过阈值，且差值绝对值也要过阈值，才报数值大的一方；
 * 否则一条都不报 —— eh 与 el 同时高在真实市场里是「剧烈分歧」，
 * 此时沉默比两条都喊更诚实。
 */
export function pickAlert(euphoria: number, pessimism: number, threshold = 5): SentimentAlert | null {
  if (euphoria < threshold && pessimism < threshold) return null;
  if (Math.abs(euphoria - pessimism) < threshold) return null;
  return euphoria > pessimism
    ? { kind: 'euphoria', text: EUPHORIA_TEXT }
    : { kind: 'panic', text: PANIC_TEXT };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test -- sentiment`
Expected: 6 passed

- [ ] **Step 5: 接进 `Sentiment.tsx`**

删掉 691-717 行那两块独立的 `<AnimatePresence>`，换成一块：

```tsx
        {/* Warning banner —— 亢奋与悲观互斥，见 src/lib/sentiment.ts */}
        <AnimatePresence>
          {alert && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className={`mt-4 flex items-center gap-2 px-4 py-2.5 rounded-lg border ${
                alert.kind === 'euphoria'
                  ? 'bg-brand-purple/10 border-brand-purple/30 text-brand-purple'
                  : 'bg-brand-red/10 border-brand-red/30 text-brand-red'
              }`}
            >
              <AlertTriangle size={16} className="shrink-0" />
              <span className="text-sm">{alert.text}</span>
            </motion.div>
          )}
        </AnimatePresence>
```

在组件里算出来（放在 `sd` 已算出的位置附近）：

```tsx
  const alert = useMemo(() => pickAlert(sd.eh, sd.el), [sd.eh, sd.el]);
```

「情绪洞察」那两条（原 441 `sd.eh > 3` / 450 `sd.el > 3`）改为消费同一个 `alert`：

```tsx
    if (alert?.kind === 'euphoria') {
      items.push({
        icon: <Flame size={16} className="text-brand-purple shrink-0 mt-0.5" />,
        text: '情绪极度亢奋，注意追高风险，警惕获利回吐压力。',
        color: 'text-brand-purple',
      });
    }

    if (alert?.kind === 'panic') {
      items.push({
        icon: <Snowflake size={16} className="text-ink-tertiary shrink-0 mt-0.5" />,
        text: '情绪极度悲观，或存在反弹机会，关注超跌品种。',
        color: 'text-ink-secondary',
      });
    }
```

（把原来的 `if (sd.eh > 3) {...}` / `if (sd.el > 3) {...}` 两块整段替换掉。）

- [ ] **Step 6: 跑测试与构建**

Run: `npm test && npm run build`
Expected: 通过

- [ ] **Step 7: 提交**

```bash
git add src/lib/sentiment.ts src/lib/sentiment.test.ts src/pages/Sentiment.tsx
git commit -m "fix(sentiment): 亢奋与悲观预警改为互斥，洞察复用同一判据"
```

---

### Task 9: 前端 `messageText.ts` —— 正文清洗与近重复去重（F15 前端 / F17）

**Files:**
- Create: `src/lib/messageText.ts`
- Create: `src/lib/messageText.test.ts`
- Modify: `src/pages/StockDetail.tsx`（「历史讨论」「群消息溯源」渲染前过滤）、`src/pages/Report.tsx`（`NewsCard` 的 `summary` 为空时不渲染）

**Interfaces:**
- Consumes: `src/lib/palace.ts:92 readableText`
- Produces:
  - `export function cleanMessageText(text: string): string`
  - `export interface DurableMessage { ts: string; group: string; text: string; id?: string }`
  - `export function dedupeNearDuplicates<T extends DurableMessage>(items: T[]): T[]`

- [ ] **Step 1: 写失败的测试**

新建 `src/lib/messageText.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { cleanMessageText, dedupeNearDuplicates } from './messageText';

describe('cleanMessageText', () => {
  it('折叠完整链接', () => {
    expect(cleanMessageText('看[中百](https://wap.eastmoney.com/quote/stock/1.600857.html)封死'))
      .toBe('看中百封死');
  });

  it('图片折成 [图片]', () => {
    expect(cleanMessageText('图![Image](img_v3_abc)完了')).toBe('图[图片]完了');
  });

  it('剥掉飞书编辑头', () => {
    expect(cleanMessageText('2026-08-06 18:24:42 [编辑]\n \n缺成这雕样了。'))
      .toBe('缺成这雕样了。');
  });

  it('剥掉【讲师】时间戳前缀', () => {
    const raw = '【讲师】 胖大叔 2026 09 10 23:50:19 2026年9月10日周四复盘 今日兑现了亚盛集团';
    expect(cleanMessageText(raw).startsWith('2026年9月10日周四复盘')).toBe(true);
  });

  it('截断的链接只留显示文字', () => {
    expect(cleanMessageText('看[中百](https://wap.eastmoney.com/quote')).toBe('看中百');
  });

  it('剥掉 markdown 标题记号与显示文字是 URL 的截断链接', () => {
    expect(cleanMessageText('### 橙子不糊涂的科技花园[https://wap.eastmoney.'))
      .toBe('橙子不糊涂的科技花园');
  });

  it('纯方括号记号不会被当成截断链接吃掉', () => {
    // 旧规则用可选的 `\(` 匹配，会把 `[编辑]` 折成 `编辑`，元数据行就认不出来了
    expect(cleanMessageText('2026-08-06 18:24:42 [编辑]\n缺成这雕样了。')).toBe('缺成这雕样了。');
  });

  it('普通正文原样保留', () => {
    expect(cleanMessageText('中百这个拉板的话新华还有救')).toBe('中百这个拉板的话新华还有救');
  });
});

describe('dedupeNearDuplicates', () => {
  // 600857 在 2026-09-10 的真实数据：同秒、同群、不同 id，一条拼音一条中文
  const pairs = [
    { ts: '2026-09-10 13:06', group: '006_帝凌枫', text: '中百封死', id: 'a' },
    { ts: '2026-09-10 13:06', group: '006_帝凌枫', text: '中百feng死', id: 'b' },
    { ts: '2026-09-10 11:55', group: '006_帝凌枫', text: '中百买了次日也拿不住', id: 'c' },
    { ts: '2026-09-10 11:55', group: '006_帝凌枫', text: '中百买le次日也拿不住', id: 'd' },
  ];

  it('同秒同群的拼音版被去掉，保留中文那条', () => {
    const out = dedupeNearDuplicates(pairs);
    expect(out.map((m) => m.id)).toEqual(['a', 'c']);
  });

  it('不同群即使同文本也保留', () => {
    const out = dedupeNearDuplicates([
      { ts: '2026-09-10 13:06', group: 'A', text: '中百封死' },
      { ts: '2026-09-10 13:06', group: 'B', text: '中百封死' },
    ]);
    expect(out).toHaveLength(2);
  });

  it('同群但时间不同则保留（真的重复发过）', () => {
    const out = dedupeNearDuplicates([
      { ts: '2026-09-10 09:45', group: 'A', text: '长光华芯进了' },
      { ts: '2026-07-17 09:34', group: 'A', text: '长光华芯进了' },
    ]);
    expect(out).toHaveLength(2);
  });

  it('差异过大的同秒消息都保留', () => {
    const out = dedupeNearDuplicates([
      { ts: '2026-09-10 13:06', group: 'A', text: '中百封死' },
      { ts: '2026-09-10 13:06', group: 'A', text: '科技拉完中百秒板' },
    ]);
    expect(out).toHaveLength(2);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- messageText`
Expected: FAIL — `Failed to resolve import "./messageText"`

- [ ] **Step 3: 实现 `src/lib/messageText.ts`**

```ts
import { readableText } from './palace';

const EDIT_HEADER = /^\s*\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?\s*(?:\[编辑\])?\s*$/gm;
const LECTURER_PREFIX = /^\s*【[^】]{1,6}】\s*\S{0,20}?\s*\d{4}\s+\d{2}\s+\d{2}\s+\d{2}:\d{2}:\d{2}\s*/;
const HEADING = /^\s*#{1,6}\s+/gm;
const TRUNCATED_MD_LINK = /\[([^\]]+)\]\([^)]*$/gm;
const TRUNCATED_BARE_URL = /\[https?:\/\/[^\]\s]{0,200}$/gim;

/**
 * 群消息正文的展示层清洗。规则与后端 `backend/textclean.py` 一一对应，
 * 两边各有一份测试、用例同表。
 *
 * **顺序有讲究**：两条截断链接规则必须排在最后。`[编辑]` 这种方括号记号会被
 * 「截断链接」误吃掉（它没有圆括号，旧规则用可选的 `\(` 就把它当成链接了），
 * 先剥元数据行才能保住识别。
 *
 * **只用于展示**，不改存量落盘数据。
 */
export function cleanMessageText(text: string): string {
  if (!text) return '';
  let out = readableText(text);                     // 先折完整链接与图片
  out = out.replace(EDIT_HEADER, '');
  out = out.replace(LECTURER_PREFIX, '');
  out = out.replace(HEADING, '');
  out = out.replace(TRUNCATED_MD_LINK, '$1');
  out = out.replace(TRUNCATED_BARE_URL, '');
  return out
    .replace(/[ \t　]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

export interface DurableMessage {
  ts: string;
  group: string;
  text: string;
  id?: string;
}

/**
 * 只留中文骨架：去掉拉丁字母片段、空白与标点。
 *
 * 拼音替代把「封」写成 `feng`，直接比字符会因为长度差 3 被判成不相似；
 * 剥掉拉丁片段后两条的骨架高度重合（`中百封死` vs `中百死`）。
 */
function skeleton(text: string): string {
  return text.replace(/[a-zA-Z]+/g, '').replace(/[\s\p{P}\p{S}]/gu, '');
}

/** 拼音替代版的特征：连续的 2 个以上拉丁字母片段。 */
function latinRuns(text: string): number {
  return (text.match(/[a-zA-Z]{2,}/g) ?? []).length;
}

/**
 * 最长公共子序列比 `2*LCS/(len1+len2)`。
 *
 * 必须用 LCS 而不是逐位比较：`中百买了次日…` vs `中百买le次日…` 剥掉 `le` 之后
 * 整段是错位的，逐位比只有 3/9，LCS 有 0.95。串很短（≤120 字符），O(n·m) 足够。
 */
function similarity(a: string, b: string): number {
  const s1 = skeleton(a);
  const s2 = skeleton(b);
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1;
  const dp: number[] = new Array(s2.length + 1).fill(0);
  for (let i = 1; i <= s1.length; i++) {
    let prev = 0;
    for (let j = 1; j <= s2.length; j++) {
      const tmp = dp[j];
      dp[j] = s1[i - 1] === s2[j - 1] ? prev + 1 : Math.max(dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return (2 * dp[s2.length]) / (s1.length + s2.length);
}

/**
 * 同群 + 同时间戳 + 文本近似 → 只保留「中文占优」的那条。
 *
 * 群里为了过审会把同一句话再发一遍拼音版（`中百feng死` / `中百封死`），
 * 两条都落库、时间戳还一样，历史讨论里就并排出现两遍。
 * 后端现有去重按精确文本比对，抓不到这种。
 *
 * 阈值定在 0.8，实测：`中百封死`/`中百feng死` = 0.86 判重；
 * `中百封死`/`科技拉完中百秒板` = 0.33 不判重（同秒的不同消息不该被吞）。
 */
export function dedupeNearDuplicates<T extends DurableMessage>(
  items: T[],
  threshold = 0.8,
): T[] {
  const out: T[] = [];
  for (const item of items) {
    const dup = out.find(
      (kept) =>
        kept.ts === item.ts &&
        kept.group === item.group &&
        similarity(kept.text, item.text) >= threshold,
    );
    if (!dup) {
      out.push(item);
      continue;
    }
    // 拼音版多几个拉丁字母片段 —— 留下更「中文」的那条
    if (latinRuns(item.text) < latinRuns(dup.text)) {
      out[out.indexOf(dup)] = item;
    }
  }
  return out;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test -- messageText`
Expected: 12 passed

- [ ] **Step 5: 接线（展示处清洗 + 去重）**

1. `src/pages/Report.tsx` 的 `NewsCard`：正文用 `cleanMessageText`，摘要为空时不渲染那段：

```tsx
      <h4 className="text-sm font-medium text-ink-primary mb-1">{cleanMessageText(news.title)}</h4>
      {cleanMessageText(news.summary) && (
        <p className="text-xs text-ink-secondary leading-relaxed">{cleanMessageText(news.summary)}</p>
      )}
```

（顶部 `import { cleanMessageText } from '@/lib/messageText';`）

2. `src/pages/StockDetail.tsx` 的「历史讨论」（`CrossGroupTimeline`，858 行起，正文来自 `const opinions = data?.opinions ?? []`，第 897 行）：去重后再切片，正文清洗：

```tsx
  const opinions = useMemo(
    () => dedupeNearDuplicates(data?.opinions ?? []),
    [data?.opinions],
  );
```

（第 897 行原为 `const opinions = data?.opinions ?? [];`。`opinions` 的元素就是 `{ ts, group, text, id, chat_id, ... }`，天然满足 `DurableMessage`，不用重新映射。）

下面第 913 行的 `const shown = opinions.slice(0, limit);` 不用改 —— 去重后的数组长度会一起反映到「共 N 条」和「加载更多」的计数上，这正是想要的效果。

把该组件里渲染正文的 `{readableText(o.text)}`（第 967 行）改成 `{cleanMessageText(o.text)}`。

3. `src/pages/StockDetail.tsx` 的「群消息溯源」（530 行起，正文来自 `gd.m[].x`）：同样把第 590 行的 `readableText(msg.x)` 换成 `cleanMessageText(msg.x)`，并在 `map` 前加 `.filter((m) => cleanMessageText(m.x).length > 0)`（清完变空的消息不渲染）。

**改完记得把 import 里的 `readableText` 删掉**——这个文件里它只有上面两处用途：

```tsx
import { FOCUS_RING, ROW_GRID, biasText, splitGroupName } from '@/lib/palace';
import { cleanMessageText } from '@/lib/messageText';
```

漏了这一步 `tsc -b` 会因为「未使用的 import」直接失败。

4. `src/pages/KolDetail.tsx` 的「观点时间线」（第 118 行）把 `readableText(o.text)` 换成 `cleanMessageText(o.text)`，并同样从 `@/lib/palace` 的 import 里删掉 `readableText`。

- [ ] **Step 6: 跑测试与构建**

Run: `npm test && npm run build`
Expected: 通过

- [ ] **Step 7: 提交**

```bash
git add src/lib/messageText.ts src/lib/messageText.test.ts src/pages/Report.tsx src/pages/StockDetail.tsx src/pages/KolDetail.tsx
git commit -m "fix(web): 正文清洗元数据与残缺 markdown，历史讨论去近重复"
```

---

### Task 10: 前端 `dataState.ts` + 空状态与默认日期（F1 / F11）

**Files:**
- Create: `src/lib/dataState.ts`
- Create: `src/lib/dataState.test.ts`
- Modify: `src/types/api.ts`（`DateInfo` 加 `message_count`）
- Modify: `src/store/useStore.ts:104-130`（`init` 回退到有数据的日期）
- Modify: `src/pages/Dashboard.tsx:807-830`、`src/pages/Replay.tsx:816-822`
- Modify: `src/pages/Compare.tsx:113-117`

**Interfaces:**
- Consumes: Task 6 的 `/api/dates.message_count`
- Produces:
  - `export function hasContent(snap: Snapshot | null | undefined): boolean`
  - `export function pickDefaultDate(dates: DateInfo[], count = 1): string[]`（返回前 `count` 个**有数据**的日期；一个都没有则返回前 `count` 个日期）

- [ ] **Step 1: 写失败的测试**

新建 `src/lib/dataState.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import type { DateInfo, Snapshot } from '@/types/api';
import { hasContent, pickDefaultDate } from './dataState';

const emptySnap = {
  t: '2026-09-12 00:25', msg: 0, grp: 0, sent: '',
  sd: { bu: 0, be: 0, ne: 0, eh: 0, el: 0 }, act: {}, stk: [], sec: [],
} as unknown as Snapshot;

describe('hasContent', () => {
  it('全空的快照判定为无内容 —— 判据是「有没有数据」，不是「对象在不在」', () => {
    expect(hasContent(emptySnap)).toBe(false);
  });

  it('有消息就算有内容', () => {
    expect(hasContent({ ...emptySnap, msg: 12 } as Snapshot)).toBe(true);
  });

  it('只有股票没有消息也算有内容', () => {
    expect(hasContent({ ...emptySnap, stk: [{ c: '300308' }] } as unknown as Snapshot)).toBe(true);
  });

  it('null / undefined 为 false', () => {
    expect(hasContent(null)).toBe(false);
    expect(hasContent(undefined)).toBe(false);
  });
});

const dates: DateInfo[] = [
  { date: '2026-09-12', size_kb: 270, message_count: 0 },
  { date: '2026-09-11', size_kb: 36717, message_count: 985 },
  { date: '2026-09-10', size_kb: 28679, message_count: 1187 },
];

describe('pickDefaultDate', () => {
  it('跳过没有消息的今天', () => {
    expect(pickDefaultDate(dates, 2)).toEqual(['2026-09-11', '2026-09-10']);
  });

  it('全都没有数据时退回原来的顺序', () => {
    const allEmpty = dates.map((d) => ({ ...d, message_count: 0 }));
    expect(pickDefaultDate(allEmpty, 2)).toEqual(['2026-09-12', '2026-09-11']);
  });

  it('不足 count 个就返回全部', () => {
    expect(pickDefaultDate([{ date: '2026-09-11', size_kb: 1, message_count: 5 }], 2))
      .toEqual(['2026-09-11']);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- dataState`
Expected: FAIL — `Failed to resolve import "./dataState"`

- [ ] **Step 3: 实现 `src/lib/dataState.ts` + 类型**

`src/types/api.ts` 的 `DateInfo` 加字段：

```ts
export interface DateInfo {
  date: string;
  size_kb: number;
  message_count: number;
}
```

新建 `src/lib/dataState.ts`：

```ts
import type { DateInfo, Snapshot } from '@/types/api';

/**
 * 一条快照里到底有没有内容。
 *
 * 原来 `Dashboard.tsx` / `Replay.tsx` 的守卫是 `if (!currentSnapshot)` —— 判的是
 * 「快照对象在不在」。每天 00:00 到首次有效采集之间，当日快照存在但全空，
 * 守卫不成立，页面照常渲染出 4 个 0 统计和空白内容区，没有任何提示。
 */
export function hasContent(snap: Snapshot | null | undefined): boolean {
  if (!snap) return false;
  return (
    (snap.msg ?? 0) > 0 ||
    (snap.grp ?? 0) > 0 ||
    (snap.stk?.length ?? 0) > 0 ||
    (snap.sec?.length ?? 0) > 0
  );
}

/**
 * 从倒序的可用日期里挑前 `count` 个「有数据」的日期。
 * 一个都没有时退回原来的前 `count` 个（让页面照常渲染空状态，而不是永远转圈）。
 */
export function pickDefaultDate(dates: DateInfo[], count = 1): string[] {
  const nonEmpty = dates.filter((d) => (d.message_count ?? 0) > 0);
  const source = nonEmpty.length > 0 ? nonEmpty : dates;
  return source.slice(0, count).map((d) => d.date);
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test -- dataState`
Expected: 7 passed

- [ ] **Step 5: store 回退 + 页面空状态**

1. `src/store/useStore.ts` 的 `init()`，把

```ts
      const latestDate = status.current_date || (dates.length > 0 ? dates[0].date : '');
```

改为（这里拿不到每条的 message_count 语义之外的信息，用 `/api/dates` 的 message_count 判断）：

```ts
      // 今天还没有数据时，回退到最近一个有数据的日子 —— 否则首屏是一堆 0。
      const nonEmpty = dates.filter((d) => (d.message_count ?? 0) > 0);
      const latestDate =
        nonEmpty.length > 0 ? nonEmpty[0].date : status.current_date || dates[0]?.date || '';
```

2. `src/pages/Dashboard.tsx`：把第 810 行的守卫与紧邻的 `暂无数据` 块改成

```tsx
  if (!currentSnapshot || !hasContent(currentSnapshot)) {
    if (loading) {
      return ( /* 原有的 Loader2 加载块，保持不动 */ );
    }
    const fallback = pickDefaultDate(availableDates)[0];
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center space-y-2">
          <p className="text-ink-tertiary text-lg">当日暂无数据</p>
          <p className="text-ink-quaternary text-sm">
            {currentDate} 还没有采集到消息，通常是开市前。
          </p>
          {fallback && fallback !== currentDate && (
            <button
              onClick={() => { setCurrentDate(fallback); loadDate(fallback); }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors"
            >
              查看 {fallback}
            </button>
          )}
          <button
            onClick={() => useStore.getState().init()}
            className="px-4 py-2 ml-2 bg-surface-3 text-ink-secondary rounded-lg hover:text-ink-primary transition-colors"
          >
            重新加载
          </button>
        </div>
      </div>
    );
  }
```

（`setCurrentDate` / `loadDate` 从 store 取，页面已有这些 selector；没有就补上。）

3. `src/pages/Replay.tsx` 第 819 行的守卫改成：

```tsx
  if (!displaySnapshot || !hasContent(displaySnapshot)) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-ink-tertiary">当日暂无回放数据，请换一个日期</p>
      </div>
    );
  }
```

4. `src/pages/Compare.tsx:113-117` 的默认选择改为：

```tsx
  useEffect(() => {
    if (availableDates.length >= 2 && selectedDates.length === 0) {
      const defaults = pickDefaultDate(availableDates, 2);
      if (defaults.length > 0) setSelectedDates(defaults);
    }
  }, [availableDates]);
```

- [ ] **Step 6: 跑测试与构建**

Run: `npm test && npm run build && python3 -m pytest tests/ -v`
Expected: 通过

- [ ] **Step 7: 提交**

```bash
git add src/lib/dataState.ts src/lib/dataState.test.ts src/types/api.ts src/store/useStore.ts src/pages/Dashboard.tsx src/pages/Replay.tsx src/pages/Compare.tsx
git commit -m "fix(web): 空状态改判「有没有数据」，默认日期跳过无数据的今天"
```

---

### Task 11: 热力图接上前端（F8 前端）

**Files:**
- Modify: `src/types/api.ts`（新增 `GroupActivityResponse`）
- Modify: `src/lib/api.ts`（新增 `fetchGroupActivity`）
- Modify: `src/pages/Sentiment.tsx:92-117, 537-554, 794-840`

**Interfaces:**
- Consumes: Task 5 的 `GET /api/day/{date}/group-activity`
- Produces:
  - `export interface GroupActivityResponse { date: string; groups: string[]; slots: string[]; cells: number[][]; sentiment: Record<string, string>; }`
  - `export async function fetchGroupActivity(date: string): Promise<GroupActivityResponse>`

- [ ] **Step 1: 加类型与 API 函数**

`src/types/api.ts`：

```ts
export interface GroupActivityResponse {
  date: string;
  groups: string[];
  slots: string[];
  cells: number[][];
  sentiment: Record<string, string>;
}
```

`src/lib/api.ts`（照抄文件里已有的 `fetchDayFull` 写法）：

```ts
// GET /api/day/{date}/group-activity
export async function fetchGroupActivity(date: string): Promise<GroupActivityResponse> {
  return fetchJson<GroupActivityResponse>(`/api/day/${date}/group-activity`);
}
```

- [ ] **Step 2: 改 `Sentiment.tsx` 的数据来源**

删掉本地的 `buildGroupHeatmap`（92-117 行）与 `groups` 计算（537-548 行），改为在组件里拉端点：

```tsx
  const [groupActivity, setGroupActivity] = useState<GroupActivityResponse | null>(null);

  useEffect(() => {
    if (!currentDate) return;
    let cancelled = false;
    fetchGroupActivity(currentDate)
      .then((r) => { if (!cancelled) setGroupActivity(r); })
      .catch(() => { if (!cancelled) setGroupActivity(null); });
    return () => { cancelled = true; };
  }, [currentDate]);
```

先把 `GroupHeatCell`（`Sentiment.tsx:62-69`）瘦成 `getGroupCellColor` 真正用到的两个字段——`bu`/`be`/`ne` 没有任何消费方（`getGroupCellColor` 只看 `msgCount` 与 `sent`，tooltip 也只看 `sent`）：

```ts
interface GroupHeatCell {
  msgCount: number;
  sent: string;   // 该群在当日最后一条快照里的整体情绪
}
```

热力图区块（794 行起）把两处 `timeSlots.map` / `groups.map` 换成端点数据，**cell 的内部标记与 hover tooltip 保持原样**：

```tsx
        {!groupActivity || groupActivity.groups.length === 0 ? (
          <div className="text-center py-8 text-ink-tertiary text-sm">暂无群消息数据</div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[600px]">
              {/* Time header */}
              <div className="flex items-center mb-1">
                <div className="w-20 shrink-0" />
                {groupActivity.slots.map((t) => (
                  <div key={t} className="flex-1 text-center text-[10px] text-ink-quaternary font-mono">
                    {t}
                  </div>
                ))}
              </div>
              {/* Heatmap rows */}
              {groupActivity.groups.map((group, gi) => (
                <div key={group} className="flex items-center mb-[2px]">
                  <div className="w-20 shrink-0 pr-2 text-right text-xs text-ink-secondary truncate">
                    {group}
                  </div>
                  <div className="flex-1 flex gap-[2px]">
                    {groupActivity.slots.map((t, ti) => {
                      const sent = groupActivity.sentiment[group] ?? '';
                      const cell: GroupHeatCell = {
                        msgCount: groupActivity.cells[gi]?.[ti] ?? 0,
                        sent,
                      };
                      const style = getGroupCellColor(cell);
                      return (
                        <div
                          key={t}
                          className={`flex-1 aspect-[2/3] rounded-sm relative group cursor-pointer transition-opacity hover:opacity-80 ${style.bg} ${style.pulse ? 'animate-pulse' : ''}`}
                          style={{ opacity: style.opacity }}
                          title={`${group} ${t} · 消息:${cell.msgCount} · ${sent}`}
                        >
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-surface-3 rounded text-[10px] text-ink-primary whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10 shadow-lg">
                            {group} {t}
                            <br />
                            消息: {cell.msgCount} · {sent || '-'}
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
```

同时删掉不再使用的 `timeSlots` 计算（`Sentiment.tsx` 里给旧热力图用的那一段）与 `GroupHeatCell` 的旧字段引用，避免 `tsc -b` 报未使用变量。

- [ ] **Step 3: 跑构建**

Run: `npm run build`
Expected: 通过（若 `useMemo` import 变成未使用，一并删掉）

- [ ] **Step 4: 提交**

```bash
git add src/types/api.ts src/lib/api.ts src/pages/Sentiment.tsx
git commit -m "fix(sentiment): 群活跃度热力图接上 group-activity 端点"
```

---

### Task 12: 无样本不给情绪结论 + 对比表图例（F12 / F13）

**Files:**
- Modify: `src/lib/palace.ts:113-122`（`biasText`）
- Modify: `src/lib/palace.test.ts`（追加）
- Modify: `src/pages/Compare.tsx:281`（情绪摘要空值）、`:426`（持续性列表头说明）

**Interfaces:**
- Consumes: Task 10 的 `hasContent`
- Produces: `biasText(0, 0)` 返回 `'—'`

- [ ] **Step 1: 写失败的测试**

追加到 `src/lib/palace.test.ts`：

```ts
import { biasText } from './palace';

describe('biasText 无样本', () => {
  it('0 比 0 返回 —，不说成「分歧」', () => {
    expect(biasText(0, 0)).toBe('—');
  });

  it('有样本时行为不变', () => {
    expect(biasText(5, 0)).toBe('偏多');
    expect(biasText(0, 5)).toBe('偏空');
    expect(biasText(5, 5)).toBe('分歧');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- palace`
Expected: FAIL — `expected '分歧' to be '—'`

- [ ] **Step 3: 改 `biasText`**

`src/lib/palace.ts:113`：

```ts
/** 多空的文字标签（spec §9.5 第 4 条：状态不只靠颜色）。 */
export function biasText(bull: number, bear: number): string {
  const total = bull + bear;
  if (total === 0) return '—';   // 没有样本 ≠ 多空分歧
  const ratio = bull / total;
  if (ratio >= 0.65) return '偏多';
  if (ratio <= 0.35) return '偏空';
  return '分歧';
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test -- palace`
Expected: 通过

- [ ] **Step 5: 持续性列加说明 + 情绪摘要空值**

「持续性」列（`Compare.tsx:466-478`）画的是一排小圆点：**每个选中日期一个，颜色 = 该日期列的颜色（`getDateColor(i)`），实心 = 当日上榜，灰 `bg-hairline/20` = 当日没上榜**。列头（`:426`）没有说明，用户看不出这套约定：

```tsx
            <th
              className="text-center px-4 py-3 font-medium text-ink-tertiary"
              title="每个圆点对应一个日期列（颜色见上方表头），实心 = 当日上榜"
            >
              持续性
            </th>
```

（第二个表头在第 530 行，同样加 `title`，两处都要改。）

对比页摘要条的情绪（`Compare.tsx:281` 的 `{day.sentiment}`）在**当日无内容**时不该显示结论。`day.sentiment` 来自后端 `lastSnap.sent`，空快照时后端给的是「分歧」：

```tsx
                      {hasContent(day.snapshot) ? day.sentiment : '—'}
```

（顶部 `import { hasContent } from '@/lib/dataState';`；`day.snapshot` 是 `CompareDayData` 已有字段。）

- [ ] **Step 6: 跑测试与构建**

Run: `npm test && npm run build`
Expected: 通过

- [ ] **Step 7: 提交**

```bash
git add src/lib/palace.ts src/lib/palace.test.ts src/pages/Compare.tsx
git commit -m "fix(web): 无样本不给情绪结论，对比表补持续性图例"
```

---

### Task 13: 日期下拉显示消息条数（F16 前端）

**Files:**
- Modify: `src/pages/Dashboard.tsx:175-192`

**Interfaces:**
- Consumes: Task 6 的 `DateInfo.message_count`
- Produces: 无

- [ ] **Step 1: 改下拉项**

`src/pages/Dashboard.tsx:190` 那行：

```tsx
                        <span className="text-ink-tertiary ml-2 text-xs">
                          {d.message_count > 0 ? `${d.message_count.toLocaleString()} 条` : '暂无数据'}
                        </span>
```

（原为 `className="text-ink-quaternary ml-2 text-xs"` 且显示 `({(d.size_kb / 1024).toFixed(1)} MB)`。换成 `text-ink-tertiary` 是为了把对比度从约 2.8:1 提到 ≥4.5:1。）

- [ ] **Step 2: 跑构建**

Run: `npm run build`
Expected: 通过

- [ ] **Step 3: 提交**

```bash
git add src/pages/Dashboard.tsx
git commit -m "fix(web): 日期下拉显示消息条数，提升文字对比度"
```

---

### Task 14: 文案与徽章对齐（F18 / F19）

**Files:**
- Modify: `src/pages/StockDetail.tsx:111, 1116`
- Modify: `src/components/chain/DetailPanel.tsx:70-86`
- Modify: `src/lib/chain.ts`（新增 `isCandidate`）
- Modify: `src/lib/chain.test.ts`（追加）

**Interfaces:**
- Consumes: `src/lib/chain.ts` 里已有的节点/邻居类型
- Produces: `export function isCandidate(node: { listed: boolean }, peers: Array<{ listed: boolean }>): boolean`

- [ ] **Step 1: 写失败的测试**

追加到 `src/lib/chain.test.ts`：

```ts
import { isCandidate } from './chain';

describe('isCandidate', () => {
  it('未上榜、且同环节里有已上榜的票 → 补涨候选', () => {
    expect(isCandidate({ listed: false }, [{ listed: true }, { listed: false }])).toBe(true);
  });

  it('自己已上榜就不是候选', () => {
    expect(isCandidate({ listed: true }, [{ listed: true }])).toBe(false);
  });

  it('同环节没有已上榜的票，就没有「补」的对象', () => {
    expect(isCandidate({ listed: false }, [{ listed: false }])).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- chain`
Expected: FAIL — `isCandidate is not a function`

- [ ] **Step 3: 实现并接线**

`src/lib/chain.ts` 加：

```ts
/**
 * 补涨候选 = 自己没上榜，但同环节里有人上榜。
 * 移动端列表（ChainList）有这个徽章，右侧详情面板（DetailPanel）没有，
 * 而页面帮助文案写的是「同环节里未上榜的票会被标成 补涨候选」，两处口径要一致。
 */
export function isCandidate(
  node: { listed: boolean },
  peers: Array<{ listed: boolean }>,
): boolean {
  return !node.listed && peers.some((p) => p.listed);
}
```

`src/components/chain/DetailPanel.tsx` 的邻居行（83 行附近）改成：

```tsx
              <span className={`font-mono text-[11.5px] ${n.listed ? 'text-ink-tertiary' : 'text-brand-yellow'}`}>
                {n.listed ? n.peakSc : (isCandidate(n, neighbors) ? '补涨候选' : '未上榜')}
              </span>
```

并在文件顶部 `import { isCandidate } from '@/lib/chain';`。同时把该面板的小标题「同环节邻居」改成「同环节」。

`src/pages/StockDetail.tsx` 两处 `返回 Dashboard` → `返回仪表盘`（111、1116 行）。

- [ ] **Step 4: 跑测试与构建**

Run: `npm test && npm run build`
Expected: 通过

- [ ] **Step 5: 提交**

```bash
git add src/lib/chain.ts src/lib/chain.test.ts src/components/chain/DetailPanel.tsx src/pages/StockDetail.tsx
git commit -m "fix(web): 返回文案改中文，产业链右侧面板补「补涨候选」徽章"
```

---

### Task 15: 可达性 —— aria-label 与移动端 tab（F20 / F21）

**Files:**
- Modify: `src/pages/Dashboard.tsx:198-205`（刷新按钮）、`:273-296`（内容区 tab 行）、`MobileBottomNav`（775-798）
- Modify: `src/pages/Replay.tsx:615-665`（播放控制）

**Interfaces:**
- Consumes: 无
- Produces: 无

- [ ] **Step 1: 补 Dashboard 的按钮名**

刷新按钮（第 200 行附近）加：

```tsx
          <button
            onClick={() => loadDate(currentDate)}
            aria-label="重新加载当日数据"
            className="p-1.5 rounded-lg text-ink-tertiary hover:text-ink-secondary hover:bg-surface-2 transition-colors"
          >
```

- [ ] **Step 2: 移动端隐藏图标 tab 行，底部导航补语义**

内容区 tab 行（`{tabs.map(...)}` 外层那个容器）加 `hidden sm:flex` —— 390px 下只保留底部带文字的导航，避免同一功能两套切换器 + 一排无文字的图标。

外层的类名从

```tsx
        className="flex items-center gap-1 p-1 rounded-[10px] bg-surface-2 border border-hairline/10"
```

改为

```tsx
        className="hidden sm:flex items-center gap-1 p-1 rounded-[10px] bg-surface-2 border border-hairline/10"
```

`MobileBottomNav` 的按钮补 `aria-label` 与 `aria-current`：

```tsx
            <button
              key={tab.key}
              onClick={() => onTabChange(tab.key)}
              aria-label={tab.label}
              aria-current={isActive ? 'true' : undefined}
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors ${
                isActive ? 'text-brand-blue' : 'text-ink-tertiary'
              }`}
            >
```

- [ ] **Step 3: 补 Replay 的播放控制名**

播放/暂停按钮加 `aria-label`，跳到首尾的两个按钮把 `title` 换成/补上 `aria-label`：

```tsx
        <button
          onClick={() => onSetIndex(0)}
          aria-label="跳到开头"
          title="跳到开头"
          ...
        <motion.button
          onClick={onTogglePlay}
          aria-label={isPlaying ? '暂停' : '播放'}
          ...
        <button
          onClick={() => onSetIndex(snapshots.length - 1)}
          aria-label="跳到结尾"
          title="跳到结尾"
```

- [ ] **Step 4: 跑构建**

Run: `npm run build`
Expected: 通过

- [ ] **Step 5: 用无障碍树自检（本地）**

本地起服务后用 kimi-webbridge 取 `snapshot`，确认这四个按钮的 `name` 不再为空：

```bash
~/.kimi-webbridge/bin/kimi-webbridge start   # 已在跑则无操作
curl -s -X POST http://127.0.0.1:10086/command \
  -d '{"action":"snapshot","args":{},"session":"touyan-audit-fix"}'
```

- [ ] **Step 6: 提交**

```bash
git add src/pages/Dashboard.tsx src/pages/Replay.tsx
git commit -m "fix(a11y): 图标按钮补 aria-label，移动端去掉重复的图标 tab"
```

---

## 验证记录

每条任务完成后，在 `docs/superpowers/plans/2026-09-12-site-audit-fixes-verification.md` 里追加一行/一段：

| 问题号 | 修复提交 | 单测证据（命令 + 关键输出） | 浏览器复验（截图路径 + 结论） |
|---|---|---|---|

浏览器复验统一在本地进行：`python3 -m uvicorn backend.server:app --port 8765` + `npm run dev`（vite 在 **3000** 端口，已把 `/api` 代理到 8765），用 kimi-webbridge 打开 `http://127.0.0.1:3000/`，截图存 `docs/superpowers/plans/assets/2026-09-12-site-audit/`。

**本地数据是旧的副本**（采集真身在云端），所以本地只验「逻辑对不对」（口径算对、空状态出现、图表有柱子），不比对具体数字。
