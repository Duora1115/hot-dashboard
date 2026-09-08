# 归因污染修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把板块 / 多空 / 操作从"整条消息级"改为"按股票就近归因"，拆分所属板块（`sec`）与消息关联板块（`ms`），并清理高危关键词与子串误匹配。

**Architecture:** 在 `backend/collector.py` 新增一套"逻辑文本 + 切句 + ±N 字符窗口 + 最长优先去重叠"的归因引擎 `attribute_message`；`analyze_text` 额外产出 `by_code`；`compute_snapshot` 按 code 取邻近归因结果，同时保留消息级并集为 `mention_sectors`；`data_store._compress_snapshot` 把它映射成前端 `ms` 字段；前端详情页把"关联板块"拆成"所属板块"与"消息关联板块"。

**Tech Stack:** Python 3 / pytest / PyYAML / React 19 + TypeScript + Vite

**Spec:** `docs/superpowers/specs/2026-09-08-attribution-contamination-design.md`

## Global Constraints

- 归因窗口 `window_chars: 30`，按**逻辑文本**（`[文字](url)` 折叠成 `文字`）计算距离。
- `ignore_link_texts: ["农业"]`，链接文字命中即丢弃该提及。
- 热度公式不变：`groups*3 + mentions*2 + actions*5 + (bull-bear)*2`（但 `actions` 改为按 code 邻近统计）。
- `ms` 是**新增可选字段**，老 day 文件没有它 → 前端按空数组处理。
- 关键词最长优先去重叠；ASCII 关键词加词边界。
- B2 只清 4 处：`银行` 移出 `红利`/`高股息`/`不良`（新增 `高股息` 板块承接）、`AI算力` 移出 `华为`/`推理`/`训练`、`券商` 移出 `牛市`。
- 不改 `config/settings.yaml` 里 `sentiments` / `actions` 的词库。
- 测试命令：`python -m pytest tests/ -v`（在仓库根目录）。前端构建：`npm run build`。

---

### Task 1: 配置 —— attribution 段 + B2 词库清理

**Files:**
- Modify: `config/settings.yaml:82-100`（sectors 段）、新增 `attribution` 段
- Test: `tests/test_attribution.py`（新建）

**Interfaces:**
- Consumes: 无
- Produces: `cfg["attribution"]["window_chars"]`、`cfg["attribution"]["ignore_link_texts"]`、`cfg["sectors"]["高股息"]`

- [ ] **Step 1: 写失败的测试**

新建 `tests/test_attribution.py`：

```python
"""归因污染修复的单元测试（就近归因 / 关键词清理）"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from backend import collector


def test_settings_attribution_block():
    cfg = collector.load_config()
    assert cfg["attribution"]["window_chars"] == 30
    assert "农业" in cfg["attribution"]["ignore_link_texts"]


def test_settings_high_risk_keywords_cleaned():
    cfg = collector.load_config()
    bank = cfg["sectors"]["银行"]
    assert "红利" not in bank
    assert "高股息" not in bank
    assert "不良" not in bank
    # 移出的词被新板块承接
    assert "红利" in cfg["sectors"]["高股息"]
    assert "高股息" in cfg["sectors"]["高股息"]
    # 其余高危词
    assert "华为" not in cfg["sectors"]["AI算力"]
    assert "推理" not in cfg["sectors"]["AI算力"]
    assert "训练" not in cfg["sectors"]["AI算力"]
    assert "牛市" not in cfg["sectors"]["券商"]
```

- [ ] **Step 2: 运行测试确认失败**

Run: `python -m pytest tests/test_attribution.py -v`
Expected: FAIL —— `KeyError: 'attribution'` 或断言失败（`红利` 仍在银行里）。

- [ ] **Step 3: 修改配置**

在 `config/settings.yaml` 的 `sectors:` 段之前（`# 板块/概念关键词` 上方）插入：

```yaml
# 归因（就近）参数
attribution:
  window_chars: 30             # 股票提及前后 ±N 字符（按逻辑文本计）
  ignore_link_texts: ["农业"]   # 链接文字命中则丢弃该提及（可回滚）
```

然后改这三行 sectors（保持缩进与列表风格）：

```yaml
  银行: ["银行", "银行板块", "息差"]
  高股息: ["高股息", "红利", "股息率"]
  AI算力: ["AI", "算力", "昇腾", "大模型", "GPU", "GPU服务器", "英伟达", "nvidia"]
  券商: ["券商", "证券", "券商板块", "东方财富", "中信证券"]
```

（`高股息` 这一行插在 `银行` 行之后。`AI算力` 与 `券商` 为整行替换。）

- [ ] **Step 4: 运行测试确认通过**

Run: `python -m pytest tests/test_attribution.py -v`
Expected: PASS（2 passed）

- [ ] **Step 5: 确认旧测试未被配置改动影响**

Run: `python -m pytest tests/ -v`
Expected: 全部 PASS（配置改动不影响任何现有断言）。

- [ ] **Step 6: 提交**

```bash
git add config/settings.yaml tests/test_attribution.py
git commit -m "feat: 新增归因配置段并清理高危板块关键词"
```

---

### Task 2: `attribute_message` 就近归因引擎

**Files:**
- Modify: `backend/collector.py`（在 `analyze_text` 之前新增常量与函数）
- Test: `tests/test_attribution.py`（追加）

**Interfaces:**
- Consumes: `cfg["sectors"]` / `cfg["sentiments"]` / `cfg["actions"]` / `cfg["attribution"]`
- Produces:
  - `attribute_message(text: str, cfg: dict, window_chars: int | None = None, ignore_link_texts: list[str] | None = None) -> dict`
  - 返回 `{code: {"sectors": list[str], "bull": bool, "bear": bool, "actions": list[str]}}`
  - 辅助函数 `_find_all(text, kw)`、`_scan_window(win, keyword_map)`、`_logical_text(text)`、`_sentence_bounds(logical)`
  - 常量 `LINK_RE`、`BARE_CODE_RE`、`SENT_SPLIT_RE`、`DEFAULT_WINDOW_CHARS`

- [ ] **Step 1: 写失败的测试**

在 `tests/test_attribution.py` 末尾追加：

```python
from backend.collector import attribute_message


def _link(name, code):
    market = "1" if code.startswith("6") else "0"
    return f"[{name}](https://wap.eastmoney.com/quote/stock/{market}.{code}.html)"


def test_proximity_attributes_to_nearby_stock_only():
    cfg = {"sectors": {"光模块": ["光模块"]}, "sentiments": {}, "actions": {}}
    text = (
        _link("中际旭创", "300308") + "光模块需求旺盛。"
        + "今天大盘震荡。" * 5
        + _link("海康威视", "002415") + "经营正常。"
    )
    by_code = attribute_message(text, cfg)
    assert by_code["300308"]["sectors"] == ["光模块"]
    assert by_code["002415"]["sectors"] == []


def test_window_char_limit_within_one_sentence():
    cfg = {"sectors": {"光模块": ["光模块"]}, "sentiments": {}, "actions": {}}
    near = _link("中际旭创", "300308") + "光模块"
    far = _link("中际旭创", "300308") + "啊" * 50 + "光模块"
    assert attribute_message(near, cfg)["300308"]["sectors"] == ["光模块"]
    assert attribute_message(far, cfg)["300308"]["sectors"] == []


def test_long_url_does_not_inflate_distance():
    cfg = {"sectors": {"光模块": ["光模块"]}, "sentiments": {}, "actions": {}}
    text = "光模块景气 " + _link("中际旭创", "300308")
    assert attribute_message(text, cfg)["300308"]["sectors"] == ["光模块"]


def test_ignore_link_texts_drops_mention():
    cfg = {"sectors": {"农业": ["农业"]}, "sentiments": {}, "actions": {},
           "attribution": {"ignore_link_texts": ["农业"]}}
    text = _link("农业", "601288") + "厄尔尼诺鱼粉中水"
    assert "601288" not in attribute_message(text, cfg)


def test_multiple_stocks_no_cross_contamination():
    cfg = {"sectors": {"光模块": ["光模块"], "银行": ["银行"]},
           "sentiments": {}, "actions": {}}
    text = _link("中际旭创", "300308") + "光模块。" + _link("农业银行", "601288") + "银行板块走弱。"
    by_code = attribute_message(text, cfg)
    assert by_code["300308"]["sectors"] == ["光模块"]
    assert by_code["601288"]["sectors"] == ["银行"]


def test_bare_code_is_a_mention():
    cfg = {"sectors": {"光模块": ["光模块"]}, "sentiments": {}, "actions": {}}
    by_code = attribute_message("300308 光模块景气度回升", cfg)
    assert by_code["300308"]["sectors"] == ["光模块"]


def test_longest_match_wins_over_substring():
    cfg = {"sectors": {"消费": ["消费"], "消费电子": ["消费电子"]},
           "sentiments": {}, "actions": {}}
    text = _link("立讯精密", "002475") + "消费电子回暖"
    assert attribute_message(text, cfg)["002475"]["sectors"] == ["消费电子"]


def test_ascii_keyword_has_word_boundary():
    cfg = {"sectors": {"AI算力": ["AI"]}, "sentiments": {}, "actions": {}}
    assert attribute_message(_link("中际旭创", "300308") + "he said it", cfg)["300308"]["sectors"] == []
    assert attribute_message(_link("中际旭创", "300308") + "AI 算力景气", cfg)["300308"]["sectors"] == ["AI算力"]


def test_bull_bear_attributed_per_code():
    cfg = {"sectors": {}, "sentiments": {"看多": ["看好"], "看空": ["看空"]}, "actions": {}}
    text = _link("中际旭创", "300308") + "看好。" + _link("海康威视", "002415") + "看空。"
    by_code = attribute_message(text, cfg)
    assert by_code["300308"]["bull"] is True and by_code["300308"]["bear"] is False
    assert by_code["002415"]["bear"] is True and by_code["002415"]["bull"] is False


def test_b2_regression_hikvision_not_bank():
    """海康威视 + 红利，不应因旧词库被打上银行。"""
    cfg = {"sectors": {"银行": ["银行", "息差"], "高股息": ["高股息", "红利"]},
           "sentiments": {}, "actions": {}}
    text = _link("海康威视", "002415") + "白马红利股"
    assert "银行" not in attribute_message(text, cfg)["002415"]["sectors"]
```

- [ ] **Step 2: 运行测试确认失败**

Run: `python -m pytest tests/test_attribution.py -v`
Expected: FAIL —— `ImportError: cannot import name 'attribute_message'`。

- [ ] **Step 3: 实现归因引擎**

在 `backend/collector.py` 中 `# ---- 文本分析 ----` 注释上方（`def analyze_text` 之前）插入：

```python
# ---- 归因（就近）----
LINK_RE = re.compile(r'\[([^\]]+)\]\(https://wap\.eastmoney\.com/quote/stock/\d\.(\d{6})\.html\)')
BARE_CODE_RE = re.compile(r'\b([36890]\d{5})\b')
SENT_SPLIT_RE = re.compile(r'[。！？；!?;]|\n|  +')
DEFAULT_WINDOW_CHARS = 30


def _find_all(text, kw):
    """返回 kw 在 text 中全部 (start, end)。ASCII 词加词边界，避免 ai⊂said。"""
    if kw.isascii():
        pat = re.compile(r'(?<![A-Za-z0-9])' + re.escape(kw) + r'(?![A-Za-z0-9])', re.IGNORECASE)
        return [(m.start(), m.end()) for m in pat.finditer(text)]
    spans, i = [], text.find(kw)
    while i >= 0:
        spans.append((i, i + len(kw)))
        i = text.find(kw, i + 1)
    return spans


def _scan_window(win, keyword_map):
    """窗口内命中哪些标签。最长优先去重叠，消灭 消费⊂消费电子 这类嵌套误匹配。"""
    hits = []
    for label, kws in keyword_map.items():
        for kw in kws:
            for s, e in _find_all(win, kw):
                hits.append((s, e, label))
    hits.sort(key=lambda h: -(h[1] - h[0]))
    accepted = []
    for h in hits:
        if any(not (h[1] <= a[0] or h[0] >= a[1]) for a in accepted):
            continue
        accepted.append(h)
    return {a[2] for a in accepted}


def _logical_text(text):
    """把 [文字](url) 折叠成 文字，返回 (逻辑文本, 提及, 原文→逻辑位置, 链接区间)。

    提及元素为 (逻辑位置, code, link_text)。长 URL 不参与距离计算，
    否则一条链接就能撑爆 ±N 窗口。
    """
    out, mentions, pos_map, link_spans = [], [], {}, []
    i, log_len = 0, 0
    for m in LINK_RE.finditer(text):
        for j in range(i, m.start()):
            pos_map[j] = log_len
            out.append(text[j])
            log_len += 1
        link_spans.append((m.start(), m.end()))
        mentions.append((log_len, m.group(2), m.group(1)))
        out.append(m.group(1))
        log_len += len(m.group(1))
        i = m.end()
    for j in range(i, len(text)):
        pos_map[j] = log_len
        out.append(text[j])
        log_len += 1
    return "".join(out), mentions, pos_map, link_spans


def _sentence_bounds(logical):
    """按强标点 / 换行 / ≥2 连续空格切句，返回 [(start, end), ...]。"""
    bounds, start = [], 0
    for m in SENT_SPLIT_RE.finditer(logical):
        bounds.append((start, m.start()))
        start = m.end()
    bounds.append((start, len(logical)))
    return bounds


def attribute_message(text, cfg, window_chars=None, ignore_link_texts=None):
    """按股票就近归因板块 / 多空 / 操作。

    返回 {code: {"sectors": [...], "bull": bool, "bear": bool, "actions": [...]}}
    """
    acfg = cfg.get("attribution", {}) or {}
    if window_chars is None:
        window_chars = acfg.get("window_chars", DEFAULT_WINDOW_CHARS)
    if ignore_link_texts is None:
        ignore_link_texts = acfg.get("ignore_link_texts", [])
    ignore = set(ignore_link_texts or [])

    logical, mentions, pos_map, link_spans = _logical_text(text)
    bounds = _sentence_bounds(logical)

    # 链接之外的裸代码也算提及（高置信）
    for m in BARE_CODE_RE.finditer(text):
        if any(s <= m.start() < e for s, e in link_spans):
            continue
        mentions.append((pos_map[m.start()], m.group(1), ""))

    by_code = {}
    for pos, code, link_text in mentions:
        if link_text and link_text in ignore:
            continue
        s0, s1 = 0, len(logical)
        for a, b in bounds:
            if a <= pos <= b:
                s0, s1 = a, b
                break
        win = logical[max(s0, pos - window_chars):min(s1, pos + window_chars)]
        entry = by_code.setdefault(code, {"sectors": set(), "bull": False, "bear": False, "actions": set()})
        entry["sectors"] |= _scan_window(win, cfg.get("sectors", {}))
        sents = _scan_window(win, cfg.get("sentiments", {}))
        entry["bull"] = entry["bull"] or bool(sents & {"看多", "情绪高涨"})
        entry["bear"] = entry["bear"] or bool(sents & {"看空", "情绪低迷"})
        entry["actions"] |= _scan_window(win, cfg.get("actions", {}))

    return {
        code: {
            "sectors": sorted(v["sectors"]),
            "bull": v["bull"],
            "bear": v["bear"],
            "actions": sorted(v["actions"]),
        }
        for code, v in by_code.items()
    }
```

- [ ] **Step 4: 运行测试确认通过**

Run: `python -m pytest tests/test_attribution.py -v`
Expected: PASS（12 passed）

- [ ] **Step 5: 提交**

```bash
git add backend/collector.py tests/test_attribution.py
git commit -m "feat: 新增按股票就近归因引擎 attribute_message"
```

---

### Task 3: `analyze_text` 接入 `by_code`

**Files:**
- Modify: `backend/collector.py:265-296`（`analyze_text`）
- Test: `tests/test_attribution.py`（追加）

**Interfaces:**
- Consumes: `attribute_message`（Task 2）
- Produces: `analyze_text(text, cfg)` 返回值新增 `"by_code"`；`sectors` / `actions` 改为 `_scan_window` 的排序列表（消息级）

- [ ] **Step 1: 写失败的测试**

在 `tests/test_attribution.py` 末尾追加：

```python
def test_analyze_text_exposes_by_code():
    cfg = {"sectors": {"光模块": ["光模块"]}, "sentiments": {"看多": ["看好"]}, "actions": {}}
    text = _link("中际旭创", "300308") + "光模块看好。" + _link("海康威视", "002415") + "正常。"
    r = collector.analyze_text(text, cfg)
    assert r["by_code"]["300308"]["sectors"] == ["光模块"]
    assert r["by_code"]["300308"]["bull"] is True
    assert r["by_code"]["002415"]["sectors"] == []
    assert r["by_code"]["002415"]["bull"] is False


def test_analyze_text_message_level_sectors_dedup_substring():
    cfg = {"sectors": {"消费": ["消费"], "消费电子": ["消费电子"]},
           "sentiments": {}, "actions": {}}
    r = collector.analyze_text("消费电子回暖", cfg)
    assert r["sectors"] == ["消费电子"]
```

- [ ] **Step 2: 运行测试确认失败**

Run: `python -m pytest tests/test_attribution.py -v`
Expected: FAIL —— `KeyError: 'by_code'`；`test_analyze_text_message_level_sectors_dedup_substring` 得到 `["消费", "消费电子"]`。

- [ ] **Step 3: 改写 `analyze_text`**

把 `backend/collector.py` 的 `analyze_text` 整个函数替换为：

```python
def analyze_text(text, cfg):
    """对单条消息做多维度分析（消息级 + 按股票就近归因）"""
    result = {
        "codes": [], "name": "",
        "sectors": [], "sentiments": {}, "actions": [], "by_code": {}
    }

    # 股票代码（同一消息中重复提及同一股票只计一次，保持顺序）
    result["codes"] = list(dict.fromkeys(re.findall(r'\b([36890]\d{5})\b', text)))

    # 股票名称
    names = re.findall(r'\[([^\]]+)\]\(https://wap\.eastmoney\.com/quote/stock/', text)
    if names:
        result["name"] = names[0]

    # 消息级板块 / 操作（供板块热度、整体情绪、ms 使用）
    result["sectors"] = sorted(_scan_window(text, cfg["sectors"]))
    result["actions"] = sorted(_scan_window(text, cfg["actions"]))

    # 情绪（消息级计数，供 sentiment_detail 汇总）
    for sent, keywords in cfg["sentiments"].items():
        matches = [kw for kw in keywords if kw in text]
        if matches:
            result["sentiments"][sent] = len(matches)

    # 按股票就近归因（板块 / 多空 / 操作）
    result["by_code"] = attribute_message(text, cfg)

    return result
```

- [ ] **Step 4: 运行测试确认通过**

Run: `python -m pytest tests/ -v`
Expected: 全部 PASS（含 Task 1/2 与现有 `test_collector.py`）。

- [ ] **Step 5: 提交**

```bash
git add backend/collector.py tests/test_attribution.py
git commit -m "feat: analyze_text 输出按股票归因 by_code"
```

---

### Task 4: `compute_snapshot` 按 code 归因 + `mention_sectors`

**Files:**
- Modify: `backend/collector.py:343-353`（股票聚合）、`:371-374`（板块并集）、`:388-397`（输出）
- Test: `tests/test_attribution.py`（追加）

**Interfaces:**
- Consumes: `analysis["by_code"]`（Task 3）
- Produces: `compute_snapshot` 的 `top10_stocks[].sectors` = 就近所属板块；新增 `top10_stocks[].mention_sectors` = 消息级并集；`top10_stocks[].bull/bear/action_count` 均来自 `by_code`

- [ ] **Step 1: 写失败的测试**

在 `tests/test_attribution.py` 末尾追加：

```python
def test_compute_snapshot_attributes_sectors_per_stock():
    cfg = {"sectors": {"光模块": ["光模块"], "银行": ["银行"]},
           "sentiments": {"看多": ["看好"]}, "actions": {}}
    text = (_link("中际旭创", "300308") + "光模块看好。"
            + _link("农业银行", "601288") + "银行板块。")
    msg = {"message_id": "m1", "create_time": "2026-08-08 10:47", "content": text,
           "_analysis": collector.analyze_text(text, cfg)}
    snap = collector.compute_snapshot({"群A": [msg]}, "2026-08-08 10:47", cfg)

    zj = next(s for s in snap["top10_stocks"] if s["code"] == "300308")
    ny = next(s for s in snap["top10_stocks"] if s["code"] == "601288")
    assert set(zj["sectors"]) == {"光模块"}
    assert set(ny["sectors"]) == {"银行"}
    # 消息关联板块是消息级并集，两只票相同
    assert set(zj["mention_sectors"]) == {"光模块", "银行"}
    assert set(ny["mention_sectors"]) == {"光模块", "银行"}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `python -m pytest tests/test_attribution.py::test_compute_snapshot_attributes_sectors_per_stock -v`
Expected: FAIL —— `KeyError: 'mention_sectors'`；且 `zj["sectors"]` 会包含 `银行`（旧并集行为）。

- [ ] **Step 3: 改股票聚合**

把 `backend/collector.py` 中股票聚合的 `for code in analysis.get("codes", []):` 块（原 `:344-353`）替换为：

```python
            # 股票聚合（板块 / 多空 / 操作按 code 就近归因）
            for code in analysis.get("codes", []):
                bc = analysis.get("by_code", {}).get(code, {})
                stock_data[code].append({
                    "group": grp_name, "time": ct,
                    "name": analysis.get("name", ""),
                    "has_action": bool(bc.get("actions")),
                    "bull": bool(bc.get("bull")),
                    "bear": bool(bc.get("bear")),
                    "text": m.get("content", ""),
                    "sectors": bc.get("sectors", []),
                    "msg_sectors": analysis.get("sectors", []),
                })
```

- [ ] **Step 4: 改板块并集**

把原 `:371-374` 的：

```python
        # 关联板块（复用前面 analyze_text 已识别的板块，避免重复关键词扫描）
        involved_sectors = set()
        for d in details:
            involved_sectors.update(d.get("sectors", []))
```

替换为：

```python
        # 所属板块（就近）与消息关联板块（消息级并集）
        involved_sectors = set()
        mention_sectors = set()
        for d in details:
            involved_sectors.update(d.get("sectors", []))
            mention_sectors.update(d.get("msg_sectors", []))
```

- [ ] **Step 5: 改输出字段**

把原 `:388-397` 的输出字典里 `"sectors": sorted(involved_sectors),` 替换为：

```python
            "sectors": sorted(involved_sectors),
            "mention_sectors": sorted(mention_sectors),
```

- [ ] **Step 6: 运行测试确认通过**

Run: `python -m pytest tests/ -v`
Expected: 全部 PASS。

- [ ] **Step 7: 提交**

```bash
git add backend/collector.py tests/test_attribution.py
git commit -m "feat: compute_snapshot 按股票就近归因并输出消息关联板块"
```

---

### Task 5: API 映射 `ms` 字段

**Files:**
- Modify: `backend/data_store.py:48`
- Test: `tests/test_attribution.py`（追加）

**Interfaces:**
- Consumes: `top10_stocks[].mention_sectors`（Task 4）
- Produces: 压缩后 `stk[].ms: string[]`（老 day 文件缺省为 `[]`）

- [ ] **Step 1: 写失败的测试**

在 `tests/test_attribution.py` 末尾追加：

```python
def test_compress_snapshot_exposes_ms():
    from backend.data_store import _compress_snapshot
    raw = {
        "top10_stocks": [{
            "code": "300308", "name": "中际旭创", "score": 10,
            "mention_count": 1, "group_count": 1, "action_count": 0,
            "bull": 1, "bear": 0, "sectors": ["光模块"],
            "mention_sectors": ["光模块", "银行"],
            "first_time": "2026-08-08 10:00", "last_time": "2026-08-08 10:00",
        }],
        "top8_sectors": [],
    }
    out = _compress_snapshot(raw, {"300308": "中际旭创"})
    stk = out["stk"][0]
    assert stk["sec"] == ["光模块"]
    assert stk["ms"] == ["光模块", "银行"]


def test_compress_snapshot_ms_defaults_empty():
    from backend.data_store import _compress_snapshot
    raw = {
        "top10_stocks": [{
            "code": "300308", "name": "中际旭创", "score": 10,
            "mention_count": 1, "group_count": 1, "action_count": 0,
            "bull": 1, "bear": 0, "sectors": ["光模块"],
            "first_time": "2026-08-08 10:00", "last_time": "2026-08-08 10:00",
        }],
        "top8_sectors": [],
    }
    out = _compress_snapshot(raw, {"300308": "中际旭创"})
    assert out["stk"][0]["ms"] == []
```

- [ ] **Step 2: 运行测试确认失败**

Run: `python -m pytest tests/test_attribution.py -k compress -v`
Expected: FAIL —— `KeyError: 'ms'`。

- [ ] **Step 3: 加字段**

把 `backend/data_store.py:48` 的：

```python
            "sec": sectors, "s": sectors,
```

替换为：

```python
            "sec": sectors, "s": sectors,
            "ms": t.get("mention_sectors", []),
```

- [ ] **Step 4: 运行测试确认通过**

Run: `python -m pytest tests/ -v`
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add backend/data_store.py tests/test_attribution.py
git commit -m "feat: API 暴露消息关联板块 ms 字段"
```

---

### Task 6: 前端类型与聚合

**Files:**
- Modify: `src/types/api.ts:11-23`、`src/lib/aggregate.ts:12,23`
- Test: `npm run build`（无前端测试框架，以 tsc 类型检查为准）

**Interfaces:**
- Consumes: API `stk[].sec`、`stk[].ms`
- Produces: `StockItem.ms?: string[]`；`aggregateSnapshots` 合并时 `ms` 并集

- [ ] **Step 1: 加类型字段**

把 `src/types/api.ts` 的 `StockItem` 尾部：

```ts
  sec: string[]; // 关联板块
}
```

替换为：

```ts
  sec: string[]; // 所属板块（按股票就近归因）
  ms?: string[]; // 消息关联板块（该消息整体涉及的题材，消息级并集）
}
```

- [ ] **Step 2: 聚合时并集 `ms`**

把 `src/lib/aggregate.ts:12`：

```ts
        map.set(stk.c, { ...stk, sec: [...(stk.sec ?? [])] });
```

替换为：

```ts
        map.set(stk.c, { ...stk, sec: [...(stk.sec ?? [])], ms: [...(stk.ms ?? [])] });
```

在 `src/lib/aggregate.ts:23` 的 `cur.sec = ...` 下一行追加：

```ts
      cur.ms = Array.from(new Set([...(cur.ms ?? []), ...(stk.ms ?? [])]));
```

- [ ] **Step 3: 类型检查**

Run: `npm run build`
Expected: 构建成功（`tsc -b` 无错误）。

- [ ] **Step 4: 提交**

```bash
git add src/types/api.ts src/lib/aggregate.ts
git commit -m "feat: 前端 StockItem 增加消息关联板块 ms"
```

---

### Task 7: 详情页拆分"所属板块"与"消息关联板块"

**Files:**
- Modify: `src/pages/StockDetail.tsx:389-458`（`RelatedSectors`）、`:810`（调用处）
- Test: `npm run build` + 浏览器手动验证

**Interfaces:**
- Consumes: `stock.sec`、`stock.ms`（Task 6）
- Produces: `RelatedSectors({ sectors, mentionSectors })`

- [ ] **Step 1: 改组件签名与标题**

把 `src/pages/StockDetail.tsx:389`：

```tsx
function RelatedSectors({ sectors }: { sectors: string[] }) {
```

替换为：

```tsx
function RelatedSectors({ sectors, mentionSectors }: { sectors: string[]; mentionSectors: string[] }) {
```

把 `:414` 的标题：

```tsx
        关联板块
```

替换为：

```tsx
        所属板块
```

- [ ] **Step 2: 在列表后追加"消息关联板块"**

把 `:455` 的 `</div>`（`sectorData.map` 外层 `space-y-3` 的收尾）之前插入：

```tsx
        {mentionSectors.length > 0 && (
          <div className="pt-3 mt-1 border-t border-hairline/10">
            <p className="text-xs text-ink-tertiary mb-2">消息关联板块（该消息整体涉及的题材）</p>
            <div className="flex flex-wrap gap-2">
              {mentionSectors.map((s) => (
                <span
                  key={s}
                  className="px-2.5 py-1 rounded-md bg-surface-2 text-ink-secondary text-xs font-medium border border-hairline/10"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}
```

- [ ] **Step 3: 改调用处**

把 `src/pages/StockDetail.tsx:810`：

```tsx
        <RelatedSectors sectors={stock.sec} />
```

替换为：

```tsx
        <RelatedSectors sectors={stock.sec} mentionSectors={stock.ms ?? []} />
```

- [ ] **Step 4: 类型检查 + 构建**

Run: `npm run build`
Expected: 构建成功。

- [ ] **Step 5: 浏览器手动验证**

Run: `npm run dev`（另开一个终端），浏览器打开股票详情页（如 `/#/stock/002415` 对应海康威视）：
- 头部标签与"所属板块"应**不含** `银行`（B2 修复）。
- 若该股所在消息整体聊了多个题材，"消息关联板块"区块应出现且与"所属板块"不同。
- 老 day 文件（无 `ms`）不报错，区块不渲染。

- [ ] **Step 6: 提交**

```bash
git add src/pages/StockDetail.tsx
git commit -m "feat: 详情页拆分所属板块与消息关联板块"
```

---

### Task 8: 历史重算脚本 `scripts/recompute.py`

**Files:**
- Create: `scripts/recompute.py`
- Test: `tests/test_attribution.py`（追加）

**Interfaces:**
- Consumes: `load_cache`、`analyze_text`、`compute_snapshot`、`_build_windows`、`extract_image_text`（`backend/collector.py`）、`backend.jsonio.dump_path`
- Produces:
  - `build_all_analyzed(cache: dict, cfg: dict, date_str: str) -> dict`
  - `recompute_day(date_str: str, cache: dict, cfg: dict, data_dir: Path, dry_run: bool = False) -> dict`
  - CLI：`python3 scripts/recompute.py 2026-06-05 [--dry-run]` / `--all`

- [ ] **Step 1: 写失败的测试**

在 `tests/test_attribution.py` 末尾追加：

```python
def test_recompute_day_from_cache(tmp_path):
    from scripts.recompute import recompute_day
    cfg = {
        "groups": [{"name": "群A", "chat_id": "chat_a"}],
        "sectors": {"光模块": ["光模块"]},
        "sentiments": {}, "actions": {},
        "attribution": {"window_chars": 30, "ignore_link_texts": []},
    }
    cache = {
        "chat_a": {
            "m1": {
                "message_id": "m1", "msg_type": "text",
                "create_time": "2026-08-08 10:47",
                "content": _link("中际旭创", "300308") + "光模块",
            }
        }
    }
    day = recompute_day("2026-08-08", cache, cfg, tmp_path, dry_run=True)
    assert day["total_msgs"] == 1
    assert day["snapshots"], "应生成快照"
    stk = next(s for s in day["snapshots"][-1]["top10_stocks"] if s["code"] == "300308")
    assert stk["sectors"] == ["光模块"]
    assert stk["mention_sectors"] == ["光模块"]


def test_recompute_day_writes_file(tmp_path):
    from scripts.recompute import recompute_day
    cfg = {
        "groups": [{"name": "群A", "chat_id": "chat_a"}],
        "sectors": {"光模块": ["光模块"]},
        "sentiments": {}, "actions": {},
        "attribution": {"window_chars": 30, "ignore_link_texts": []},
    }
    cache = {"chat_a": {"m1": {
        "message_id": "m1", "msg_type": "text",
        "create_time": "2026-08-08 10:47",
        "content": _link("中际旭创", "300308") + "光模块",
    }}}
    recompute_day("2026-08-08", cache, cfg, tmp_path, dry_run=False)
    assert (tmp_path / "day_2026-08-08.json").exists()
```

- [ ] **Step 2: 运行测试确认失败**

Run: `python -m pytest tests/test_attribution.py -k recompute -v`
Expected: FAIL —— `ModuleNotFoundError: No module named 'scripts.recompute'`。

- [ ] **Step 3: 创建脚本**

新建 `scripts/recompute.py`：

```python
#!/usr/bin/env python3
"""按 msg_cache.json 重算历史 day 文件（新归因语义）。

用法：
  python3 scripts/recompute.py 2026-06-05            # 单日
  python3 scripts/recompute.py 2026-06-05 --dry-run  # 只统计不写盘
  python3 scripts/recompute.py --all                 # 缓存覆盖的全部日期
"""
import argparse
import os
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.collector import (
    _build_windows, analyze_text, compute_snapshot, extract_image_text, load_cache, load_config,
)
from backend.jsonio import dump_path


def build_all_analyzed(cache, cfg, date_str):
    """从 msg_cache 重建 {群名: [带新 _analysis 的当日消息]}。"""
    chat_to_group = {g["chat_id"]: g["name"] for g in cfg["groups"]}
    all_analyzed = defaultdict(list)
    for chat_id, msgs in cache.items():
        grp_name = chat_to_group.get(chat_id, chat_id)
        for m in msgs.values():
            if not m.get("create_time", "").startswith(date_str):
                continue
            text = m.get("content", "")
            if m.get("msg_type") == "image" and text and "[图片OCR]" not in text:
                ocr = extract_image_text(m)
                if ocr:
                    text = f"[图片OCR]{ocr}[/图片OCR]"
            if not text:
                continue
            all_analyzed[grp_name].append({**m, "content": text, "_analysis": analyze_text(text, cfg)})
    return dict(all_analyzed)


def recompute_day(date_str, cache, cfg, data_dir, dry_run=False):
    """重算单日。返回 day_data；dry_run 时不写盘。"""
    all_analyzed = build_all_analyzed(cache, cfg, date_str)
    total = sum(len(v) for v in all_analyzed.values())
    snapshots = [compute_snapshot(all_analyzed, w, cfg) for w in _build_windows(date_str)]
    day_data = {"date": date_str, "total_msgs": total, "snapshots": snapshots}
    if not dry_run:
        data_dir = Path(data_dir)
        data_dir.mkdir(parents=True, exist_ok=True)
        dump_path(day_data, data_dir / f"day_{date_str}.json", indent=True)
    return day_data


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("date", nargs="?", help="YYYY-MM-DD")
    parser.add_argument("--all", action="store_true", help="重算缓存覆盖的全部日期")
    parser.add_argument("--dry-run", action="store_true", help="只统计不写盘")
    args = parser.parse_args()

    cfg = load_config()
    data_dir = Path(cfg["server"]["data_dir"])
    cache = load_cache(data_dir)

    if args.all:
        dates = sorted({m.get("create_time", "")[:10]
                        for msgs in cache.values() for m in msgs.values()
                        if m.get("create_time")})
    elif args.date:
        dates = [args.date]
    else:
        parser.error("需要日期参数或 --all")
        return

    for d in dates:
        day = recompute_day(d, cache, cfg, data_dir, dry_run=args.dry_run)
        stocks = day["snapshots"][-1]["top10_stocks"] if day["snapshots"] else []
        print(f"{d} 消息{day['total_msgs']} 快照{len(day['snapshots'])} 股票{len(stocks)}"
              + ("（dry-run，未写盘）" if args.dry_run else ""))


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: 运行测试确认通过**

Run: `python -m pytest tests/test_attribution.py -k recompute -v`
Expected: PASS（2 passed）

- [ ] **Step 5: 提交**

```bash
git add scripts/recompute.py tests/test_attribution.py
git commit -m "feat: 新增历史 day 文件重算脚本"
```

---

### Task 9: 全量回归与上线前置校验

**Files:**
- 无代码改动（验证任务）
- 可能产出：`data/day_<date>.json`（重算后）

**Interfaces:**
- Consumes: 前 8 个任务
- Produces: 上线前的一份校验记录

- [ ] **Step 1: 后端全量测试**

Run: `python -m pytest tests/ -v`
Expected: 全部 PASS。

- [ ] **Step 2: 前端构建**

Run: `npm run build`
Expected: 成功，无 TS 错误。

- [ ] **Step 3: 本地重算 dry-run**

Run: `python3 scripts/recompute.py --all --dry-run`
Expected: 逐日打印"消息N 快照M 股票K"，无异常。记录覆盖到的日期范围。

- [ ] **Step 4: 远端缓存前置校验**

在远端（47.253.54.6）确认 `msg_cache.json` 是否仍保留全部原始消息：

```bash
ssh <remote> 'python3 -c "import json;d=json.load(open(\"data/msg_cache.json\"));print({k:len(v) for k,v in d.items()})"'
```

判断：若远端缓存覆盖目标日期且消息数明显多于本地这份（本地仅 6/03–7/08、5 个群），则可对目标日期重算；否则**只前向生效**，不重算历史。

- [ ] **Step 5: 记录并提交验证结论**

把 Step 3/4 的日期范围与结论写进本计划末尾的"执行记录"小节，提交：

```bash
git add docs/superpowers/plans/2026-09-08-attribution-contamination.md
git commit -m "docs: 记录归因修复的回归与重算校验结果"
```

---

## 执行记录

（执行时填写 Step 3/4 的日期范围与结论）
