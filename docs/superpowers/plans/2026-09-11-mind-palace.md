# 大V 观点宫殿（Mind Palace）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 25 个付费炒股群的群聊沉淀成双向观点知识库——大V → 股票 → 观点，股票 → 大V → 观点。

**Architecture:** 追加式档案层（`data/archive/<chat_id>.jsonl`）作为唯一真相源，采集时顺带写入、`lark-cli` 回补历史；抽取层复用现有 `analyze_text()` 派生观点行；索引层预计算每群画像与每票跨群汇总；`PalaceStore` 提供只读查询，经 5 个 GET 端点供给前端两个新页面 + 个股页新增区块。

**Tech Stack:** Python 3 / FastAPI / pytest（后端）；React 19 + TypeScript + Vite + Tailwind 3 + react-router-dom 7 + framer-motion + vitest（前端）。**不引入任何新依赖。**

**Spec:** `docs/superpowers/specs/2026-09-11-mind-palace-design.md`

## Global Constraints

- **本机没有 `python` 命令**，一律用 `python3`。测试命令：`python3 -m pytest`。
- **不引入 LLM**：风格画像纯规则；`ai_summary` 恒为 `null`，前端为空时不渲染。
- **不加新依赖**：后端只用已有 stdlib + fastapi + pyyaml；前端只用已有 react/react-router-dom/framer-motion/lucide-react/tailwind。**不新增 npm 包，不新增 pip 包。**
- **只做现有 25 个群**（`config/settings.yaml` 的 `groups`），不扩群。
- **不改实时快照管线**：`day_*.json`、Top10、看板既有各页行为一律不变。对既有代码的改动只有三处，且都是追加式：`collector` 顺带写档案、`server` 挂新路由、前端 `StockDetail` 加区块 + `App`/`Navbar` 加入口。
- **归档与索引目录必须放子目录**：`data/archive/`、`data/palace/`。`cleanup_old_files()` 只 glob `data_dir/day_*.json`（非递归），子目录天然不受 `retention_days` 影响——**不要**把归档文件平铺进 `data/`。
- **JSON 读写**：结构化 JSON 用 `backend/jsonio.py` 的 `load_path` / `dump_path(..., indent=True)`（原子写）。JSONL 追加用普通 `open(path,"a",encoding="utf-8")` + 每行 `json.dumps(..., ensure_ascii=False)`。
- **所有日志用 `logger = logging.getLogger(__name__)`**，中文消息，f-string 风格。
- **前端交互契约（spec §9.5，对每个新页面生效）**：可点控件一律 `<button>`/`<Link>` 不用 div；排序按钮 `aria-pressed`，表头排序 `aria-sort`，表格选中行 `aria-current`；选中态与视图状态写进 URL；搜索框必须有 `<label>`；多空同时给数字与文字、不只靠颜色；数字用 `tabular-nums`；Tab 可达 + `focus-visible` 焦点环；状态正确性不依赖 `animationend`；次级文字对比度 ≥4.5:1（用 `text-ink-tertiary`，不要用更暗的 `text-ink-quaternary` 承载正文）；≤1000px 表格去掉「多空」「最近」两列，不做横向滚动。
- **前端状态覆盖（spec §9.6）**：加载中（骨架屏 + `role="status"`）、搜索无结果（说明原因 + 替代出口）、数据缺失/断更（降级卡片、排序沉底、不可点入）、覆盖空洞（顶部如实显示 `missing_days`）——四个都要有。
- **共享同一份类型定义**：前端 `src/types/api.ts` 里的字段名必须与后端返回的 JSON 键逐字一致。

## 文件结构

**新增（后端）**

| 文件 | 职责 |
|---|---|
| `backend/palace_archive.py` | 档案层：JSONL 追加/读取、id 去重、回补断点状态文件。纯 stdlib，**不 import collector**（避免循环依赖） |
| `backend/palace_backfill.py` | 回补：`lark-cli` 翻页、跳过已覆盖的群、逐群统计。依赖 `palace_archive` + subprocess |
| `backend/palace_build.py` | 写路径：抽取观点 → 统计画像 → 生成两个索引 |
| `backend/palace.py` | 读路径：`PalaceStore`，索引常驻内存 + 单群观点 LRU 懒加载 |
| `scripts/backfill.py` | CLI：薄壳，解析参数后调 `palace_backfill` |
| `scripts/build_palace.py` | CLI：薄壳，调 `palace_build` |
| `scripts/palace_daily.sh` | 每日收盘后跑一次 `build_palace.py`（供云端 crontab） |

> 与 spec 的差异：spec §3 只列了 `backend/palace.py`。这里按职责拆成 4 个模块，因为「档案格式」「翻页抓取」「派生计算」「查询服务」四件事的依赖方向和测试方式完全不同（抽取层要 import `analyzer`，档案层不能）。spec 的 API 与数据模型不变。

**新增（前端）**

| 文件 | 职责 |
|---|---|
| `src/lib/palace.ts` | 纯函数：群名拆分、断更判定、排序、过滤、共享 class 常量。**不 import React**，供 vitest 直接测 |
| `src/pages/Kols.tsx` | `/kols` 卡片墙 |
| `src/pages/KolDetail.tsx` | `/kol/:chatId` 与 `/kol/:chatId/:code` |

**修改**

| 文件 | 改动 |
|---|---|
| `backend/collector.py` | `collect_live` 的 `_fetch_one` 内追加档案（try/except 包裹，失败只 warning） |
| `backend/server.py` | 实例化 `PalaceStore`、startup 里 `palace.startup()`、5 个 GET 端点、`_CACHE_POLICIES` 加 `palace` |
| `config/settings.yaml` | 新增 `palace:` 段（画风词表、top_n、盘中时段、lru_groups） |
| `src/types/api.ts` | Palace 相关类型 |
| `src/lib/api.ts` | 5 个 fetch 包装 |
| `src/pages/StockDetail.tsx` | 底部追加 `PalaceStockSection` |
| `src/components/Navbar.tsx` | `navItems` 加「大V」；**修正 active 判定**（现在 `/stock/:code` 从不亮） |
| `src/App.tsx` | 3 条新路由 |

---

### Task 1: 档案层

**Files:**
- Create: `backend/palace_archive.py`
- Test: `tests/test_palace_archive.py`

**Interfaces:**
- Consumes: `backend.jsonio.load_path` / `dump_path`
- Produces:
  - `archive_dir(data_dir) -> Path`
  - `archive_path(data_dir, chat_id) -> Path`
  - `iter_jsonl(path) -> Iterator[dict]`（跳过空行与损坏行）
  - `load_ids(data_dir, chat_id) -> set[str]`
  - `append_messages(data_dir, chat_id, group_name, messages, known_ids=None) -> int`
  - `iter_messages(data_dir, chat_id) -> Iterator[dict]`
  - `load_state(data_dir) -> dict` / `save_state(data_dir, state) -> None`

- [ ] **Step 1: 写失败的测试**

创建 `tests/test_palace_archive.py`：

```python
"""档案层：追加、去重、断点状态"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.palace_archive import (
    append_messages, archive_path, iter_messages, load_ids, load_state, save_state,
)


def _msg(mid, ts="2026-07-06 08:09", text="江波龙看多", sender="ou_aaa"):
    return {
        "message_id": mid,
        "create_time": ts,
        "content": text,
        "msg_type": "text",
        "sender": {"id": sender, "id_type": "open_id", "sender_type": "user"},
    }


def test_append_writes_one_jsonl_row_per_message(tmp_path):
    n = append_messages(tmp_path, "oc_1", "253_橙子不糊涂", [_msg("om_1")])

    assert n == 1
    lines = archive_path(tmp_path, "oc_1").read_text(encoding="utf-8").strip().split("\n")
    assert len(lines) == 1


def test_append_dedupes_by_message_id(tmp_path):
    append_messages(tmp_path, "oc_1", "253_橙子不糊涂", [_msg("om_1")])
    n = append_messages(tmp_path, "oc_1", "253_橙子不糊涂", [_msg("om_1"), _msg("om_2")])

    assert n == 1, "重复的 om_1 不应再写一次"
    assert load_ids(tmp_path, "oc_1") == {"om_1", "om_2"}


def test_append_stores_sender_id_string_not_dict(tmp_path):
    append_messages(tmp_path, "oc_1", "253_橙子不糊涂", [_msg("om_1", sender="ou_bbb")])

    row = next(iter_messages(tmp_path, "oc_1"))
    assert row["sender"] == "ou_bbb"
    assert row["group"] == "253_橙子不糊涂"
    assert row["ts"] == "2026-07-06 08:09"


def test_append_skips_message_without_id(tmp_path):
    n = append_messages(tmp_path, "oc_1", "253_橙子不糊涂", [{"content": "无 id"}])

    assert n == 0
    assert load_ids(tmp_path, "oc_1") == set()


def test_known_ids_is_updated_in_place(tmp_path):
    known = load_ids(tmp_path, "oc_1")
    append_messages(tmp_path, "oc_1", "253_橙子不糊涂", [_msg("om_1")], known_ids=known)

    assert known == {"om_1"}


def test_iter_messages_skips_corrupt_line(tmp_path):
    path = archive_path(tmp_path, "oc_1")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text('{"id":"om_1","ts":"t","text":"好"}\n不是JSON\n', encoding="utf-8")

    rows = list(iter_messages(tmp_path, "oc_1"))
    assert len(rows) == 1
    assert rows[0]["id"] == "om_1"


def test_state_roundtrip(tmp_path):
    assert load_state(tmp_path) == {}
    save_state(tmp_path, {"oc_1": {"earliest_ts": "2026-06-05", "updated_at": "2026-09-11"}})

    assert load_state(tmp_path)["oc_1"]["earliest_ts"] == "2026-06-05"


def test_iter_messages_on_missing_file_yields_nothing(tmp_path):
    assert list(iter_messages(tmp_path, "oc_nope")) == []
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python3 -m pytest tests/test_palace_archive.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'backend.palace_archive'`

- [ ] **Step 3: 写实现**

创建 `backend/palace_archive.py`：

```python
"""大V 观点宫殿 —— 档案层（追加式真相源）。

每个群一个 JSONL 文件，一行一条消息。只追加、只去重，不做过滤与改写。
归档目录是 data/ 的子目录，而 cleanup_old_files() 只 glob data_dir/day_*.json
（非递归），因此归档不受 retention_days 清理影响。
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

from backend.jsonio import dump_path, load_path

logger = logging.getLogger(__name__)

ARCHIVE_DIRNAME = "archive"
STATE_FILENAME = ".state.json"


def archive_dir(data_dir) -> Path:
    """归档目录（data/archive/）。"""
    return Path(data_dir) / ARCHIVE_DIRNAME


def archive_path(data_dir, chat_id: str) -> Path:
    """单群档案文件（data/archive/<chat_id>.jsonl）。"""
    return archive_dir(data_dir) / f"{chat_id}.jsonl"


def iter_jsonl(path: Path):
    """逐行迭代 JSONL，跳过空行与损坏行。文件不存在时什么都不 yield。"""
    path = Path(path)
    if not path.exists():
        return
    with open(path, encoding="utf-8") as f:
        for lineno, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                yield json.loads(line)
            except ValueError:
                logger.warning(f"JSONL 损坏行已跳过: {path.name}:{lineno}")


def load_ids(data_dir, chat_id: str) -> set[str]:
    """该群已归档的全部 message_id，用于去重。"""
    return {row["id"] for row in iter_jsonl(archive_path(data_dir, chat_id)) if row.get("id")}


def append_messages(data_dir, chat_id: str, group_name: str,
                    messages: list[dict], known_ids: set[str] | None = None) -> int:
    """把 lark-cli 原始消息追加进档案，返回实际写入条数。

    ``known_ids`` 传入时复用它做去重（并在写入后就地更新），避免回补翻页时
    每页都重读整个文件；不传则从磁盘读一次。

    字段映射：id ← message_id（回落 msg_id）、ts ← create_time、
    text ← content、sender ← sender.id（lark-cli 的 sender 是对象，不是字符串）。
    id 缺失或已存在的消息跳过。
    """
    path = archive_path(data_dir, chat_id)
    existing = known_ids if known_ids is not None else load_ids(data_dir, chat_id)

    rows = []
    for m in messages:
        mid = m.get("message_id") or m.get("msg_id")
        if not mid or mid in existing:
            continue
        existing.add(mid)
        rows.append({
            "id": mid,
            "ts": m.get("create_time", ""),
            "group": group_name,
            "sender": (m.get("sender") or {}).get("id", "") if isinstance(m.get("sender"), dict) else "",
            "text": m.get("content", ""),
        })

    if not rows:
        return 0
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    return len(rows)


def iter_messages(data_dir, chat_id: str):
    """逐行迭代该群档案。"""
    return iter_jsonl(archive_path(data_dir, chat_id))


def load_state(data_dir) -> dict:
    """回补断点状态：{chat_id: {"earliest_ts": ..., "updated_at": ...}}。"""
    path = archive_dir(data_dir) / STATE_FILENAME
    if not path.exists():
        return {}
    try:
        return load_path(path) or {}
    except Exception as e:
        logger.warning(f"回补状态文件读取失败，按空处理: {e}")
        return {}


def save_state(data_dir, state: dict) -> None:
    """原子写回补断点状态。"""
    dump_path(state, archive_dir(data_dir) / STATE_FILENAME, indent=True)
```

- [ ] **Step 4: 跑测试确认通过**

Run: `python3 -m pytest tests/test_palace_archive.py -v`
Expected: PASS（8 passed）

- [ ] **Step 5: 提交**

```bash
git add backend/palace_archive.py tests/test_palace_archive.py
git commit -m "feat(palace): 档案层——追加式 JSONL 归档与 id 去重"
```

---

### Task 2: 回补（lark-cli 翻页 + 断点）

**Files:**
- Create: `backend/palace_backfill.py`, `scripts/backfill.py`
- Test: `tests/test_palace_backfill.py`

**Interfaces:**
- Consumes: `palace_archive`（`append_messages` / `load_ids` / `load_state` / `save_state`）
- Produces:
  - `fetch_page(chat_id, page_token=None, page_size=50, timeout=25) -> tuple[list[dict], str | None, bool]`
  - `backfill_group(chat_id, group_name, since, data_dir, max_pages=200, page_size=50, fetch=None, sleep=0.15) -> dict`（返回 `{"added": int, "earliest": str}`）
  - `resolve_groups(cfg, selector) -> list[dict]`（`selector` 为 `all` 或群名/chat_id 子串）

> ⚠️ **本任务的真实回补必须在云端机器上跑**（`lark-cli` 只在云端可用，本地未安装）。本地只跑 mock 测试。

- [ ] **Step 1: 写失败的测试**

创建 `tests/test_palace_backfill.py`：

```python
"""回补：翻页、越过 since 停止、跳过已覆盖的群"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.palace_archive import archive_path, load_ids, load_state, save_state
from backend.palace_backfill import backfill_group, resolve_groups


def _msg(mid, day, time="08:09"):
    return {"message_id": mid, "create_time": f"{day} {time}", "content": f"{mid} 看多 江波龙"}


def _pager(pages):
    """把 [[msg,...], ...] 变成一个假的 fetch(chat_id, token, page_size) 函数。"""
    calls = {"n": 0}

    def fetch(chat_id, page_token=None, page_size=50):
        i = calls["n"]
        calls["n"] += 1
        if i >= len(pages):
            return [], None, False
        return pages[i], (f"tok{i+1}" if i + 1 < len(pages) else None), i + 1 < len(pages)

    fetch.calls = calls
    return fetch


def test_backfill_walks_pages_and_archives_in_range_messages(tmp_path):
    pages = [
        [_msg("om_3", "2026-07-08"), _msg("om_2", "2026-07-07")],
        [_msg("om_1", "2026-07-05")],
    ]
    result = backfill_group("oc_1", "253_橙子不糊涂", "2026-07-01",
                            tmp_path, fetch=_pager(pages), sleep=0)

    assert load_ids(tmp_path, "oc_1") == {"om_1", "om_2", "om_3"}
    assert result["added"] == 3
    assert result["earliest"] == "2026-07-05 08:09"


def test_backfill_stops_after_passing_since(tmp_path):
    # 第二页已经越过 since（06-30 < 07-01），不应再请求第三页
    pages = [
        [_msg("om_3", "2026-07-08")],
        [_msg("om_1", "2026-06-30")],
        [_msg("om_0", "2026-06-01")],
    ]
    fetch = _pager(pages)
    backfill_group("oc_1", "群", "2026-07-01", tmp_path, fetch=fetch, sleep=0)

    assert fetch.calls["n"] == 2, "越过 since 后必须停止翻页"
    assert "om_0" not in load_ids(tmp_path, "oc_1")


def test_backfill_skips_messages_older_than_since(tmp_path):
    pages = [[_msg("om_3", "2026-07-08"), _msg("om_old", "2026-05-01")]]
    backfill_group("oc_1", "群", "2026-07-01", tmp_path, fetch=_pager(pages), sleep=0)

    assert load_ids(tmp_path, "oc_1") == {"om_3"}


def test_backfill_is_idempotent(tmp_path):
    pages = [[_msg("om_1", "2026-07-08")]]
    backfill_group("oc_1", "群", "2026-07-01", tmp_path, fetch=_pager(pages), sleep=0)
    second = backfill_group("oc_1", "群", "2026-07-01", tmp_path, fetch=_pager(pages), sleep=0)

    assert second["added"] == 0
    lines = archive_path(tmp_path, "oc_1").read_text(encoding="utf-8").strip().split("\n")
    assert len(lines) == 1


def test_backfill_stops_when_has_more_is_false(tmp_path):
    pages = [[_msg("om_1", "2026-07-08")]]
    fetch = _pager(pages)
    backfill_group("oc_1", "群", "2026-01-01", tmp_path, fetch=fetch, sleep=0)

    assert fetch.calls["n"] == 1, "首页 has_more=false 即终止，不该再请求下一页"


def test_backfill_respects_max_pages(tmp_path):
    pages = [[_msg(f"om_{i}", "2026-07-08")] for i in range(5)]
    fetch = _pager(pages)
    backfill_group("oc_1", "群", "2026-01-01", tmp_path, fetch=fetch, max_pages=2, sleep=0)

    assert fetch.calls["n"] == 2


def test_backfill_records_state(tmp_path):
    pages = [[_msg("om_1", "2026-07-08")]]
    backfill_group("oc_1", "群", "2026-07-01", tmp_path, fetch=_pager(pages), sleep=0)

    state = load_state(tmp_path)
    assert state["oc_1"]["earliest_ts"] == "2026-07-08 08:09"


def test_resolve_groups_by_name_and_all():
    cfg = {"groups": [
        {"chat_id": "oc_1", "name": "001_震哥仅ls"},
        {"chat_id": "oc_2", "name": "253_橙子不糊涂"},
    ]}

    assert len(resolve_groups(cfg, "all")) == 2
    assert [g["chat_id"] for g in resolve_groups(cfg, "253")] == ["oc_2"]
    assert [g["chat_id"] for g in resolve_groups(cfg, "oc_1")] == ["oc_1"]
    assert resolve_groups(cfg, "不存在") == []
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python3 -m pytest tests/test_palace_backfill.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'backend.palace_backfill'`

- [ ] **Step 3: 写实现**

创建 `backend/palace_backfill.py`：

```python
"""大V 观点宫殿 —— 回补：用 lark-cli 把历史群消息翻进档案层。

从最新往回翻（--sort desc），直到越过 --since 或 has_more=false。
重复消息由 archive 层按 message_id 去重，所以重复跑是安全的。
"""

from __future__ import annotations

import json
import logging
import subprocess
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path

from backend.palace_archive import append_messages, load_ids, load_state, save_state

logger = logging.getLogger(__name__)

CST = timezone(timedelta(hours=8))
DEFAULT_PAGE_SIZE = 50


def fetch_page(chat_id: str, page_token: str | None = None,
               page_size: int = DEFAULT_PAGE_SIZE, timeout: int = 25):
    """抓一页消息。返回 (messages, next_token, has_more)。

    与 collector.fetch_messages_incremental 用同一条 lark-cli 命令，
    区别是这里拿 page_token 逐页往前翻，而不是只抓最近几页。
    """
    cmd = [
        "lark-cli", "im", "+chat-messages-list",
        "--chat-id", chat_id, "--page-size", str(page_size),
        "--sort", "desc", "--format", "json",
    ]
    if page_token:
        cmd.extend(["--page-token", page_token])

    r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if r.returncode != 0:
        raise RuntimeError(f"lark-cli 退出码 {r.returncode}: {(r.stderr or '').strip()[:200]}")

    payload = json.loads(r.stdout)
    data = payload.get("data") or {}
    return (
        data.get("messages") or [],
        data.get("page_token"),
        bool(data.get("has_more")),
    )


def _day_of(ts: str) -> str:
    """'2026-07-06 08:09' -> '2026-07-06'；空值给一个必然 >= since 的哨兵。"""
    return ts[:10] if ts else "9999-99-99"


def backfill_group(chat_id: str, group_name: str, since: str, data_dir,
                   max_pages: int = 200, page_size: int = DEFAULT_PAGE_SIZE,
                   fetch=None, sleep: float = 0.15) -> dict:
    """回补单群。返回 {"added": int, "earliest": str}。单群失败由调用方兜底。"""
    fetch = fetch or fetch_page
    known = load_ids(data_dir, chat_id)
    added = 0
    earliest = ""
    token = None

    for _ in range(max_pages):
        messages, next_token, has_more = fetch(chat_id, token, page_size)
        if not messages:
            break

        fresh = [m for m in messages if _day_of(m.get("create_time", "")) >= since]
        if fresh:
            added += append_messages(data_dir, chat_id, group_name, fresh, known_ids=known)

        stamps = [m.get("create_time", "") for m in messages if m.get("create_time")]
        if stamps:
            page_earliest = min(stamps)
            earliest = page_earliest if not earliest else min(earliest, page_earliest)
            if any(s[:10] < since for s in stamps):
                break

        if not has_more or not next_token:
            break
        token = next_token
        time.sleep(sleep)

    # 记断点：只在真的翻到了消息、且比上次记录的更早时才写。
    # 「一条都没翻到」不记 —— 否则下次会被当成已覆盖而跳过。
    if earliest:
        state = load_state(data_dir)
        prev = (state.get(chat_id) or {}).get("earliest_ts", "")
        if not prev or earliest < prev:
            state[chat_id] = {
                "earliest_ts": earliest,
                "updated_at": datetime.now(CST).strftime("%Y-%m-%d %H:%M"),
            }
            save_state(data_dir, state)

    return {"added": added, "earliest": earliest}


def resolve_groups(cfg: dict, selector: str) -> list[dict]:
    """selector 为 'all' 返回全部群，否则按 chat_id / 群名子串匹配。"""
    groups = cfg.get("groups") or []
    if selector == "all":
        return list(groups)
    return [g for g in groups if selector in g.get("chat_id", "") or selector in g.get("name", "")]


def run_backfill(cfg: dict, selector: str, since: str, data_dir,
                 max_pages: int = 200, force: bool = False) -> dict:
    """按群回补。返回 {群名: {...}} 汇总。

    已覆盖到 since 或更早的群直接跳过（除非 force），避免重跑时从头翻。
    断点状态由 backfill_group 负责落盘，这里只负责读它做跳过判断。
    """
    data_dir = Path(data_dir)
    state = load_state(data_dir)
    summary = {}

    for g in resolve_groups(cfg, selector):
        chat_id, name = g["chat_id"], g["name"]
        done_to = (state.get(chat_id) or {}).get("earliest_ts", "")[:10]
        if not force and done_to and done_to <= since:
            summary[name] = {"skipped": True, "earliest": done_to}
            logger.info(f"跳过 {name}：已回补到 {done_to}")
            continue
        try:
            # 断点由 backfill_group 自己写（见上），这里不再重复落盘。
            result = backfill_group(chat_id, name, since, data_dir, max_pages=max_pages)
            summary[name] = {"skipped": False, **result}
        except Exception as e:
            logger.warning(f"回补失败 {name}: {e}")
            summary[name] = {"error": str(e)}

    return summary
```

创建 `scripts/backfill.py`：

```python
#!/usr/bin/env python3
"""回补历史群消息到档案层（data/archive/）。

用法：
  python3 scripts/backfill.py --group all --since 2026-06-01
  python3 scripts/backfill.py --group 253 --since 2026-06-01
  python3 scripts/backfill.py --group 253 --since 2026-06-01 --force

注意：lark-cli 只在云端机器可用，本命令需在云端项目根目录执行。
"""
import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.collector import load_config
from backend.palace_backfill import run_backfill


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--group", default="all", help="all 或群名/chat_id 子串")
    parser.add_argument("--since", required=True, help="YYYY-MM-DD，翻到这个日期为止")
    parser.add_argument("--max-pages", type=int, default=200, help="单群最多翻多少页")
    parser.add_argument("--force", action="store_true", help="忽略断点，重新翻")
    args = parser.parse_args()

    cfg = load_config()
    data_dir = Path(cfg["server"]["data_dir"])

    summary = run_backfill(cfg, args.group, args.since, data_dir,
                           max_pages=args.max_pages, force=args.force)

    ok = sum(1 for v in summary.values() if not v.get("error") and not v.get("skipped"))
    failed = [k for k, v in summary.items() if v.get("error")]
    skipped = [k for k, v in summary.items() if v.get("skipped")]
    added = sum(v.get("added", 0) for v in summary.values())

    print(f"回补完成：{ok} 群成功，新增 {added} 条消息，跳过 {len(skipped)} 群")
    for name, v in summary.items():
        if v.get("error"):
            print(f"  ✗ {name}: {v['error']}")
        elif v.get("skipped"):
            print(f"  - {name}: 已覆盖到 {v['earliest']}")
        else:
            print(f"  ✓ {name}: 新增 {v['added']}，最早 {v['earliest'] or '—'}")

    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: 跑测试确认通过**

Run: `python3 -m pytest tests/test_palace_backfill.py -v`
Expected: PASS（8 passed）

- [ ] **Step 5: 在云端验证回补可行性（阻塞项）**

在本机无法执行——SSH 到云端机器（`47.253.54.6`）的项目目录后：

```bash
cd /root/git/hot-dashboard
python3 scripts/backfill.py --group 253 --since 2026-06-01
ls -la data/archive/ | head
python3 -c "
import sys; sys.path.insert(0,'.')
from backend.palace_archive import iter_messages
rows = list(iter_messages('data', '<上一步产生的 chat_id>'))
print('条数', len(rows), '最早', min(r['ts'] for r in rows), '最晚', max(r['ts'] for r in rows))
"
```

**记录结论**：
- 若最早能翻到 2026-06-01 之前 → 回补可行，`--since` 用 2026-06-01。
- 若翻不到（飞书留存上限）→ 把实际最早日期写进 spec §12 的已知限制，并把 `coverage.from` 如实反映。
- 若单群体量远超预期（> 50 万条）→ 需要按月分片，**停下来重新评估**，不要硬跑。

- [ ] **Step 6: 提交**

```bash
git add backend/palace_backfill.py scripts/backfill.py tests/test_palace_backfill.py
git commit -m "feat(palace): lark-cli 回补与断点续传"
```

---

### Task 3: 抽取层（档案消息 → 观点行）

**Files:**
- Create: `backend/palace_build.py`
- Test: `tests/test_palace_build.py`

**Interfaces:**
- Consumes: `backend.collector.analyze_text` / `LINK_RE` / `load_stock_mapping`；`palace_archive.iter_jsonl`
- Produces:
  - `extract_opinions(messages, cfg, name_map=None) -> list[dict]`
  - `write_opinions(data_dir, chat_id, opinions) -> Path`
  - `opinions_path(data_dir, chat_id) -> Path`
  - `iter_opinions(data_dir, chat_id) -> Iterator[dict]`（Task 6 的 `PalaceStore` 消费）
  - （本任务建立以上四个；画像与索引在 Task 4/5 追加进同一文件）

- [ ] **Step 1: 写失败的测试**

创建 `tests/test_palace_build.py`：

```python
"""抽取层：一条观点 = 一条消息 × 一只票"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.palace_build import extract_opinions, opinions_path, write_opinions

CFG = {
    "sectors": {"半导体": ["存储", "模组"]},
    "sentiments": {"看多": ["看多", "利好"], "看空": ["看空", "利空"]},
    "actions": {"买入信号": ["买入", "加仓"], "风险提示": ["风险", "注意"]},
    "attribution": {"window_chars": 30, "ignore_link_texts": []},
}


def _link(name, code):
    prefix = "1" if code.startswith("6") else "0"
    return f"[{name}](https://wap.eastmoney.com/quote/stock/{prefix}.{code}.html)"


def _msg(ts, text, mid="om_1"):
    return {"id": mid, "ts": ts, "group": "253_橙子不糊涂", "sender": "ou_a", "text": text}


def test_one_message_with_one_stock_yields_one_opinion():
    text = f"{_link('江波龙', '301308')} 存储模组涨价，看多，买入"
    rows = extract_opinions([_msg("2026-07-06 08:09", text)], CFG, name_map={})

    assert len(rows) == 1
    row = rows[0]
    assert row["code"] == "301308"
    assert row["name"] == "江波龙"
    assert row["bull"] is True
    assert row["actions"] == ["买入信号"]
    assert row["sectors"] == ["半导体"]
    assert row["ts"] == "2026-07-06 08:09"
    assert row["id"] == "om_1"


def test_one_message_with_two_stocks_yields_two_opinions():
    text = f"{_link('江波龙', '301308')} 看多。{_link('中际旭创', '300308')} 看空"
    rows = extract_opinions([_msg("2026-07-06 08:09", text)], CFG, name_map={})

    assert {r["code"] for r in rows} == {"301308", "300308"}
    by_code = {r["code"]: r for r in rows}
    assert by_code["301308"]["bull"] is True
    assert by_code["300308"]["bear"] is True


def test_stock_name_prefers_stock_mapping():
    text = f"{_link('江波龙', '301308')} 看多"
    rows = extract_opinions([_msg("2026-07-06 08:09", text)], CFG,
                            name_map={"301308": "江波龙(官方名)"})

    assert rows[0]["name"] == "江波龙(官方名)"


def test_message_level_sector_is_not_used_as_fallback():
    """板块走就近归因；窗口里没板块词就该是空，不能拿整条消息的板块顶上。"""
    text = f"半导体大涨。{_link('江波龙', '301308')} 看多"
    rows = extract_opinions([_msg("2026-07-06 08:09", text)], CFG, name_map={})

    assert rows[0]["sectors"] == []


def test_message_without_stock_link_yields_nothing():
    rows = extract_opinions([_msg("2026-07-06 08:09", "今天大盘不错，看多")], CFG, name_map={})

    assert rows == []


def test_empty_text_is_skipped():
    assert extract_opinions([_msg("2026-07-06 08:09", "")], CFG, name_map={}) == []


def test_write_opinions_writes_jsonl_and_is_idempotent(tmp_path):
    rows = extract_opinions(
        [_msg("2026-07-06 08:09", f"{_link('江波龙', '301308')} 看多")], CFG, name_map={})
    write_opinions(tmp_path, "oc_1", rows)
    write_opinions(tmp_path, "oc_1", rows)

    lines = opinions_path(tmp_path, "oc_1").read_text(encoding="utf-8").strip().split("\n")
    assert len(lines) == 1, "重建是覆盖写，不是追加"
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python3 -m pytest tests/test_palace_build.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'backend.palace_build'`

- [ ] **Step 3: 写实现**

创建 `backend/palace_build.py`：

```python
"""大V 观点宫殿 —— 写路径：抽取观点 → 统计画像 → 生成索引。

全部是派生数据，可幂等重建：删掉 data/palace/ 重跑结果一致。
档案层（data/archive/）是唯一真相源。
"""

from __future__ import annotations

import json
import logging
import os
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from backend.collector import LINK_RE, analyze_text, load_stock_mapping
from backend.jsonio import dump_path
from backend.palace_archive import archive_dir, iter_jsonl, iter_messages

logger = logging.getLogger(__name__)

CST = timezone(timedelta(hours=8))
PALACE_DIRNAME = "palace"


def opinions_path(data_dir, chat_id: str) -> Path:
    """单群观点文件（data/palace/opinions/<chat_id>.jsonl）。"""
    return Path(data_dir) / PALACE_DIRNAME / "opinions" / f"{chat_id}.jsonl"


def _link_names(text: str) -> dict[str, str]:
    """{code: 链接文字}。整条消息的股票名映射，比 analyze_text 的单个 name 更全。"""
    return {m.group(2): m.group(1) for m in LINK_RE.finditer(text)}


def extract_opinions(messages, cfg, name_map=None) -> list[dict]:
    """把档案消息转成观点行：一条「观点」= 一条消息 × 它提及的一只票。

    只取 by_code（就近归因）的结果——不做消息级板块回落，否则会把整条消息的
    题材误挂到窗口外的票上。没有股票链接/没有提及的消息自然产出 0 行。
    """
    if name_map is None:
        name_map = load_stock_mapping()

    rows = []
    for m in messages:
        text = m.get("text", "")
        if not text:
            continue
        analysis = analyze_text(text, cfg)
        by_code = analysis.get("by_code") or {}
        if not by_code:
            continue
        links = _link_names(text)
        for code, entry in by_code.items():
            rows.append({
                "ts": m.get("ts", ""),
                "id": m.get("id", ""),
                "code": code,
                "name": name_map.get(code) or links.get(code) or "",
                "bull": bool(entry.get("bull")),
                "bear": bool(entry.get("bear")),
                "actions": list(entry.get("actions") or []),
                "sectors": list(entry.get("sectors") or []),
                "text": text,
            })
    return rows


def write_opinions(data_dir, chat_id: str, opinions: list[dict]) -> Path:
    """覆盖写单群观点文件（先写 .tmp 再 os.replace，避免半截文件）。"""
    path = opinions_path(data_dir, chat_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".jsonl.tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        for row in opinions:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
    os.replace(tmp, path)
    return path


def iter_opinions(data_dir, chat_id: str):
    """逐行迭代单群观点文件。"""
    return iter_jsonl(opinions_path(data_dir, chat_id))
```

- [ ] **Step 4: 跑测试确认通过**

Run: `python3 -m pytest tests/test_palace_build.py -v`
Expected: PASS（7 passed）

- [ ] **Step 5: 提交**

```bash
git add backend/palace_build.py tests/test_palace_build.py
git commit -m "feat(palace): 抽取层——消息 × 股票 派生成观点行"
```

---

### Task 4: 风格画像（纯规则）

**Files:**
- Modify: `backend/palace_build.py`（追加）
- Modify: `config/settings.yaml`（追加 `palace:` 段）
- Modify: `tests/test_palace_build.py`（追加）

**Interfaces:**
- Consumes: `extract_opinions` 产出的观点行
- Produces:
  - `DEFAULT_TRADING_STYLES: dict[str, list[str]]`
  - `build_profile(opinions, cfg) -> dict`，返回 spec §4.3 的 `style` 结构：
    `{"bias": {...}, "trading": [...], "breadth": {...}, "top_sectors": [[name, n], ...], "session": {...}, "ai_summary": None}`

- [ ] **Step 1: 写失败的测试**

在 `tests/test_palace_build.py` 末尾追加：

```python
# ---- 以下是 Task 4 的画像测试 ----

from backend.palace_build import build_profile


def _op(code, ts, text="", bull=False, bear=False, sectors=None):
    return {"ts": ts, "id": "om", "code": code, "name": code, "bull": bull, "bear": bear,
            "actions": [], "sectors": sectors or [], "text": text}


def test_bias_ratio_and_label():
    ops = [_op("1", "2026-07-06 10:00", bull=True)] * 8 + [_op("1", "2026-07-06 10:00", bear=True)] * 2
    prof = build_profile(ops, CFG)

    assert prof["bias"] == {"bull": 8, "bear": 2, "ratio": 0.8, "label": "偏多"}


def test_bias_without_signal_has_null_ratio():
    prof = build_profile([_op("1", "2026-07-06 10:00")], CFG)

    assert prof["bias"]["ratio"] is None
    assert prof["bias"]["label"] == "无信号"


def test_bias_lean_bear_and_neutral():
    assert build_profile([_op("1", "2026-07-06 10:00", bear=True)] * 4
                         + [_op("1", "2026-07-06 10:00", bull=True)], CFG)["bias"]["label"] == "偏空"
    assert build_profile([_op("1", "2026-07-06 10:00", bull=True)] * 2
                         + [_op("1", "2026-07-06 10:00", bear=True)] * 2, CFG)["bias"]["label"] == "中性"


def test_trading_picks_top_two_style_labels():
    ops = [_op("1", "2026-07-06 10:00", text="格局 持有 趋势 主升，低吸 回调")]
    prof = build_profile(ops, CFG)

    assert prof["trading"] == ["趋势中长线", "低吸埋伏"]


def test_trading_is_empty_when_no_keyword_hits():
    assert build_profile([_op("1", "2026-07-06 10:00", text="随便聊聊")], CFG)["trading"] == []


def test_breadth_counts_distinct_stocks_and_concentration():
    ops = [_op("301308", "2026-07-06 10:00")] * 3 + [_op("300308", "2026-07-06 10:00")]
    prof = build_profile(ops, CFG)

    assert prof["breadth"] == {"distinct_stocks": 2, "concentration": 0.75}


def test_top_sectors_dedupes_within_one_opinion():
    ops = [
        _op("1", "2026-07-06 10:00", sectors=["半导体"]),
        _op("2", "2026-07-06 10:00", sectors=["半导体", "半导体"]),
        _op("3", "2026-07-06 10:00", sectors=["军工"]),
    ]
    prof = build_profile(ops, CFG)

    assert prof["top_sectors"][0] == ["半导体", 2]


def test_session_splits_intraday_and_after_hours():
    ops = [
        _op("1", "2026-07-06 10:00"),   # 盘中
        _op("2", "2026-07-06 14:59"),   # 盘中
        _op("3", "2026-07-06 20:00"),   # 盘外
        _op("4", "2026-07-06 08:00"),   # 盘外
    ]
    prof = build_profile(ops, CFG)

    assert prof["session"] == {"intraday": 0.5, "after_hours": 0.5}


def test_ai_summary_is_always_null():
    assert build_profile([_op("1", "2026-07-06 10:00")], CFG)["ai_summary"] is None
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python3 -m pytest tests/test_palace_build.py -v`
Expected: FAIL — `ImportError: cannot import name 'build_profile'`

- [ ] **Step 3: 在 `config/settings.yaml` 末尾追加配置**

```yaml

# 大V 观点宫殿（Mind Palace）
palace:
  lru_groups: 8          # 内存中最多缓存的单群观点文件数
  profile:
    # 画风词表：对观点正文计数，取分最高的一到两个作为标签
    trading_styles:
      打板短线: [涨停, 打板, 一字, 封板, 竞价, 接力, 首板]
      低吸埋伏: [低吸, 回调, 分批, 埋伏, 左侧, 补仓]
      趋势中长线: [格局, 持有, 趋势, 主升, 中线, 基本面]
    top_sectors_n: 5
    intraday_start: "09:30"
    intraday_end: "15:00"
```

- [ ] **Step 4: 在 `backend/palace_build.py` 追加画像实现**

在文件末尾追加（`iter_opinions` 之后）：

```python
# ---- 风格画像（纯规则，spec §7）----

DEFAULT_TRADING_STYLES: dict[str, list[str]] = {
    "打板短线": ["涨停", "打板", "一字", "封板", "竞价", "接力", "首板"],
    "低吸埋伏": ["低吸", "回调", "分批", "埋伏", "左侧", "补仓"],
    "趋势中长线": ["格局", "持有", "趋势", "主升", "中线", "基本面"],
}


def _profile_cfg(cfg) -> dict:
    return ((cfg or {}).get("palace") or {}).get("profile") or {}


def _bias(opinions: list[dict]) -> dict:
    bull = sum(1 for o in opinions if o.get("bull"))
    bear = sum(1 for o in opinions if o.get("bear"))
    total = bull + bear
    if total == 0:
        return {"bull": 0, "bear": 0, "ratio": None, "label": "无信号"}
    ratio = round(bull / total, 2)
    label = "偏多" if ratio >= 0.65 else "偏空" if ratio <= 0.35 else "中性"
    return {"bull": bull, "bear": bear, "ratio": ratio, "label": label}


def _trading(opinions: list[dict], styles: dict[str, list[str]]) -> list[str]:
    body = "\n".join(o.get("text", "") for o in opinions)
    scored = [
        (sum(body.count(w) for w in words), label)
        for label, words in styles.items()
    ]
    hits = [(s, label) for s, label in scored if s > 0]
    hits.sort(key=lambda x: (-x[0], x[1]))
    return [label for _, label in hits[:2]]


def _breadth(opinions: list[dict]) -> dict:
    counts = Counter(o.get("code", "") for o in opinions if o.get("code"))
    total = sum(counts.values())
    if total == 0:
        return {"distinct_stocks": 0, "concentration": 0.0}
    return {
        "distinct_stocks": len(counts),
        "concentration": round(counts.most_common(1)[0][1] / total, 2),
    }


def _top_sectors(opinions: list[dict], top_n: int) -> list[list]:
    counts: Counter = Counter()
    for o in opinions:
        counts.update(set(o.get("sectors") or []))  # 同一条观点内去重，按条数计
    return [[name, n] for name, n in counts.most_common(top_n)]


def _session(opinions: list[dict], start: str, end: str) -> dict:
    if not opinions:
        return {"intraday": 0.0, "after_hours": 0.0}
    inside = sum(1 for o in opinions if start <= (o.get("ts") or "")[11:16] <= end)
    ratio = round(inside / len(opinions), 2)
    return {"intraday": ratio, "after_hours": round(1 - ratio, 2)}


def build_profile(opinions: list[dict], cfg) -> dict:
    """从该群全部观点统计 6 个维度。纯规则、可解释、零依赖。"""
    prof = _profile_cfg(cfg)
    return {
        "bias": _bias(opinions),
        "trading": _trading(opinions, prof.get("trading_styles") or DEFAULT_TRADING_STYLES),
        "breadth": _breadth(opinions),
        "top_sectors": _top_sectors(opinions, prof.get("top_sectors_n", 5)),
        "session": _session(
            opinions,
            prof.get("intraday_start", "09:30"),
            prof.get("intraday_end", "15:00"),
        ),
        "ai_summary": None,
    }
```

- [ ] **Step 5: 跑测试确认通过**

Run: `python3 -m pytest tests/test_palace_build.py -v`
Expected: PASS（16 passed）

- [ ] **Step 6: 提交**

```bash
git add backend/palace_build.py config/settings.yaml tests/test_palace_build.py
git commit -m "feat(palace): 风格画像（多空/画风/广度/板块/时段）"
```

---

### Task 5: 索引层与构建入口

**Files:**
- Modify: `backend/palace_build.py`（追加）
- Create: `scripts/build_palace.py`
- Modify: `tests/test_palace_build.py`（追加）

**Interfaces:**
- Consumes: `extract_opinions` / `write_opinions` / `build_profile` / `iter_messages`
- Produces:
  - `build_kol_entry(chat_id, group_name, messages, opinions, profile) -> dict`
  - `build_stock_index(groups) -> dict`，`groups = {chat_id: {"name":..., "opinions":[...]}}`
  - `build_coverage(groups) -> dict`，`groups = {chat_id: {"messages": [...]}}`
  - `kols_index_path(data_dir) -> Path` / `stock_index_path(data_dir) -> Path`
  - `build_all(data_dir, cfg) -> dict`（汇总：写 `opinions/`、`kols.json`、`stock_index.json`）

- [ ] **Step 1: 写失败的测试**

在 `tests/test_palace_build.py` 末尾追加：

```python
# ---- 以下是 Task 5 的索引测试 ----

import json

from backend.palace_build import (
    build_all, build_coverage, build_kol_entry, build_stock_index,
    kols_index_path, stock_index_path,
)
from backend.palace_archive import append_messages


def _archived(ts, text, mid):
    return {"message_id": mid, "create_time": ts, "content": text, "msg_type": "text"}


def test_kol_entry_counts_messages_days_and_stocks():
    messages = [
        {"ts": "2026-07-06 08:09"}, {"ts": "2026-07-06 09:09"}, {"ts": "2026-07-07 09:00"},
    ]
    opinions = [_op("301308", "2026-07-06 08:09"), _op("300308", "2026-07-07 09:00")]
    entry = build_kol_entry("oc_1", "253_橙子不糊涂", messages, opinions, {"bias": {}})

    assert entry["msg_count"] == 3
    assert entry["active_days"] == 2
    assert entry["opinion_count"] == 2
    assert entry["stock_count"] == 2
    assert entry["first_ts"] == "2026-07-06 08:09"
    assert entry["last_ts"] == "2026-07-07 09:00"
    assert entry["name"] == "253_橙子不糊涂"


def test_stock_index_aggregates_across_groups():
    groups = {
        "oc_1": {"name": "253_橙子不糊涂", "opinions": [
            _op("301308", "2026-07-06 08:09", bull=True),
            _op("301308", "2026-07-09 08:09", bear=True),
        ]},
        "oc_2": {"name": "006_帝凌枫", "opinions": [
            _op("301308", "2026-08-01 08:09", bull=True),
        ]},
    }
    idx = build_stock_index(groups)
    entry = idx["301308"]

    assert entry["group_count"] == 2
    assert entry["total_mentions"] == 3
    assert entry["first_ts"] == "2026-07-06 08:09"
    assert entry["last_ts"] == "2026-08-01 08:09"
    assert entry["groups"]["oc_1"]["count"] == 2
    assert entry["groups"]["oc_1"]["bull"] == 1
    assert entry["groups"]["oc_1"]["bear"] == 1
    assert entry["groups"]["oc_2"]["name"] == "006_帝凌枫"


def test_stock_index_ignores_empty_timestamps_for_range():
    groups = {"oc_1": {"name": "群", "opinions": [
        _op("301308", ""), _op("301308", "2026-07-06 08:09"),
    ]}}
    entry = build_stock_index(groups)["301308"]

    assert entry["first_ts"] == "2026-07-06 08:09"
    assert entry["last_ts"] == "2026-07-06 08:09"


def test_coverage_lists_weekday_gaps():
    groups = {
        "oc_1": {"messages": [{"ts": "2026-07-06 08:09"}, {"ts": "2026-07-08 08:09"}]},
    }
    cov = build_coverage(groups)

    assert cov["from"] == "2026-07-06"
    assert cov["to"] == "2026-07-08"
    assert cov["groups"] == 1
    # 07-07 是周二、无消息 → 记入空洞；07-06/07-08 有消息不记
    assert cov["missing_days"] == ["2026-07-07"]


def test_coverage_on_empty_input():
    assert build_coverage({}) == {"from": "", "to": "", "groups": 0, "missing_days": []}


def test_build_all_writes_opinions_and_indexes(tmp_path):
    text = f"{_link('江波龙', '301308')} 存储模组涨价，看多，买入"
    append_messages(tmp_path, "oc_1", "253_橙子不糊涂", [_archived("2026-07-06 08:09", text, "om_1")])
    cfg = {**CFG, "groups": [{"chat_id": "oc_1", "name": "253_橙子不糊涂"}]}

    build_all(tmp_path, cfg)

    kol_doc = json.loads(kols_index_path(tmp_path).read_text(encoding="utf-8"))
    assert kol_doc["kols"]["oc_1"]["opinion_count"] == 1
    assert kol_doc["coverage"]["from"] == "2026-07-06"
    assert kol_doc["generated_at"]

    stock_doc = json.loads(stock_index_path(tmp_path).read_text(encoding="utf-8"))
    assert stock_doc["301308"]["total_mentions"] == 1
    assert stock_doc["301308"]["groups"]["oc_1"]["name"] == "253_橙子不糊涂"


def test_build_all_is_idempotent(tmp_path):
    text = f"{_link('江波龙', '301308')} 看多"
    append_messages(tmp_path, "oc_1", "群", [_archived("2026-07-06 08:09", text, "om_1")])
    cfg = {**CFG, "groups": [{"chat_id": "oc_1", "name": "群"}]}

    build_all(tmp_path, cfg)
    first = json.loads(kols_index_path(tmp_path).read_text(encoding="utf-8"))
    build_all(tmp_path, cfg)
    second = json.loads(kols_index_path(tmp_path).read_text(encoding="utf-8"))

    # generated_at 是当前时间，两次跑必然不同——只比派生部分
    first.pop("generated_at")
    second.pop("generated_at")
    assert first == second


def test_build_all_with_no_archive_is_safe(tmp_path):
    doc = build_all(tmp_path, {**CFG, "groups": []})

    assert doc["kols"] == {}
    assert kols_index_path(tmp_path).exists()
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python3 -m pytest tests/test_palace_build.py -v`
Expected: FAIL — `ImportError: cannot import name 'build_all'`

- [ ] **Step 3: 在 `backend/palace_build.py` 追加索引实现**

在文件末尾追加：

```python
# ---- 索引层（spec §4.3）----

def kols_index_path(data_dir) -> Path:
    return Path(data_dir) / PALACE_DIRNAME / "kols.json"


def stock_index_path(data_dir) -> Path:
    return Path(data_dir) / PALACE_DIRNAME / "stock_index.json"


def build_kol_entry(chat_id: str, group_name: str, messages: list[dict],
                    opinions: list[dict], profile: dict) -> dict:
    """单个大V的画像条目（写进 kols.json 的 kols[chat_id]）。"""
    stamps = sorted(m.get("ts", "") for m in messages if m.get("ts"))
    return {
        "chat_id": chat_id,
        "name": group_name,
        "msg_count": len(messages),
        "opinion_count": len(opinions),
        "active_days": len({m.get("ts", "")[:10] for m in messages if m.get("ts")}),
        "stock_count": len({o.get("code", "") for o in opinions if o.get("code")}),
        "first_ts": stamps[0] if stamps else "",
        "last_ts": stamps[-1] if stamps else "",
        "style": profile,
    }


def build_stock_index(groups: dict) -> dict:
    """每票跨群汇总（不含正文）。groups = {chat_id: {"name":..,"opinions":[...]}}。"""
    index: dict = {}
    for chat_id, g in groups.items():
        group_name = g.get("name", chat_id)
        for o in g.get("opinions") or []:
            code = o.get("code", "")
            if not code:
                continue
            ts = o.get("ts", "")
            entry = index.setdefault(code, {
                "name": o.get("name", ""),
                "group_count": 0, "total_mentions": 0,
                "first_ts": "", "last_ts": "", "groups": {},
            })
            if not entry["name"] and o.get("name"):
                entry["name"] = o["name"]
            entry["total_mentions"] += 1
            if ts:
                if not entry["first_ts"] or ts < entry["first_ts"]:
                    entry["first_ts"] = ts
                if ts > entry["last_ts"]:
                    entry["last_ts"] = ts

            ge = entry["groups"].setdefault(chat_id, {
                "name": group_name, "count": 0, "bull": 0, "bear": 0,
                "actions": [], "last_ts": "",
            })
            ge["count"] += 1
            ge["bull"] += 1 if o.get("bull") else 0
            ge["bear"] += 1 if o.get("bear") else 0
            for a in o.get("actions") or []:
                if a not in ge["actions"]:
                    ge["actions"].append(a)
            if ts and ts > ge["last_ts"]:
                ge["last_ts"] = ts

    for entry in index.values():
        entry["group_count"] = len(entry["groups"])
    return index


def build_coverage(groups: dict) -> dict:
    """覆盖范围 + 区间内「全部群消息数为 0」的工作日。groups = {chat_id: {"messages":[...]}}。"""
    all_ts = [m.get("ts", "") for g in groups.values() for m in g.get("messages") or []]
    days = {ts[:10] for ts in all_ts if ts}
    if not days:
        return {"from": "", "to": "", "groups": len(groups), "missing_days": []}

    lo, hi = min(days), max(days)
    missing = []
    cursor = date.fromisoformat(lo)
    end = date.fromisoformat(hi)
    while cursor <= end:
        iso = cursor.isoformat()
        if cursor.weekday() < 5 and iso not in days:
            missing.append(iso)
        cursor += timedelta(days=1)
    return {"from": lo, "to": hi, "groups": len(groups), "missing_days": missing}


def build_all(data_dir, cfg) -> dict:
    """全量重建：归档 → opinions/ → kols.json + stock_index.json。

    幂等：重复跑结果一致。data/palace/ 整个删掉重跑也能恢复。
    """
    data_dir = Path(data_dir)
    chat_to_name = {g["chat_id"]: g["name"] for g in (cfg.get("groups") or [])}
    name_map = load_stock_mapping()

    groups: dict = {}
    for path in sorted(archive_dir(data_dir).glob("*.jsonl")):
        chat_id = path.stem
        group_name = chat_to_name.get(chat_id, chat_id)
        messages = list(iter_messages(data_dir, chat_id))
        opinions = extract_opinions(messages, cfg, name_map)
        write_opinions(data_dir, chat_id, opinions)
        groups[chat_id] = {"name": group_name, "messages": messages, "opinions": opinions}
        logger.info(f"{group_name}: 消息 {len(messages)}，观点 {len(opinions)}")

    kols = {
        chat_id: build_kol_entry(chat_id, g["name"], g["messages"], g["opinions"],
                                 build_profile(g["opinions"], cfg))
        for chat_id, g in groups.items()
    }
    coverage = build_coverage(groups)
    generated_at = datetime.now(CST).isoformat(timespec="seconds")

    doc = {"generated_at": generated_at, "coverage": coverage, "kols": kols}
    dump_path(doc, kols_index_path(data_dir), indent=True)
    dump_path(build_stock_index(groups), stock_index_path(data_dir), indent=True)

    logger.info(f"✅ palace 索引完成: {len(kols)} 群, "
                f"{sum(k['opinion_count'] for k in kols.values())} 观点, "
                f"缺 {len(coverage['missing_days'])} 个交易日")
    return doc
```

- [ ] **Step 4: 跑测试确认通过**

Run: `python3 -m pytest tests/test_palace_build.py -v`
Expected: PASS（24 passed）

- [ ] **Step 5: 创建 `scripts/build_palace.py`**

```python
#!/usr/bin/env python3
"""从档案层重建观点宫殿索引。

用法：
  python3 scripts/build_palace.py

产出：
  data/palace/opinions/<chat_id>.jsonl   派生观点（可幂等重建）
  data/palace/kols.json                  每群画像
  data/palace/stock_index.json           每票跨群汇总
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.collector import load_config
from backend.palace_build import build_all


def main():
    cfg = load_config()
    data_dir = Path(cfg["server"]["data_dir"])

    doc = build_all(data_dir, cfg)
    cov = doc["coverage"]
    print(f"完成：{len(doc['kols'])} 群")
    print(f"覆盖：{cov['from'] or '—'} → {cov['to'] or '—'}，缺口 {len(cov['missing_days'])} 个交易日")
    for k in sorted(doc["kols"].values(), key=lambda x: -x["opinion_count"]):
        print(f"  {k['name']}: 消息 {k['msg_count']}，观点 {k['opinion_count']}，"
              f"票 {k['stock_count']}，活跃 {k['active_days']} 天")


if __name__ == "__main__":
    main()
```

- [ ] **Step 6: 跑测试 + 手工验证**

Run: `python3 -m pytest tests/test_palace_build.py -v`
Expected: PASS

Run（本机 `data/archive/` 还不存在，应当安全跑完并产出空索引）：
`python3 scripts/build_palace.py`
Expected: 打印 `完成：0 群` 且 `data/palace/kols.json` 存在。

- [ ] **Step 7: 提交**

```bash
git add backend/palace_build.py scripts/build_palace.py tests/test_palace_build.py
git commit -m "feat(palace): 索引层与 build_palace 构建入口"
```

---

### Task 6: PalaceStore（读路径）

**Files:**
- Create: `backend/palace.py`
- Test: `tests/test_palace.py`

**Interfaces:**
- Consumes: `palace_build.{kols_index_path, stock_index_path, iter_opinions}`；`jsonio.load_path`
- Produces: `PalaceStore`，方法
  - `__init__(self, data_dir, lru_groups: int = 8)`
  - `startup(self) -> None` / `is_ready(self) -> bool`
  - `get_meta(self) -> dict` → `{"generated_at": str, "coverage": dict}`
  - `list_kols(self) -> list[dict]`（按观点数降序）
  - `get_kol(self, chat_id) -> dict | None`（画像 + `stocks`）
  - `get_kol_stock(self, chat_id, code) -> list[dict] | None`（时间倒序全量观点）
  - `get_stock_kols(self, code) -> dict | None`（跨群汇总，`groups` 数组按提及数降序）

- [ ] **Step 1: 写失败的测试**

创建 `tests/test_palace.py`：

```python
"""PalaceStore：索引常驻 + 单群观点 LRU 懒加载"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.palace import PalaceStore
from backend.palace_build import (
    build_profile, kols_index_path, stock_index_path, write_opinions,
)


def _opinion(code, ts, bull=False, bear=False, name="江波龙"):
    return {"ts": ts, "id": f"om_{ts}", "code": code, "name": name, "bull": bull,
            "bear": bear, "actions": ["买入信号"] if bull else [], "sectors": ["半导体"],
            "text": f"{name} 的观点"}


def _make_store(tmp_path, groups):
    """groups = {chat_id: {"name":.., "opinions":[...]}}"""
    kols = {}
    for chat_id, g in groups.items():
        write_opinions(tmp_path, chat_id, g["opinions"])
        kols[chat_id] = {
            "chat_id": chat_id, "name": g["name"],
            "msg_count": 10, "opinion_count": len(g["opinions"]),
            "active_days": 2, "stock_count": len({o["code"] for o in g["opinions"]}),
            "first_ts": "2026-07-06 08:09", "last_ts": "2026-07-09 08:09",
            "style": build_profile(g["opinions"], {}),
        }
    kols_index_path(tmp_path).parent.mkdir(parents=True, exist_ok=True)
    kols_index_path(tmp_path).write_text(json.dumps({
        "generated_at": "2026-09-11T10:00:00+08:00",
        "coverage": {"from": "2026-07-06", "to": "2026-07-09", "groups": len(groups),
                     "missing_days": ["2026-07-07"]},
        "kols": kols,
    }, ensure_ascii=False), encoding="utf-8")
    return tmp_path


def test_startup_without_index_is_not_ready(tmp_path):
    store = PalaceStore(tmp_path)
    store.startup()

    assert store.is_ready() is False
    assert store.list_kols() == []
    assert store.get_meta()["coverage"] == {}


def test_startup_loads_index(tmp_path):
    _make_store(tmp_path, {"oc_1": {"name": "253_橙子不糊涂",
                                    "opinions": [_opinion("301308", "2026-07-06 08:09", bull=True)]}})
    store = PalaceStore(tmp_path)
    store.startup()

    assert store.is_ready() is True
    assert [k["name"] for k in store.list_kols()] == ["253_橙子不糊涂"]
    assert store.get_meta()["coverage"]["missing_days"] == ["2026-07-07"]


def test_get_kol_aggregates_stocks_with_recent_three(tmp_path):
    ops = [_opinion("301308", f"2026-07-0{i} 08:09", bull=True) for i in range(1, 6)]
    ops.append(_opinion("300308", "2026-07-09 08:09", bear=True, name="中际旭创"))
    _make_store(tmp_path, {"oc_1": {"name": "群", "opinions": ops}})
    store = PalaceStore(tmp_path)
    store.startup()

    kol = store.get_kol("oc_1")
    assert [s["code"] for s in kol["stocks"]] == ["301308", "300308"]
    top = kol["stocks"][0]
    assert top["count"] == 5
    assert top["bull"] == 5
    assert top["first_ts"] == "2026-07-01 08:09"
    assert top["last_ts"] == "2026-07-05 08:09"
    assert len(top["recent"]) == 3
    assert top["recent"][0]["ts"] == "2026-07-05 08:09", "recent 必须时间倒序"


def test_get_kol_returns_none_for_unknown(tmp_path):
    _make_store(tmp_path, {"oc_1": {"name": "群", "opinions": []}})
    store = PalaceStore(tmp_path)
    store.startup()

    assert store.get_kol("oc_nope") is None


def test_get_kol_stock_returns_reverse_chronological_timeline(tmp_path):
    ops = [_opinion("301308", "2026-07-01 08:09"), _opinion("301308", "2026-07-05 08:09"),
           _opinion("300308", "2026-07-06 08:09")]
    _make_store(tmp_path, {"oc_1": {"name": "群", "opinions": ops}})
    store = PalaceStore(tmp_path)
    store.startup()

    tl = store.get_kol_stock("oc_1", "301308")
    assert [o["ts"] for o in tl] == ["2026-07-05 08:09", "2026-07-01 08:09"]
    assert store.get_kol_stock("oc_nope", "301308") is None


def test_get_stock_kols_sorts_groups_by_count(tmp_path):
    _make_store(tmp_path, {
        "oc_1": {"name": "群A", "opinions": [_opinion("301308", "2026-07-01 08:09")] * 3},
        "oc_2": {"name": "群B", "opinions": [_opinion("301308", "2026-07-02 08:09")]},
    })
    stock_index_path(tmp_path).write_text(json.dumps({
        "301308": {"name": "江波龙", "group_count": 2, "total_mentions": 4,
                   "first_ts": "2026-07-01 08:09", "last_ts": "2026-07-02 08:09",
                   "groups": {
                       "oc_1": {"name": "群A", "count": 3, "bull": 3, "bear": 0,
                                "actions": ["买入信号"], "last_ts": "2026-07-01 08:09"},
                       "oc_2": {"name": "群B", "count": 1, "bull": 1, "bear": 0,
                                "actions": [], "last_ts": "2026-07-02 08:09"},
                   }},
    }, ensure_ascii=False), encoding="utf-8")
    store = PalaceStore(tmp_path)
    store.startup()

    entry = store.get_stock_kols("301308")
    assert entry["total_mentions"] == 4
    assert [g["chat_id"] for g in entry["groups"]] == ["oc_1", "oc_2"]
    assert store.get_stock_kols("999999") is None


def test_opinions_lru_evicts_oldest_group(tmp_path):
    _make_store(tmp_path, {
        "oc_1": {"name": "群A", "opinions": [_opinion("301308", "2026-07-01 08:09")]},
        "oc_2": {"name": "群B", "opinions": [_opinion("300308", "2026-07-01 08:09")]},
    })
    store = PalaceStore(tmp_path, lru_groups=1)
    store.startup()

    store._load_opinions("oc_1")
    store._load_opinions("oc_2")

    assert len(store._opinions) == 1
    assert "oc_1" not in store._opinions, "超出 LRU 上限应淘汰最久未用的群"
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python3 -m pytest tests/test_palace.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'backend.palace'`

- [ ] **Step 3: 写实现**

创建 `backend/palace.py`：

```python
"""大V 观点宫殿 —— 读路径。

索引（kols.json / stock_index.json）不带正文，体积小，启动时全量进内存；
单群观点文件按需懒加载，用 LRU 限制常驻数量（仿 DataStore 的思路）。
"""

from __future__ import annotations

import logging
from collections import OrderedDict
from pathlib import Path

from backend.jsonio import load_path
from backend.palace_build import iter_opinions, kols_index_path, stock_index_path

logger = logging.getLogger(__name__)

RECENT_OPINIONS = 3


class PalaceStore:
    """观点宫殿查询层。索引常驻内存，单群观点按 LRU 懒加载。"""

    def __init__(self, data_dir, lru_groups: int = 8):
        self.data_dir = Path(data_dir)
        self.lru_groups = max(1, lru_groups)
        self._kols: dict = {}
        self._stock_index: dict = {}
        self._coverage: dict = {}
        self._generated_at: str = ""
        self._opinions: OrderedDict[str, list] = OrderedDict()
        self._ready = False

    # ---- 启动 ----

    def startup(self) -> None:
        """读索引进内存。索引不存在不算错误——前端拿到空结果自行降级。"""
        kols_file = kols_index_path(self.data_dir)
        if not kols_file.exists():
            logger.warning("palace 索引不存在，先跑 scripts/build_palace.py")
            return
        try:
            doc = load_path(kols_file)
        except Exception as e:
            logger.warning(f"palace 索引读取失败: {e}")
            return

        self._coverage = doc.get("coverage") or {}
        self._generated_at = doc.get("generated_at", "")
        self._kols = doc.get("kols") or {}

        stock_file = stock_index_path(self.data_dir)
        self._stock_index = load_path(stock_file) if stock_file.exists() else {}
        self._ready = True
        logger.info(f"✅ palace 启动完成: {len(self._kols)} 个大V, "
                    f"{len(self._stock_index)} 只票")

    def is_ready(self) -> bool:
        return self._ready

    def get_meta(self) -> dict:
        """覆盖范围与生成时间。未就绪时返回空结构，调用方据此提示降级。"""
        return {"generated_at": self._generated_at, "coverage": self._coverage}

    # ---- 查询 ----

    def list_kols(self) -> list[dict]:
        return sorted(self._kols.values(),
                      key=lambda k: (-k.get("opinion_count", 0), k.get("name", "")))

    def get_kol(self, chat_id: str) -> dict | None:
        """画像 + 该群讨论过的股票（按提及数降序，每票带最近 3 条观点）。"""
        kol = self._kols.get(chat_id)
        if kol is None:
            return None

        opinions = self._load_opinions(chat_id)
        stocks: dict = {}
        for o in opinions:
            code = o.get("code", "")
            if not code:
                continue
            ts = o.get("ts", "")
            s = stocks.setdefault(code, {
                "code": code, "name": o.get("name", ""), "count": 0,
                "bull": 0, "bear": 0, "actions": [], "sectors": [],
                "first_ts": "", "last_ts": "", "recent": [],
            })
            s["count"] += 1
            s["bull"] += 1 if o.get("bull") else 0
            s["bear"] += 1 if o.get("bear") else 0
            for a in o.get("actions") or []:
                if a not in s["actions"]:
                    s["actions"].append(a)
            for sec in o.get("sectors") or []:
                if sec not in s["sectors"]:
                    s["sectors"].append(sec)
            if ts:
                if not s["first_ts"] or ts < s["first_ts"]:
                    s["first_ts"] = ts
                if ts > s["last_ts"]:
                    s["last_ts"] = ts

        for o in sorted(opinions, key=lambda x: x.get("ts", ""), reverse=True):
            code = o.get("code", "")
            if code in stocks and len(stocks[code]["recent"]) < RECENT_OPINIONS:
                stocks[code]["recent"].append(o)

        return {**kol, "stocks": sorted(stocks.values(),
                                        key=lambda s: (-s["count"], s["code"]))}

    def get_kol_stock(self, chat_id: str, code: str) -> list[dict] | None:
        """该群对该票的完整观点时间线（含正文），时间倒序。未知群返回 None。"""
        if chat_id not in self._kols:
            return None
        ops = [o for o in self._load_opinions(chat_id) if o.get("code") == code]
        ops.sort(key=lambda o: o.get("ts", ""), reverse=True)
        return ops

    def get_stock_kols(self, code: str) -> dict | None:
        """该票的跨群汇总。未收录返回 None。"""
        entry = self._stock_index.get(code)
        if entry is None:
            return None
        groups = [{"chat_id": cid, **g} for cid, g in (entry.get("groups") or {}).items()]
        groups.sort(key=lambda g: (-g.get("count", 0), g.get("name", "")))
        return {**entry, "groups": groups}

    # ---- 懒加载 ----

    def _load_opinions(self, chat_id: str) -> list[dict]:
        """单群观点 LRU 缓存。超上限时淘汰最久未用的群。"""
        if chat_id in self._opinions:
            self._opinions.move_to_end(chat_id)
            return self._opinions[chat_id]

        ops = list(iter_opinions(self.data_dir, chat_id))
        self._opinions[chat_id] = ops
        while len(self._opinions) > self.lru_groups:
            evicted, _ = self._opinions.popitem(last=False)
            logger.debug(f"palace 观点 LRU 淘汰: {evicted}")
        return ops
```

- [ ] **Step 4: 跑测试确认通过**

Run: `python3 -m pytest tests/test_palace.py -v`
Expected: PASS（7 passed）

- [ ] **Step 5: 提交**

```bash
git add backend/palace.py tests/test_palace.py
git commit -m "feat(palace): PalaceStore 读路径（索引常驻 + 观点 LRU）"
```

---

### Task 7: API 端点

**Files:**
- Modify: `backend/server.py`
- Test: `tests/test_palace_api.py`

**Interfaces:**
- Consumes: `PalaceStore`
- Produces（全部只读 GET，`Cache-Control: max-age=60`）
  - `GET /api/palace/meta` → `{generated_at, coverage}`
  - `GET /api/palace/kols` → `{generated_at, kols: [...]}`
  - `GET /api/palace/kols/{chat_id}` → kol 详情（含 `stocks`）；未知 → 404
  - `GET /api/palace/kols/{chat_id}/stocks/{code}` → `{chat_id, code, opinions: [...]}`；未知群 → 404
  - `GET /api/palace/stocks/{code}` → 跨群汇总；未收录 → 404

- [ ] **Step 1: 写失败的测试**

创建 `tests/test_palace_api.py`：

```python
"""palace API：只读、可降级（无索引时不 500）"""
import json
import sys
import tempfile
from pathlib import Path

import pytest
from starlette.testclient import TestClient

sys.path.insert(0, str(Path(__file__).parent.parent))

from backend import server
from backend.palace import PalaceStore
from backend.palace_build import build_profile, kols_index_path


@pytest.fixture
def client():
    tmp = Path(tempfile.mkdtemp(prefix="hotdash-palace-test-"))
    server.data_dir = tmp
    server.palace = PalaceStore(tmp)
    server.palace.startup()
    with TestClient(server.app) as c:
        yield c


def _seed(tmp: Path):
    """往 palace 索引里塞一个大V + 一只票，返回 tmp。"""
    kols_index_path(tmp).parent.mkdir(parents=True, exist_ok=True)
    opinions = [{"ts": "2026-07-06 08:09", "id": "om_1", "code": "301308", "name": "江波龙",
                 "bull": True, "bear": False, "actions": ["买入信号"],
                 "sectors": ["半导体"], "text": "江波龙 看多"}]
    from backend.palace_build import write_opinions
    write_opinions(tmp, "oc_1", opinions)
    kols_index_path(tmp).write_text(json.dumps({
        "generated_at": "2026-09-11T10:00:00+08:00",
        "coverage": {"from": "2026-07-06", "to": "2026-07-06", "groups": 1, "missing_days": []},
        "kols": {"oc_1": {
            "chat_id": "oc_1", "name": "253_橙子不糊涂", "msg_count": 1, "opinion_count": 1,
            "active_days": 1, "stock_count": 1, "first_ts": "2026-07-06 08:09",
            "last_ts": "2026-07-06 08:09", "style": build_profile(opinions, {}),
        }},
    }, ensure_ascii=False), encoding="utf-8")
    return tmp


def test_meta_degrades_without_index(client):
    r = client.get("/api/palace/meta")

    assert r.status_code == 200, "无索引也必须 200，不能 500"
    assert r.json() == {"generated_at": "", "coverage": {}}


def test_kols_list_degrades_to_empty(client):
    r = client.get("/api/palace/kols")

    assert r.status_code == 200
    assert r.json()["kols"] == []


def test_kol_detail_404_when_unknown(client):
    assert client.get("/api/palace/kols/oc_nope").status_code == 404
    assert client.get("/api/palace/kols/oc_nope/stocks/301308").status_code == 404
    assert client.get("/api/palace/stocks/999999").status_code == 404


def test_endpoints_after_seeding():
    tmp = Path(tempfile.mkdtemp(prefix="hotdash-palace-test-"))
    _seed(tmp)
    server.data_dir = tmp
    server.palace = PalaceStore(tmp)
    server.palace.startup()

    with TestClient(server.app) as c:
        kols = c.get("/api/palace/kols")
        assert kols.status_code == 200
        assert kols.json()["kols"][0]["name"] == "253_橙子不糊涂"

        kol = c.get("/api/palace/kols/oc_1")
        assert kol.status_code == 200
        assert kol.json()["stocks"][0]["code"] == "301308"
        assert kol.json()["stocks"][0]["recent"][0]["text"] == "江波龙 看多"

        timeline = c.get("/api/palace/kols/oc_1/stocks/301308")
        assert timeline.status_code == 200
        assert len(timeline.json()["opinions"]) == 1

        meta = c.get("/api/palace/meta")
        assert meta.json()["coverage"]["groups"] == 1


def test_palace_endpoints_are_read_only(client):
    """写接口方法必须不被 palace 路由接受。"""
    assert client.post("/api/palace/kols").status_code == 405
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python3 -m pytest tests/test_palace_api.py -v`
Expected: FAIL — `AttributeError: module 'backend.server' has no attribute 'palace'` / 404 on routes

- [ ] **Step 3: 在 `backend/server.py` 挂载**

在 import 区（`from backend.jsonio import load_path, dump_path` 之后）加：

```python
from backend.palace import PalaceStore
```

在 `_CACHE_POLICIES` 字典里加一行：

```python
    "palace": "max-age=60",
```

在 `store = DataStore(...)` 之后加：

```python
palace = PalaceStore(data_dir, lru_groups=cfg.get("palace", {}).get("lru_groups", 8))
```

把 `startup_event` 改成：

```python
@app.on_event("startup")
def startup_event():
    store.startup()
    palace.startup()
```

在 `# ---- API 路由 ----` 注释之后、`api_status` 之前插入 5 个端点：

```python
# ---- 大V 观点宫殿 ----

def _palace_headers() -> dict:
    return {"Cache-Control": _CACHE_POLICIES["palace"]}


@app.get("/api/palace/meta")
def api_palace_meta():
    """覆盖范围与生成时间。索引缺失时返回空结构，前端据此提示降级。"""
    return JSONResponse(palace.get_meta(), headers=_palace_headers())


@app.get("/api/palace/kols")
def api_palace_kols():
    """大V 列表 + 画像概要，按观点数降序。"""
    return JSONResponse({
        "generated_at": palace.get_meta()["generated_at"],
        "kols": palace.list_kols(),
    }, headers=_palace_headers())


@app.get("/api/palace/kols/{chat_id}")
def api_palace_kol(chat_id: str):
    """单群画像 + 该群讨论过的股票。"""
    result = palace.get_kol(chat_id)
    if result is None:
        raise HTTPException(404, f"大V {chat_id} 不存在")
    return JSONResponse(result, headers=_palace_headers())


@app.get("/api/palace/kols/{chat_id}/stocks/{code}")
def api_palace_kol_stock(chat_id: str, code: str):
    """该群对该票的观点时间线（含正文），时间倒序。"""
    opinions = palace.get_kol_stock(chat_id, code)
    if opinions is None:
        raise HTTPException(404, f"大V {chat_id} 不存在")
    return JSONResponse({"chat_id": chat_id, "code": code, "opinions": opinions},
                        headers=_palace_headers())


@app.get("/api/palace/stocks/{code}")
def api_palace_stock(code: str):
    """该票的跨群汇总：哪些大V讨论过、各自操作与多空。"""
    result = palace.get_stock_kols(code)
    if result is None:
        raise HTTPException(404, f"股票 {code} 暂无大V观点")
    return JSONResponse(result, headers=_palace_headers())
```

- [ ] **Step 4: 跑测试确认通过**

Run: `python3 -m pytest tests/test_palace_api.py -v`
Expected: PASS（5 passed）

- [ ] **Step 5: 跑全量回归**

Run: `python3 -m pytest -q`
Expected: 全绿（既有 10 个测试文件不受影响）

- [ ] **Step 6: 提交**

```bash
git add backend/server.py tests/test_palace_api.py
git commit -m "feat(palace): 5 个只读 API 端点"
```

---

### Task 8: 采集时顺带写档案

**Files:**
- Modify: `backend/collector.py:600-622`（`collect_live` 内的 `_fetch_one`）
- Test: `tests/test_palace_archive.py`（追加集成测试）

**Interfaces:**
- Consumes: `palace_archive.append_messages`
- Produces: 无新公开接口；副作用是 `collect_live()` 跑完后 `data/archive/<chat_id>.jsonl` 出现当天消息

- [ ] **Step 1: 写失败的测试**

在 `tests/test_palace_archive.py` 追加：

```python
# ---- 以下是 Task 8 的采集集成测试 ----

from datetime import datetime
from unittest.mock import MagicMock, patch

from backend import collector
from backend.collector import collect_live


def _lark_reply(messages):
    return MagicMock(returncode=0, stdout=__import__("json").dumps(
        {"data": {"messages": messages, "has_more": False, "page_token": None}}))


def _msgs_now():
    """消息时间戳必须取「当前时刻」。

    collect_live 会丢弃 create_time > now 的消息（future 过滤）。写死成
    "09:31" 会让这两个测试在凌晨到早上九点半之间必然失败——本机开发时
    正好是白天，容易漏掉。
    """
    stamp = datetime.now(collector.CST).strftime("%Y-%m-%d %H:%M")
    return [{"message_id": "om_1", "create_time": stamp,
             "content": "江波龙看多", "msg_type": "text"}]


def _cfg(tmp_path):
    return {
        "server": {"data_dir": str(tmp_path)},
        "collector": {"max_pages": 1},
        "groups": [{"chat_id": "oc_1", "name": "253_橙子不糊涂"}],
        "sectors": {}, "sentiments": {}, "actions": {},
    }


def test_collect_live_appends_to_archive(tmp_path):
    with patch("subprocess.run", return_value=_lark_reply(_msgs_now())):
        collect_live(cfg=_cfg(tmp_path), data_dir=tmp_path)

    rows = list(iter_messages(tmp_path, "oc_1"))
    assert len(rows) == 1
    assert rows[0]["text"] == "江波龙看多"


def test_collect_live_survives_archive_failure(tmp_path):
    """档案写失败不能让采集挂掉，也不能改变采集结果。"""
    with patch("subprocess.run", return_value=_lark_reply(_msgs_now())), \
         patch("backend.collector.append_messages", side_effect=OSError("磁盘满")):
        output = collect_live(cfg=_cfg(tmp_path), data_dir=tmp_path)

    assert output["total_messages"] == 1, "档案失败不应影响采集结果"
    assert (tmp_path / "latest.json").exists()
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python3 -m pytest tests/test_palace_archive.py -v`
Expected: FAIL — archive 文件不存在

- [ ] **Step 3: 改 `backend/collector.py`**

在 import 区加：

```python
from backend.palace_archive import append_messages
```

把 `collect_live` 里的 `_fetch_one`（约 600-622 行）改成：

```python
    def _fetch_one(g):
        """单个群抓取+分析"""
        try:
            msgs = fetch_messages_incremental(g["chat_id"], data_dir, max_pages=3)
            day_msgs = [
                m for m in msgs
                if m.get("create_time", "").startswith(date_str)
                and m.get("create_time", "") <= time_str
            ]
            for m in day_msgs:
                text = m.get("content", "")
                # 图片消息：OCR 提取文字
                if m.get("msg_type") == "image" and text:
                    ocr_text = extract_image_text(m)
                    if ocr_text:
                        text = f"[图片OCR]{ocr_text}[/图片OCR]"
                        m["content"] = text
                if text and "_analysis" not in m:
                    m["_analysis"] = analyze_text(text, cfg)
            # 顺带把当天全部原始消息写进档案层。用独立的 try 包住：
            # 档案写失败只记 warning，不抛出、不影响采集结果。
            try:
                append_messages(data_dir, g["chat_id"], g["name"], msgs)
            except Exception as e:
                logger.warning(f"档案追加失败 {g['name']}: {e}")
            return g["name"], day_msgs
        except Exception as e:
            print(f"  跳过 {g['name']}: {e}")
            return g["name"], []
```

- [ ] **Step 4: 跑测试确认通过**

Run: `python3 -m pytest tests/test_palace_archive.py -v`
Expected: PASS（10 passed）

- [ ] **Step 5: 跑全量回归**

Run: `python3 -m pytest -q`
Expected: 全绿

- [ ] **Step 6: 提交**

```bash
git add backend/collector.py tests/test_palace_archive.py
git commit -m "feat(palace): 实时采集顺带写入档案层"
```

---

### Task 9: 前端类型、API 包装、纯函数与 vitest

**Files:**
- Modify: `src/types/api.ts`（追加）
- Modify: `src/lib/api.ts`（追加）
- Create: `src/lib/palace.ts`
- Test: `src/lib/palace.test.ts`

**Interfaces:**
- Produces:
  - `src/lib/palace.ts`：`KolSortKey`、`FOCUS_RING`、`ROW_GRID`、`splitGroupName(name)`、`isStale(kol, refTs, days?)`、`sortKols(kols, key, refTs)`、`filterKols(kols, query)`、`biasText(bull, bear)`
  - `src/lib/api.ts`：`fetchPalaceMeta()`、`fetchPalaceKols()`、`fetchPalaceKol(chatId)`、`fetchPalaceKolStock(chatId, code)`、`fetchPalaceStock(code)`

- [ ] **Step 1: 写失败的测试**

创建 `src/lib/palace.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { biasText, filterKols, isStale, sortKols, splitGroupName } from './palace';
import type { PalaceKol } from '@/types/api';

function kol(name: string, over: Partial<PalaceKol> = {}): PalaceKol {
  return {
    chat_id: name,
    name,
    msg_count: 100,
    opinion_count: 50,
    active_days: 10,
    stock_count: 5,
    first_ts: '2026-06-05 09:00',
    last_ts: '2026-09-10 15:00',
    style: {
      bias: { bull: 8, bear: 2, ratio: 0.8, label: '偏多' },
      trading: ['趋势中长线'],
      breadth: { distinct_stocks: 5, concentration: 0.4 },
      top_sectors: [['半导体', 10]],
      session: { intraday: 0.6, after_hours: 0.4 },
      ai_summary: null,
    },
    ...over,
  };
}

describe('splitGroupName', () => {
  it('拆出群号与群名', () => {
    expect(splitGroupName('253_橙子不糊涂')).toEqual({ no: '253', label: '橙子不糊涂' });
  });

  it('没有下划线时整串当群名', () => {
    expect(splitGroupName('橙子不糊涂')).toEqual({ no: '', label: '橙子不糊涂' });
  });
});

describe('isStale', () => {
  it('超过 30 天无消息算断更', () => {
    expect(isStale(kol('a', { last_ts: '2026-06-01 09:00' }), '2026-09-10 15:00')).toBe(true);
  });

  it('30 天内不算断更', () => {
    expect(isStale(kol('a', { last_ts: '2026-09-01 09:00' }), '2026-09-10 15:00')).toBe(false);
  });

  it('没有 last_ts 视为断更', () => {
    expect(isStale(kol('a', { last_ts: '' }), '2026-09-10 15:00')).toBe(true);
  });
});

describe('sortKols', () => {
  it('断更的沉底，无论排序键是什么', () => {
    const stale = kol('stale', { last_ts: '2026-06-01 09:00', opinion_count: 9999 });
    const fresh = kol('fresh', { opinion_count: 1 });

    expect(sortKols([stale, fresh], 'opinion', '2026-09-10 15:00').map((k) => k.name))
      .toEqual(['fresh', 'stale']);
  });

  it('按观点数降序', () => {
    const a = kol('a', { opinion_count: 10 });
    const b = kol('b', { opinion_count: 30 });

    expect(sortKols([a, b], 'opinion', '2026-09-10 15:00').map((k) => k.name)).toEqual(['b', 'a']);
  });

  it('按活跃天数降序', () => {
    const a = kol('a', { active_days: 40 });
    const b = kol('b', { active_days: 5 });

    expect(sortKols([a, b], 'active', '2026-09-10 15:00').map((k) => k.name)).toEqual(['a', 'b']);
  });

  it('不改动入参数组', () => {
    const input = [kol('a', { opinion_count: 1 }), kol('b', { opinion_count: 9 })];
    sortKols(input, 'opinion', '2026-09-10 15:00');

    expect(input.map((k) => k.name)).toEqual(['a', 'b']);
  });
});

describe('filterKols', () => {
  it('空查询返回全部', () => {
    expect(filterKols([kol('253_橙子不糊涂')], '   ')).toHaveLength(1);
  });

  it('按群号匹配', () => {
    const list = [kol('253_橙子不糊涂'), kol('006_帝凌枫')];

    expect(filterKols(list, '253').map((k) => k.name)).toEqual(['253_橙子不糊涂']);
  });

  it('按群名匹配，大小写不敏感', () => {
    const list = [kol('001_Alpha'), kol('006_帝凌枫')];

    expect(filterKols(list, 'alpha').map((k) => k.name)).toEqual(['001_Alpha']);
  });

  it('无匹配返回空数组', () => {
    expect(filterKols([kol('253_橙子不糊涂')], '京东方')).toEqual([]);
  });
});

describe('biasText', () => {
  it('多空都为零时给 分歧', () => {
    expect(biasText(0, 0)).toBe('分歧');
  });

  it('偏多与偏空', () => {
    expect(biasText(8, 2)).toBe('偏多');
    expect(biasText(1, 4)).toBe('偏空');
  });

  it('接近时给 分歧', () => {
    expect(biasText(5, 5)).toBe('分歧');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test`
Expected: FAIL — 找不到模块 `./palace`

- [ ] **Step 3: 写 `src/lib/palace.ts`**

```ts
import type { PalaceKol } from '@/types/api';

/** /kols 的排序键 */
export type KolSortKey = 'active' | 'opinion' | 'stocks';

/** 全站统一的焦点环（spec §9.5 第 5 条） */
export const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2';

/**
 * 表格行/表头共享的栅格。≤1000px 时隐藏「多空」「最近」两列
 * （spec §9.5 第 8 条：去列，不做横向滚动），模板同步收窄。
 */
export const ROW_GRID =
  'grid grid-cols-[1.6fr_.5fr_.7fr_1.3fr_.8fr] max-[1000px]:grid-cols-[1.7fr_.5fr_1.3fr] gap-3 items-center';

/** 群名「253_橙子不糊涂」→ { no: '253', label: '橙子不糊涂' } */
export function splitGroupName(name: string): { no: string; label: string } {
  const m = /^(\d+)_(.*)$/.exec(name);
  return m ? { no: m[1], label: m[2] } : { no: '', label: name };
}

/** 距参考时间超过 days 天没消息即为断更（无 last_ts 也算）。 */
export function isStale(kol: PalaceKol, refTs: string, days = 30): boolean {
  if (!kol.last_ts) return true;
  const ref = Date.parse(refTs.slice(0, 10));
  const last = Date.parse(kol.last_ts.slice(0, 10));
  if (Number.isNaN(ref) || Number.isNaN(last)) return false;
  return (ref - last) / 86_400_000 > days;
}

/** 排序：断更的永远沉底，其余按 key 降序，同分按群名。 */
export function sortKols(kols: PalaceKol[], key: KolSortKey, refTs: string): PalaceKol[] {
  const weight = (k: PalaceKol) =>
    key === 'opinion' ? k.opinion_count : key === 'stocks' ? k.stock_count : k.active_days;
  return [...kols].sort((a, b) => {
    const sa = isStale(a, refTs) ? 1 : 0;
    const sb = isStale(b, refTs) ? 1 : 0;
    if (sa !== sb) return sa - sb;
    if (weight(b) !== weight(a)) return weight(b) - weight(a);
    return a.name.localeCompare(b.name, 'zh');
  });
}

/** 搜索：只匹配群号与群名（不搜观点正文）。 */
export function filterKols(kols: PalaceKol[], query: string): PalaceKol[] {
  const q = query.trim().toLowerCase();
  if (!q) return kols;
  return kols.filter((k) => k.name.toLowerCase().includes(q));
}

/** 多空的文字标签（spec §9.5 第 4 条：状态不只靠颜色）。 */
export function biasText(bull: number, bear: number): string {
  const total = bull + bear;
  if (total === 0) return '分歧';
  const ratio = bull / total;
  if (ratio >= 0.65) return '偏多';
  if (ratio <= 0.35) return '偏空';
  return '分歧';
}
```

- [ ] **Step 4: 在 `src/types/api.ts` 追加类型**

在文件末尾追加：

```ts
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
  recent: PalaceOpinion[];
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

export interface PalaceKolStockResponse {
  chat_id: string;
  code: string;
  opinions: PalaceOpinion[];
}
```

- [ ] **Step 5: 在 `src/lib/api.ts` 追加包装**

先把新类型加进文件顶部的 `import type { ... } from '@/types/api';` 列表：`PalaceKolListResponse, PalaceKolDetail, PalaceKolStockResponse, PalaceMeta, PalaceStockDetail`。

然后在文件末尾追加：

```ts
/* ---- Palace (大V 观点宫殿) ---- */

// GET /api/palace/meta —— 索引缺失时后端返回空结构，这里不抛错
export async function fetchPalaceMeta(): Promise<PalaceMeta> {
  try {
    return await fetchJson<PalaceMeta>('/api/palace/meta');
  } catch {
    return { generated_at: '', coverage: { from: '', to: '', groups: 0, missing_days: [] } };
  }
}

// GET /api/palace/kols
export async function fetchPalaceKols(): Promise<PalaceKolListResponse> {
  try {
    return await fetchJson<PalaceKolListResponse>('/api/palace/kols');
  } catch {
    return { generated_at: '', kols: [] };
  }
}

// GET /api/palace/kols/{chat_id}
export async function fetchPalaceKol(chatId: string): Promise<PalaceKolDetail | null> {
  try {
    return await fetchJson<PalaceKolDetail>(`/api/palace/kols/${chatId}`);
  } catch {
    return null;
  }
}

// GET /api/palace/kols/{chat_id}/stocks/{code}
export async function fetchPalaceKolStock(
  chatId: string,
  code: string,
): Promise<PalaceOpinion[]> {
  try {
    const res = await fetchJson<PalaceKolStockResponse>(
      `/api/palace/kols/${chatId}/stocks/${code}`,
    );
    return res.opinions ?? [];
  } catch {
    return [];
  }
}

// GET /api/palace/stocks/{code}
export async function fetchPalaceStock(code: string): Promise<PalaceStockDetail | null> {
  try {
    return await fetchJson<PalaceStockDetail>(`/api/palace/stocks/${code}`);
  } catch {
    return null;
  }
}
```

同时在类型 import 列表里补上 `PalaceOpinion`。

- [ ] **Step 6: 跑测试与类型检查**

Run: `npm test`
Expected: PASS —— `src/lib/palace.test.ts` 的 16 个用例全绿（`src/lib/chain.test.ts` 不受影响）

Run: `npx tsc -b`
Expected: 无输出（成功）

- [ ] **Step 7: 提交**

```bash
git add src/lib/palace.ts src/lib/palace.test.ts src/types/api.ts src/lib/api.ts
git commit -m "feat(palace): 前端类型、API 包装与纯函数（含 vitest）"
```

---

### Task 10: `/kols` 大V 列表页

**Files:**
- Create: `src/pages/Kols.tsx`
- Modify: `src/App.tsx`（加懒加载与路由）
- Modify: `src/components/Navbar.tsx`（加入口 + 修正 active 判定）

**Interfaces:**
- Consumes: `fetchPalaceKols`、`fetchPalaceMeta`、`src/lib/palace.ts` 全部导出、`useStore`（取当前 Top 股票做无结果时的替代出口）
- Produces: 路由 `/kols`；组内导出的 `KolCard` 不在本任务外使用

- [ ] **Step 1: 写页面**

创建 `src/pages/Kols.tsx`：

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { AlertTriangle, Users } from 'lucide-react';
import { fetchPalaceKols, fetchPalaceMeta } from '@/lib/api';
import { FOCUS_RING, biasText, filterKols, isStale, sortKols, splitGroupName } from '@/lib/palace';
import type { KolSortKey } from '@/lib/palace';
import type { PalaceKol, PalaceMeta } from '@/types/api';
import { useStore } from '@/store/useStore';

const SORTS: Array<{ key: KolSortKey; label: string }> = [
  { key: 'active', label: '活跃度' },
  { key: 'opinion', label: '观点数' },
  { key: 'stocks', label: '股票数' },
];

/** 多空倾向条：绿多红空（A 股惯例），两侧给数字不只用颜色 */
function BiasBar({ bull, bear }: { bull: number; bear: number }) {
  const total = bull + bear;
  const bullPct = total ? Math.round((bull / total) * 100) : 0;

  return (
    <>
      <div className="relative h-1.5 rounded-full overflow-hidden bg-surface-2">
        <div className="absolute left-0 top-0 h-full bg-brand-green rounded-full"
             style={{ width: `${bullPct}%` }} />
        <div className="absolute top-0 h-full bg-brand-red rounded-full"
             style={{ left: `${bullPct}%`, width: `${100 - bullPct}%` }} />
      </div>
      <div className="flex justify-between text-[11px] text-ink-tertiary mt-1.5">
        <span className="tabular-nums">
          {biasText(bull, bear)} {total ? `${bullPct}%` : '—'}
        </span>
        <span className="tabular-nums">多 {bull} · 空 {bear}</span>
      </div>
    </>
  );
}

/** 断更的群渲染成不可点的降级卡片（spec §9.6） */
function StaleCard({ kol }: { kol: PalaceKol }) {
  const { no, label } = splitGroupName(kol.name);

  return (
    <div className="rounded-[14px] p-4 border border-hairline/10 bg-surface-1
                    bg-[repeating-linear-gradient(135deg,transparent,transparent_6px,rgba(128,128,128,0.06)_6px,rgba(128,128,128,0.06)_12px)]
                    opacity-70">
      <div className="flex items-center gap-2 mb-2">
        {no && <span className="text-ink-tertiary text-xs tabular-nums">{no}</span>}
        <span className="text-ink-secondary font-medium text-sm">{label}</span>
      </div>
      <div className="flex items-center gap-1.5 text-ink-tertiary text-xs mb-2">
        <AlertTriangle size={13} />
        近 30 天无消息 · 数据缺失
      </div>
      <div className="text-ink-tertiary text-[11px] tabular-nums">
        — 只票 · — 观点 · 最后 {kol.last_ts.slice(0, 10) || '未知'}
      </div>
    </div>
  );
}

function KolCard({ kol }: { kol: PalaceKol }) {
  const { no, label } = splitGroupName(kol.name);
  const { bias, trading, top_sectors: sectors } = kol.style;

  return (
    <Link
      to={`/kol/${kol.chat_id}`}
      className={`block rounded-[14px] p-4 border border-hairline/10 bg-surface-1
                  hover:bg-surface-2 hover:border-hairline/20 transition-colors ${FOCUS_RING}`}
    >
      <div className="flex items-baseline gap-2 mb-2">
        {no && <span className="text-ink-tertiary text-xs tabular-nums">{no}</span>}
        <span className="text-ink-primary font-semibold text-sm">{label}</span>
        <span className="text-ink-tertiary text-[11px]">{kol.active_days} 天</span>
      </div>

      {trading.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2.5">
          {trading.map((t) => (
            <span key={t}
                  className="px-1.5 py-0.5 rounded-md bg-surface-2 text-ink-secondary text-[10.5px]">
              {t}
            </span>
          ))}
        </div>
      )}

      <BiasBar bull={bias.bull} bear={bias.bear} />

      {sectors.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2.5">
          {sectors.slice(0, 3).map(([name]) => (
            <span key={name}
                  className="px-1.5 py-0.5 rounded-md bg-surface-2 text-brand-blue text-[10.5px]">
              {name}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 pt-2.5 border-t border-hairline/10 text-ink-tertiary text-[11px] tabular-nums">
        {kol.stock_count} 只票 · {kol.opinion_count} 观点 · {kol.last_ts.slice(0, 10) || '—'}
      </div>
    </Link>
  );
}

/** 搜索无结果：说明原因 + 给替代出口（spec §9.6） */
function NoResult({ query, hot, onClear }: {
  query: string;
  hot: Array<{ code: string; name: string }>;
  onClear: () => void;
}) {
  return (
    <div className="rounded-[14px] border border-dashed border-hairline/20 p-8 text-center">
      <p className="text-ink-secondary text-sm mb-2">没有匹配「{query}」的群</p>
      <p className="text-ink-tertiary text-xs mb-4">
        搜索只匹配群号与群名，不搜观点正文。换个关键词，或直接看这几只热票。
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button onClick={onClear}
                className={`px-3 py-1 rounded-md bg-surface-2 text-ink-secondary text-xs
                            hover:text-ink-primary transition-colors ${FOCUS_RING}`}>
          清空搜索
        </button>
        {hot.map((s) => (
          <Link key={s.code} to={`/stock/${s.code}`}
                className={`px-3 py-1 rounded-md bg-surface-2 text-brand-blue text-xs
                            hover:bg-surface-3 transition-colors ${FOCUS_RING}`}>
            {s.name}
          </Link>
        ))}
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div role="status" aria-live="polite" className="space-y-4">
      <span className="sr-only">正在加载大V 列表…</span>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="rounded-[14px] p-4 border border-hairline/10 bg-surface-1 animate-pulse">
            <div className="h-3.5 w-24 bg-surface-2 rounded mb-3" />
            <div className="h-2 w-full bg-surface-2 rounded mb-2" />
            <div className="h-2 w-2/3 bg-surface-2 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Kols() {
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const sortKey = (params.get('sort') as KolSortKey | null) ?? 'active';

  const [kols, setKols] = useState<PalaceKol[]>([]);
  const [meta, setMeta] = useState<PalaceMeta | null>(null);
  const [loading, setLoading] = useState(true);

  const reduceMotion = useReducedMotion();
  const rawTop = useStore((s) => s.currentSnapshot?.stk);
  const hot = useMemo(
    () => (rawTop ?? []).slice(0, 4).map((s) => ({ code: s.c, name: s.n })),
    [rawTop],
  );

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchPalaceKols(), fetchPalaceMeta()])
      .then(([list, m]) => {
        if (cancelled) return;
        setKols(list.kols);
        setMeta(m);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const refTs = meta?.coverage?.to ?? '';
  const visible = useMemo(
    () => (refTs ? sortKols(filterKols(kols, query), sortKey, refTs) : filterKols(kols, query)),
    [kols, query, sortKey, refTs],
  );

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const missingDays = meta?.coverage?.missing_days ?? [];

  // spec §9.5 第 5 条：卡片墙支持 ←/→ 在卡片间移动。
  // 焦点在卡片（<Link>）上时，方向键按栅格列数在兄弟链接间移动；
  // 断更卡片是 div、不是链接，天然被跳过（本来就不可点入）。
  const gridRef = useRef<HTMLDivElement>(null);
  const onGridKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 'row', ArrowUp: '-row' }[
      e.key as 'ArrowRight' | 'ArrowLeft' | 'ArrowDown' | 'ArrowUp'
    ];
    if (step === undefined) return;

    const nodes = Array.from(gridRef.current?.querySelectorAll<HTMLElement>('a[href]') ?? []);
    const i = nodes.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;

    const cols = window.matchMedia('(min-width: 1024px)').matches
      ? 4
      : window.matchMedia('(min-width: 640px)').matches
        ? 2
        : 1;
    const delta = step === 'row' ? cols : step === '-row' ? -cols : (step as number);
    e.preventDefault();
    nodes[(i + delta + nodes.length) % nodes.length]?.focus();
  };

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.3 }}
      className="space-y-5"
    >
      <div className="flex flex-wrap items-center gap-3 pb-4 border-b border-hairline/10">
        <Users size={22} className="text-brand-blue" />
        <h1 className="text-2xl font-semibold text-ink-primary tracking-tight">大V</h1>
        {meta && (
          <span className="text-ink-tertiary text-xs tabular-nums">
            {meta.coverage.groups} 个群 · 覆盖 {meta.coverage.from || '—'} → {meta.coverage.to || '—'}
          </span>
        )}
      </div>

      {missingDays.length > 0 && (
        <div className="flex items-start gap-2 rounded-[12px] border border-hairline/10 bg-surface-1 px-3 py-2">
          <AlertTriangle size={14} className="text-brand-yellow mt-0.5 shrink-0" />
          <p className="text-ink-tertiary text-xs">
            数据缺口 {missingDays.length} 个交易日：
            <span className="tabular-nums">{missingDays[0]} ~ {missingDays[missingDays.length - 1]}</span>
            ，缺口内这些群没有观点。
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label htmlFor="kol-q" className="text-ink-tertiary text-xs shrink-0">搜索大V</label>
          <input
            id="kol-q"
            type="search"
            value={query}
            onChange={(e) => setParam('q', e.target.value)}
            placeholder="群号或群名，如 253 / 橙子"
            className={`w-56 px-3 py-1.5 rounded-md bg-surface-2 border border-hairline/10
                        text-ink-primary text-xs placeholder:text-ink-tertiary ${FOCUS_RING}`}
          />
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <span className="text-ink-tertiary text-xs">排序</span>
          <div className="flex rounded-md bg-surface-2 p-0.5">
            {SORTS.map((s) => (
              <button
                key={s.key}
                type="button"
                aria-pressed={sortKey === s.key}
                onClick={() => setParam('sort', s.key)}
                className={`px-2.5 py-1 rounded text-xs transition-colors ${FOCUS_RING} ${
                  sortKey === s.key
                    ? 'bg-surface-3 text-ink-primary font-semibold'
                    : 'text-ink-tertiary hover:text-ink-secondary'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <Skeleton />
      ) : visible.length === 0 ? (
        <NoResult query={query} hot={hot} onClear={() => setParam('q', '')} />
      ) : (
        <div
          ref={gridRef}
          onKeyDown={onGridKeyDown}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3"
        >
          {visible.map((k) =>
            isStale(k, refTs) ? (
              <StaleCard key={k.chat_id} kol={k} />
            ) : (
              <KolCard key={k.chat_id} kol={k} />
            ),
          )}
        </div>
      )}
    </motion.div>
  );
}
```

- [ ] **Step 2: 注册路由**

在 `src/App.tsx` 的 lazy 声明区（`const Chain = ...` 之后）加：

```tsx
const Kols = lazy(() => import('@/pages/Kols'));
```

在 `<Route path="chain" ...>` 之后加：

```tsx
        <Route
          path="kols"
          element={
            <Suspense fallback={<RouteFallback />}>
              <Kols />
            </Suspense>
          }
        />
```

- [ ] **Step 3: 加导航入口并修正 active 判定**

在 `src/components/Navbar.tsx`：

1. 图标 import 里加 `Users`。
2. `navItems` 末尾加 `{ path: '/kols', label: '大V', icon: Users },`。
3. 在 `navItems` 声明之后加一段别名（详情页路由 `/kol/:chatId` 用**单数** `kol`，与列表页 `/kols` 不同段，纯前缀匹配覆盖不到）：

```tsx
/** 详情页与列表页不同段（/kol/ vs /kols），故「大V」入口额外认领这些前缀。 */
const EXTRA_PREFIXES: Record<string, string[]> = { '/kols': ['/kol/'] };
```

4. 把两处 `const isActive = location.pathname === item.path;`（桌面端与移动端各一处）都换成：

```tsx
            const isActive =
              item.path === '/'
                ? location.pathname === '/'
                : location.pathname === item.path ||
                  location.pathname.startsWith(`${item.path}/`) ||
                  (EXTRA_PREFIXES[item.path] ?? []).some((p) => location.pathname.startsWith(p));
```

> 注意：通用前缀匹配对**现有**路由全是空转（没有任何 `navItems` 路径是既有路由的前缀），它的作用是为将来可能出现的嵌套路由兜底；真正让「大V」在 `/kol/:chatId` 详情页保持高亮的是 `EXTRA_PREFIXES`。不要写「修掉 `/stock/:code` 不亮导航」这类说法——`/stock/:code` 没有对应导航项，那是错的。

- [ ] **Step 4: 起 dev server 人工验证**

Run: `npm run dev`
在浏览器打开 `/kols`，逐项确认：
1. 卡片墙 4 列，窄到 900px 变 2 列。
2. 三个排序按钮点击后选中态变化，URL 出现 `?sort=opinion`；刷新后排序保持。
3. 搜索框有可见标签「搜索大V」；输入 `253` 过滤生效，URL 出现 `?q=253`。
4. 输入 `京东方` → 出现无结果态（说明原因 + 热票出口 + 清空搜索）。
5. 点卡片进入 `/kol/<chat_id>`；导航「大V」高亮。
6. 键盘 Tab 走一遍：所有控件有可见焦点环，顺序合理。
7. 断更的群（若有）显示为斜纹卡片且点不动。
8. 焦点落在卡片上后按 ←/→/↑/↓，焦点在卡片间按栅格移动，不会跑出卡片墙；断更卡片被跳过（spec §9.5 第 5 条）。

- [ ] **Step 5: 类型检查 + 提交**

Run: `npx tsc -b`
Expected: 无输出

```bash
git add src/pages/Kols.tsx src/App.tsx src/components/Navbar.tsx
git commit -m "feat(palace): /kols 大V 列表页与导航入口"
```

---

### Task 11: `/kol/:chatId` 大V 详情页

**Files:**
- Create: `src/pages/KolDetail.tsx`
- Modify: `src/App.tsx`（2 条路由）

**Interfaces:**
- Consumes: `fetchPalaceKol`、`fetchPalaceKolStock`、`src/lib/palace.ts`、`useParams` / `useNavigate`
- Produces: 路由 `/kol/:chatId` 与 `/kol/:chatId/:code`

- [ ] **Step 1: 写页面**

创建 `src/pages/KolDetail.tsx`：

```tsx
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { AlertTriangle, ArrowLeft, Clock } from 'lucide-react';
import { fetchPalaceKol, fetchPalaceKolStock } from '@/lib/api';
import { FOCUS_RING, ROW_GRID, biasText, splitGroupName } from '@/lib/palace';
import type { PalaceKolDetail, PalaceKolStock, PalaceOpinion } from '@/types/api';

/** 表头排序键 */
type StockSortKey = 'count' | 'bias' | 'last';

/** 表头与行共享同一套 class，保证列宽一致 */
const ROW_BASE = `w-full text-left ${ROW_GRID}`;

function ProfileStrip({ kol }: { kol: PalaceKolDetail }) {
  const { bias, trading, breadth, top_sectors: sectors, session } = kol.style;
  const total = bias.bull + bias.bear;
  const bullPct = total ? Math.round((bias.bull / total) * 100) : 0;

  return (
    <div className="rounded-[14px] bg-surface-1 border border-hairline/10 p-4
                    grid grid-cols-1 md:grid-cols-4 gap-4">
      <div>
        <div className="text-ink-tertiary text-[11px] mb-1.5">多空倾向</div>
        <div className="text-ink-primary text-lg font-semibold tabular-nums mb-2">
          {bias.label} {bias.ratio === null ? '' : `${Math.round(bias.ratio * 100)}%`}
        </div>
        <div className="relative h-1.5 rounded-full overflow-hidden bg-surface-2">
          <div className="absolute left-0 top-0 h-full bg-brand-green rounded-full"
               style={{ width: `${bullPct}%` }} />
          <div className="absolute top-0 h-full bg-brand-red rounded-full"
               style={{ left: `${bullPct}%`, width: `${100 - bullPct}%` }} />
        </div>
        <div className="text-ink-tertiary text-[11px] mt-1.5 tabular-nums">
          多 {bias.bull} · 空 {bias.bear}
        </div>
      </div>

      <div>
        <div className="text-ink-tertiary text-[11px] mb-1.5">操作风格</div>
        <div className="flex flex-wrap gap-1 mb-2">
          {trading.length > 0 ? trading.map((t) => (
            <span key={t} className="px-2 py-0.5 rounded-md bg-surface-2 text-ink-secondary text-[11px]">
              {t}
            </span>
          )) : <span className="text-ink-tertiary text-[11px]">无</span>}
        </div>
        <div className="text-ink-tertiary text-[11px] tabular-nums">
          集中度 {Math.round(breadth.concentration * 100)}%
          （{breadth.concentration >= 0.5 ? '集中' : '偏分散'}）
        </div>
      </div>

      <div>
        <div className="text-ink-tertiary text-[11px] mb-1.5">覆盖广度</div>
        <div className="text-ink-primary text-lg font-semibold tabular-nums">{kol.stock_count} 只</div>
        <div className="text-ink-tertiary text-[11px] mt-1 tabular-nums">
          消息 {kol.msg_count} · 观点 {kol.opinion_count}
        </div>
      </div>

      <div>
        <div className="text-ink-tertiary text-[11px] mb-1.5">活跃</div>
        <div className="text-ink-primary text-lg font-semibold tabular-nums">{kol.active_days} 天</div>
        <div className="text-ink-tertiary text-[11px] mt-1 tabular-nums">
          盘中 {Math.round(session.intraday * 100)}% / 盘外 {Math.round(session.after_hours * 100)}%
        </div>
        {sectors.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {sectors.slice(0, 3).map(([name]) => (
              <span key={name} className="px-1.5 py-0.5 rounded-md bg-surface-2 text-brand-blue text-[10.5px]">
                {name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Timeline({ opinions, name }: { opinions: PalaceOpinion[]; name: string }) {
  if (opinions.length === 0) {
    return (
      <p className="text-ink-tertiary text-xs py-6 text-center">这只票在该群没有观点正文。</p>
    );
  }

  return (
    <div className="flex flex-col gap-3 max-h-[520px] overflow-auto pr-1">
      {opinions.map((o, i) => (
        <div key={`${o.id}-${o.ts}-${i}`} className="grid grid-cols-[78px_1fr] gap-3">
          <div className="text-ink-tertiary text-[11px] tabular-nums pt-1">{o.ts.slice(5)}</div>
          <div className="rounded-[10px] bg-surface-2 border border-hairline/10 p-3">
            <div className="flex flex-wrap gap-1.5 mb-2">
              {o.bull && (
                <span className="px-2 py-0.5 rounded-md bg-brand-green/15 text-brand-green text-[10.5px]">
                  看多
                </span>
              )}
              {o.bear && (
                <span className="px-2 py-0.5 rounded-md bg-brand-red/15 text-brand-red text-[10.5px]">
                  看空
                </span>
              )}
              {o.actions.map((a) => (
                <span key={a} className="px-2 py-0.5 rounded-md bg-surface-3 text-ink-secondary text-[10.5px]">
                  {a}
                </span>
              ))}
              {o.sectors.map((s) => (
                <span key={s} className="text-ink-tertiary text-[10.5px]">{s}</span>
              ))}
            </div>
            <p className="text-ink-secondary text-xs leading-relaxed whitespace-pre-wrap">{o.text}</p>
          </div>
        </div>
      ))}
      <div className="text-ink-tertiary text-[11px] text-right">
        共 {opinions.length} 条 · {name}
      </div>
    </div>
  );
}

export default function KolDetail() {
  const { chatId = '', code } = useParams();
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();

  const [kol, setKol] = useState<PalaceKolDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<StockSortKey>('count');
  const [sortAsc, setSortAsc] = useState(false);
  const [opinions, setOpinions] = useState<PalaceOpinion[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchPalaceKol(chatId)
      .then((k) => {
        if (!cancelled) setKol(k);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [chatId]);

  // 未选中股票时，默认落到提及最多的那只（用 replace 保持历史干净）
  useEffect(() => {
    if (!code && kol && kol.stocks.length > 0) {
      navigate(`/kol/${chatId}/${kol.stocks[0].code}`, { replace: true });
    }
  }, [code, kol, chatId, navigate]);

  useEffect(() => {
    if (!code) {
      setOpinions([]);
      return;
    }
    let cancelled = false;
    fetchPalaceKolStock(chatId, code).then((ops) => {
      if (!cancelled) setOpinions(ops);
    });
    return () => {
      cancelled = true;
    };
  }, [chatId, code]);

  const stocks = useMemo(() => {
    const list = kol?.stocks ?? [];
    const weight = (s: PalaceKolStock) =>
      sortKey === 'bias' ? s.bull - s.bear : sortKey === 'last' ? s.last_ts : s.count;
    const sorted = [...list].sort((a, b) => {
      const wa = weight(a);
      const wb = weight(b);
      if (wa === wb) return a.code.localeCompare(b.code);
      return sortAsc ? (wa < wb ? -1 : 1) : (wa < wb ? 1 : -1);
    });
    return sorted;
  }, [kol, sortKey, sortAsc]);

  const toggleSort = (key: StockSortKey) => {
    if (sortKey === key) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(key === 'last');
    }
  };

  if (loading) {
    return (
      <div role="status" aria-live="polite" className="space-y-4">
        <span className="sr-only">正在加载大V 详情…</span>
        <div className="h-28 rounded-[14px] bg-surface-1 border border-hairline/10 animate-pulse" />
        <div className="h-64 rounded-[14px] bg-surface-1 border border-hairline/10 animate-pulse" />
      </div>
    );
  }

  if (!kol) {
    return (
      <div className="rounded-[14px] border border-dashed border-hairline/20 p-10 text-center">
        <AlertTriangle size={28} className="text-ink-tertiary mx-auto mb-3" />
        <p className="text-ink-secondary text-sm mb-1">找不到这个大V（{chatId}）</p>
        <p className="text-ink-tertiary text-xs mb-5">可能还没跑 built_palace，或这个群不在接入的 25 个群里。</p>
        <Link to="/kols"
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-[10px] bg-surface-2
                          text-ink-secondary hover:text-ink-primary text-sm ${FOCUS_RING}`}>
          <ArrowLeft size={15} /> 返回大V 列表
        </Link>
      </div>
    );
  }

  const { no, label } = splitGroupName(kol.name);
  const selected = stocks.find((s) => s.code === code) ?? null;

  const header = (key: StockSortKey, text: string) => (
    <button
      type="button"
      aria-sort={sortKey === key ? (sortAsc ? 'ascending' : 'descending') : 'none'}
      onClick={() => toggleSort(key)}
      className={`text-left text-[11px] transition-colors ${FOCUS_RING} ${
        sortKey === key ? 'text-brand-blue font-semibold' : 'text-ink-tertiary hover:text-ink-secondary'
      }`}
    >
      {text}
      <span aria-hidden="true" className="ml-0.5">
        {sortKey === key ? (sortAsc ? '↑' : '↓') : ''}
      </span>
    </button>
  );

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.3 }}
      className="space-y-4"
    >
      <div className="flex items-center gap-3 pb-4 border-b border-hairline/10">
        <Link to="/kols"
              className={`p-1.5 rounded-md text-ink-tertiary hover:text-ink-primary ${FOCUS_RING}`}
              aria-label="返回大V 列表">
          <ArrowLeft size={18} />
        </Link>
        {no && <span className="text-ink-tertiary text-sm tabular-nums">{no}</span>}
        <h1 className="text-2xl font-semibold text-ink-primary tracking-tight">{label}</h1>
        <span className="text-ink-tertiary text-xs tabular-nums ml-auto">
          最后活跃 {kol.last_ts.slice(0, 10) || '—'}
        </span>
      </div>

      <ProfileStrip kol={kol} />

      <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_1fr] gap-4">
        <div className="rounded-[14px] bg-surface-1 border border-hairline/10 p-4">
          <div className={`${ROW_GRID} pb-2 mb-1 border-b border-hairline/10`}>
            <span className="text-ink-tertiary text-[11px]">股票</span>
            {header('count', '提及')}
            {header('bias', '多空', 'max-[1000px]:hidden')}
            <span className="text-ink-tertiary text-[11px]">最近操作</span>
            {header('last', '最近', 'max-[1000px]:hidden')}
          </div>

          {stocks.length === 0 ? (
            <p className="text-ink-tertiary text-xs py-6 text-center">该群还没有可归因的观点。</p>
          ) : (
            <div className="flex flex-col">
              {stocks.map((s) => {
                const on = s.code === code;
                return (
                  <button
                    key={s.code}
                    type="button"
                    aria-current={on}
                    onClick={() => navigate(`/kol/${chatId}/${s.code}`)}
                    className={`${ROW_BASE} px-2 py-2.5 rounded-md border-l-2 transition-colors
                                ${FOCUS_RING} ${
                      on
                        ? 'border-l-brand-blue bg-surface-2'
                        : 'border-l-transparent hover:bg-surface-2'
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="text-ink-primary text-[13px]">{s.name || s.code}</span>
                      <span className="text-ink-tertiary text-[11px] ml-2 tabular-nums">{s.code}</span>
                    </span>
                    <span className="text-ink-secondary text-[13px] tabular-nums">{s.count}</span>
                    <span className="text-[12px] tabular-nums max-[1000px]:hidden">
                      <b className="text-brand-green font-medium">+{s.bull}</b>
                      <i className="text-brand-red font-normal not-italic ml-1">−{s.bear}</i>
                      <span className="text-ink-tertiary ml-1.5">{biasText(s.bull, s.bear)}</span>
                    </span>
                    <span className="flex flex-wrap gap-1">
                      {s.actions.slice(0, 2).map((a) => (
                        <span key={a} className="px-1.5 py-0.5 rounded bg-surface-3 text-ink-secondary text-[10.5px]">
                          {a}
                        </span>
                      ))}
                    </span>
                    <span className="text-ink-tertiary text-[11px] tabular-nums max-[1000px]:hidden">
                      {s.last_ts.slice(5, 10) || '—'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-[14px] bg-surface-1 border border-hairline/10 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock size={15} className="text-brand-blue" />
            <h2 className="text-ink-primary font-semibold text-sm">
              {selected ? `${selected.name || selected.code} · 观点时间线` : '观点时间线'}
            </h2>
            <span className="text-ink-tertiary text-[11px] tabular-nums ml-auto">
              {opinions.length} 条
            </span>
            {selected && (
              <Link
                to={`/stock/${selected.code}?from=${chatId}`}
                className={`shrink-0 text-brand-blue text-[11px] hover:underline ${FOCUS_RING}`}
              >
                个股页 →
              </Link>
            )}
          </div>
          {code ? (
            <Timeline opinions={opinions} name={label} />
          ) : (
            <p className="text-ink-tertiary text-xs py-6 text-center">左侧点一只票看观点。</p>
          )}
        </div>
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 2: 注册路由**

在 `src/App.tsx` lazy 声明区 `const Kols = ...` 之后加：

```tsx
const KolDetail = lazy(() => import('@/pages/KolDetail'));
```

在 `path="kols"` 的 Route 之后加：

```tsx
        <Route
          path="kol/:chatId"
          element={
            <Suspense fallback={<RouteFallback />}>
              <KolDetail />
            </Suspense>
          }
        />
        <Route
          path="kol/:chatId/:code"
          element={
            <Suspense fallback={<RouteFallback />}>
              <KolDetail />
            </Suspense>
          }
        />
```

- [ ] **Step 3: 起 dev server 人工验证**

Run: `npm run dev`
1. 从 `/kols` 点一张卡 → `/kol/<chat_id>`，URL 立刻被 replace 成 `/kol/<chat_id>/<首只票>`。
2. 左表点另一行 → URL 变化，右侧时间线切换，该行左侧蓝条 + `aria-current`。
3. 表头「提及 / 多空 / 最近」点击切换升降序，箭头与 `aria-sort` 同步。
4. 窄到 900px：「多空」「最近」两列消失，无横向滚动条。
5. 直接访问 `/kol/不存在` → 空态卡片 + 返回链接，不白屏。
6. 键盘 Tab：表头按钮、行按钮都可达且有焦点环。

- [ ] **Step 4: 类型检查 + 提交**

Run: `npx tsc -b`
Expected: 无输出

```bash
git add src/pages/KolDetail.tsx src/App.tsx
git commit -m "feat(palace): /kol/:chatId 画像 + 左表右时间线"
```

---

### Task 12: 个股页新增「大V观点」区块

**Files:**
- Modify: `src/pages/StockDetail.tsx`

**Interfaces:**
- Consumes: `fetchPalaceStock`、`src/lib/palace.ts` 的 `FOCUS_RING` / `ROW_GRID` / `biasText`
- Produces: `PalaceStockSection`（同文件内 top-level function）

- [ ] **Step 1: 加区块组件**

在 `src/pages/StockDetail.tsx` 里、`export default function StockDetail()` **之前**插入：

```tsx
/* ---- 大V 观点（Mind Palace）---- */

function PalaceStockSection({ code }: { code: string }) {
  const [data, setData] = useState<PalaceStockDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchPalaceStock(code)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (loading) {
    return (
      <div role="status" aria-live="polite"
           className="bg-surface-1 border border-hairline/10 rounded-[14px] p-5">
        <span className="sr-only">正在加载大V 观点…</span>
        <div className="h-4 w-32 bg-surface-2 rounded mb-3 animate-pulse" />
        <div className="h-3 w-full bg-surface-2 rounded mb-2 animate-pulse" />
        <div className="h-3 w-2/3 bg-surface-2 rounded animate-pulse" />
      </div>
    );
  }

  // 后端 404 / 索引缺失都走这里：如实说明，不留白屏
  if (!data || data.groups.length === 0) {
    return (
      <div className="bg-surface-1 border border-hairline/10 rounded-[14px] p-5">
        <h3 className="text-ink-primary font-semibold text-base mb-3 flex items-center gap-2">
          <Users size={18} className="text-brand-purple" />
          大V 观点
        </h3>
        <p className="text-ink-tertiary text-xs">
          还没有大V 讨论过这只票。观点来自接入的 25 个付费群，需要先跑完回补与索引。
        </p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.45 }}
      className="bg-surface-1 border border-hairline/10 rounded-[14px] p-4"
    >
      <h3 className="text-ink-primary font-semibold text-base mb-3 flex items-center gap-2">
        <Users size={18} className="text-brand-purple" />
        大V 观点
        <span className="text-ink-tertiary text-xs font-normal tabular-nums">
          {data.group_count} 个群讨论过 · 共 {data.total_mentions} 条
        </span>
      </h3>

      <div className={`${ROW_GRID} pb-2 mb-1 border-b border-hairline/10 text-ink-tertiary text-[11px]`}>
        <span>大V / 群</span>
        <span>提及</span>
        <span className="max-[1000px]:hidden">多空</span>
        <span>最近操作</span>
        <span className="max-[1000px]:hidden">最近</span>
      </div>

      <div className="flex flex-col">
        {data.groups.map((g) => (
          <Link
            key={g.chat_id}
            to={`/kol/${g.chat_id}/${code}`}
            className={`${ROW_GRID} px-2 py-2.5 rounded-md hover:bg-surface-2
                        transition-colors ${FOCUS_RING}`}
          >
            <span className="text-ink-primary text-[13px] truncate">{g.name}</span>
            <span className="text-ink-secondary text-[13px] tabular-nums">{g.count}</span>
            <span className="text-[12px] tabular-nums max-[1000px]:hidden">
              <b className="text-brand-green font-medium">+{g.bull}</b>
              <i className="text-brand-red font-normal not-italic ml-1">−{g.bear}</i>
              <span className="text-ink-tertiary ml-1.5">{biasText(g.bull, g.bear)}</span>
            </span>
            <span className="flex flex-wrap gap-1">
              {g.actions.slice(0, 2).map((a) => (
                <span key={a} className="px-1.5 py-0.5 rounded bg-surface-3 text-ink-secondary text-[10.5px]">
                  {a}
                </span>
              ))}
            </span>
            <span className="text-ink-tertiary text-[11px] tabular-nums max-[1000px]:hidden">
              {g.last_ts.slice(5, 10) || '—'}
            </span>
          </Link>
        ))}
      </div>

      <p className="text-ink-tertiary text-[11px] mt-3">
        覆盖 {data.first_ts.slice(0, 10) || '—'} → {data.last_ts.slice(0, 10) || '—'}
      </p>
    </motion.div>
  );
}
```

- [ ] **Step 2: 在页面底部挂上**

在 `export default function StockDetail()` 的 return 里，`<StockComparison currentStock={stock} />` **之后**、闭合 `</motion.div>` 之前插入：

```tsx
      {/* 从大V 详情跳来时的回程入口（spec §9.5 第 2 条） */}
      {from && code && (
        <Link
          to={`/kol/${from}/${code}`}
          className={`inline-flex items-center gap-1.5 text-brand-blue text-xs ${FOCUS_RING}`}
        >
          <ArrowLeft size={13} /> 回到该大V 的观点
        </Link>
      )}

      {/* 大V 观点（Mind Palace） */}
      {code && <PalaceStockSection code={code} />}
```

> `code` 来自 `useParams<{ code: string }>()`，类型是 `string | undefined`。
> 必须写成 `{code && ...}` 才能通过 `tsc -b`。
> `from` 在 `StockDetail()` 开头取：
>
> ```tsx
> const [searchParams] = useSearchParams();
> const from = searchParams.get('from');
> ```

- [ ] **Step 3: 补 import**

在 `src/pages/StockDetail.tsx` 顶部：
- `lucide-react` 的 import 列表里加 `ArrowLeft` 和 `Users`
- `react-router-dom` 的 import 列表里加 `useSearchParams`（`Link` 已导入）
- 加 `import { fetchPalaceStock } from '@/lib/api';`（若 `fetchStockMessages` 已从该模块导入，合并到同一行）
- 加 `import { FOCUS_RING, ROW_GRID, biasText } from '@/lib/palace';`
- 在 `@/types/api` 的 `import type` 列表里加 `PalaceStockDetail`

- [ ] **Step 4: 起 dev server 人工验证**

Run: `npm run dev`
访问 `/stock/301308`：
1. 页面底部出现「大V 观点」区块，既有区块的位置与行为没有变化。
2. 点任一行的群名 → 跳到 `/kol/<chat_id>/301308`，左侧表里该票是选中态。
3. 换一只没有大V 讨论的票 → 显示空态说明文字，不是空白。
4. 窄到 900px：区块去掉「多空」「最近」两列。
5. 直接访问 `/stock/301308?from=<chat_id>` → 顶部出现「回到该大V 的观点」链接，点它回到 `/kol/<chat_id>/301308`；不带 `?from=` 时不出现（spec §9.5 第 2 条）。

- [ ] **Step 5: 类型检查 + 提交**

Run: `npx tsc -b`
Expected: 无输出

```bash
git add src/pages/StockDetail.tsx
git commit -m "feat(palace): 个股页新增大V 观点区块"
```

---

### Task 13: 接入每日调度

**Files:**
- Create: `scripts/palace_daily.sh`
- Modify: `docs/superpowers/specs/2026-09-11-mind-palace-design.md`（§10 补实际落点、§9.4 修正路由条数）

**Interfaces:**
- Consumes: `scripts/build_palace.py`
- Produces: 一个可被 crontab 调用的入口

- [ ] **Step 1: 写脚本**

创建 `scripts/palace_daily.sh`：

```bash
#!/usr/bin/env bash
# 每日收盘后重建观点宫殿索引。
# 档案由实时采集（每 5 分钟）持续追加，这里只做派生索引的重建。
set -euo pipefail

export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR/.."
LOG_FILE="${PALACE_LOG:-/tmp/hot_dashboard_palace.log}"

cd "$PROJECT_DIR" || exit 1
echo "[$(date '+%Y-%m-%d %H:%M')] 开始重建 palace 索引" >> "$LOG_FILE"
python3 scripts/build_palace.py >> "$LOG_FILE" 2>&1
echo "[$(date '+%Y-%m-%d %H:%M')] 完成" >> "$LOG_FILE"
```

- [ ] **Step 2: 赋可执行权限并手工验证**

Run:
```bash
chmod +x scripts/palace_daily.sh
bash scripts/palace_daily.sh && tail -5 /tmp/hot_dashboard_palace.log
```
Expected: 日志末尾出现「完成」，且 `data/palace/kols.json` 存在。

- [ ] **Step 3: 记录 cron 配置（由运维手工添加）**

**不要在计划里自动安装 cron。** 在云端机器的 crontab 里手工加这一行：

```
10 16 * * 1-5 cd /root/git/hot-dashboard && bash scripts/palace_daily.sh
```

> 选 16:10 是因为 A 股 15:00 收盘、实时采集的最后一轮落在 16:00 前；等采集收尾再重建索引。
> 需要更早看到当天观点可改为 `35 15 * * 1-5`。

- [ ] **Step 4: 更新 spec §10 与 §9.4**

把 spec §10 的第一条 bullet 改成：

```markdown
- `scripts/palace_daily.sh` 由云端 crontab 每个交易日 16:10 调用，跑 `scripts/build_palace.py` 重建索引。档案由实时采集（每 5 分钟）持续追加，所以这里不需要回补。
```

再把 spec §9.4 的「新增两条路由」改成「新增三条路由」：

```markdown
`Navbar` 新增「大V」入口指向 `/kols`。`App.tsx` 新增三条路由（`/kols`、`/kol/:chatId`、`/kol/:chatId/:code`，后两条复用同一个 `KolDetail` 组件），沿用现有 `Suspense` + 懒加载写法。
```

- [ ] **Step 5: 提交**

```bash
git add scripts/palace_daily.sh docs/superpowers/specs/2026-09-11-mind-palace-design.md
git commit -m "feat(palace): 每日索引重建入口与调度说明"
```

---

## 与 spec 的已知偏离

| spec 处 | spec 原文 | 本计划的实现 | 理由 |
|---|---|---|---|
| §3 | 只列 `backend/palace.py` | 拆成 `palace_archive` / `palace_backfill` / `palace_build` / `palace` 四个模块 | 四件事的依赖方向与测试方式不同：抽取层要 import `analyzer`，档案层不能（避免循环依赖） |
| §4.1 | 档案行 `"sender": "ou_xxx"`（字符串） | 存 `sender.id` 字符串，落盘前从 `{id, id_type, ...}` 对象里取 | 真实 lark-cli 输出的 `sender` 是对象，spec 假设有误 |
| §9.4 | 「新增两条路由」 | 三条（`/kols`、`/kol/:chatId`、`/kol/:chatId/:code`） | §9.2 要求 `/kol/:chatId/:code` 深链、§9.5 第 2 条要求选中态进 URL，两条路由是必需的；由 Task 13 回改 spec |
| §9.5 第 5 条 | 卡片墙支持 ←/→ | 支持 ←/→/↑/↓ | 栅格是二维的，只给左右键在一个 4 列墙里不够用 |
| §9.5 第 6 条 | 「只保留入场淡入与 URL 变化闪烁两处」 | 只做了入场淡入；选中态用行样式即时反馈，没做独立的闪烁动画 | 「URL 变化闪烁」是允许项不是必做项；选中态已有可见样式（第 1 条），再加动画收益不大 |
| §12 | 档案体量「两个月约 6–8 万条」 | Task 2 Step 5 在云端实测后才定论 | 该数是下界估算，实测可能差一个量级，超 50 万条要停下来重新评估 |

## 收尾验收

全部任务完成后，在云端机器上按顺序跑一遍：

```bash
cd /root/git/hot-dashboard

# 1. 回补历史（首次，阻塞项）
python3 scripts/backfill.py --group all --since 2026-06-01

# 2. 重建索引
python3 scripts/build_palace.py

# 3. 起服务自测
python3 -m pytest -q
curl -s localhost:8765/api/palace/meta | python3 -m json.tool
curl -s localhost:8765/api/palace/kols | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d['kols']), '个群')"
```

前端 `npm run build` 通过后，浏览器走一遍 spec §9.6 的四种状态：加载中、搜索无结果、断更卡片、覆盖空洞提示。

**已知需要留意的两处**（spec §12 已记录）：
- 回补能否翻到 2026-06-01 由 Task 2 Step 5 实测决定；翻不到就如实反映在 `coverage.from`。
- `sender` 字段在现有 lark-cli 输出里是 `{id, id_type, sender_type, tenant_key}` 对象，本设计只存 `sender.id` 字符串。模型按「群 = 大V」归因，不消费该字段。
