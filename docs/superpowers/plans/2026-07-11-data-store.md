# DataStore 启动预加载 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 消除裸读 JSON + 按需缓存的性能瓶颈，实现 API 请求零磁盘 I/O。启动时全量预加载所有 day 文件到内存，collector 写入后自动增量更新。

**Architecture:** 新建 `DataStore` 类，启动时并行加载所有 `day_*.json` 文件，同时存储压缩后数据（供 `/api/day/*` 端点）和原始数据（供 sentiment-timeline / extreme-stats / stock-messages 端点）。`server.py` 所有端点改为调用 DataStore 方法。`collector.py` 写完文件后调用 `store.update_day()`。

**Tech Stack:** Python 3.11+, FastAPI, pathlib, concurrent.futures.ThreadPoolExecutor (启动时一次性使用)

## Global Constraints

- 数据目录：`data/`，day 文件格式 `day_YYYY-MM-DD.json`，最新快照 `latest.json`
- 压缩函数 `_compress_snapshot()` 从 `server.py` 移到 `data_store.py`，逻辑不变
- 内存占用：33 天 ≈ 150-200MB，可接受
- 容错：单天加载失败不阻塞启动，记录 warning 跳过
- 所有现有 API 端点返回数据格式不变
- 不引入外部数据库依赖

---

### Task 1: 创建 DataStore 类

**Files:**
- Create: `backend/data_store.py`

**Interfaces:**
- Consumes: `data_dir: Path`（数据目录路径）
- Produces:
  - `DataStore.startup()` → 无返回，预加载所有 day 文件 + latest.json
  - `DataStore.get_dates() -> list[str]` → 排序后的日期列表
  - `DataStore.get_dates_info() -> list[dict]` → `[{date, size_kb}]`
  - `DataStore.get_latest() -> dict | None` → 压缩后的最新快照
  - `DataStore.get_day(date) -> dict | None` → `{date, meta, snapshots}` 压缩后完整数据
  - `DataStore.get_snapshots(date, start=0, count=None) -> list[dict]` → 压缩快照切片
  - `DataStore.get_raw_day(date) -> dict | None` → 原始 day 数据（含 total_msgs, 原始 snapshots）
  - `DataStore.get_raw_snapshots(date) -> list[dict]` → 原始快照列表
  - `DataStore.update_day(date)` → 从磁盘重新加载某天数据
  - `DataStore.update_latest()` → 从磁盘重新加载 latest.json

- [ ] **Step 1: 创建 data_store.py 骨架**

```python
# backend/data_store.py
"""
DataStore — 启动时全量预加载，API 请求零磁盘 I/O
"""

import json
import logging
import time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

logger = logging.getLogger(__name__)


def _compress_snapshot(s):
    """压缩单个快照（线程安全，无共享状态）"""
    top10 = []
    for t in s.get("top10_stocks", []):
        top10.append({
            "c": t["code"], "n": t.get("name", ""), "h": t["score"], "sc": t["score"],
            "mc": t["mention_count"], "gc": t["group_count"],
            "ac": t["action_count"], "bu": t["bull"], "be": t["bear"],
            "ft": t.get("first_time", "").split(" ")[1] if t.get("first_time") else "",
            "lt": t.get("last_time", "").split(" ")[1] if t.get("last_time") else "",
            "sec": t.get("sectors", []), "s": t.get("sectors", []),
        })
    top8 = []
    for t in s.get("top8_sectors", []):
        gd = []
        for g in t.get("group_details", []):
            gd.append({
                "g": g["group"], "c": g["count"],
                "m": [{"t": m["time"].split(" ")[1], "x": m["text"]} for m in g["messages"]]
            })
        top8.append({
            "n": t["name"], "h": t["score"], "sc": t["score"],
            "m": t["mention_count"], "mc": t["mention_count"],
            "g": t["group_count"], "gc": t["group_count"],
            "s": [st["name"] for st in s.get("top10_stocks", []) if t["name"] in st.get("sectors", [])],
            "txt": (t.get("sample_text", ""))[:60],
            "gd": gd
        })
    sd = s.get("sentiment_detail", {})
    return {
        "t": s["time"], "msg": s["total_messages"], "grp": s["active_groups"],
        "sent": s.get("overall_sentiment", ""),
        "sd": {"bu": sd.get("bull", 0), "be": sd.get("bear", 0), "ne": sd.get("neutral", 0),
               "eh": sd.get("extreme_high", 0), "el": sd.get("extreme_low", 0)},
        "act": s.get("action_summary", {}),
        "stk": top10, "sec": top8
    }


class DataStore:
    def __init__(self, data_dir: Path):
        self.data_dir = data_dir
        self._days: dict[str, dict] = {}        # {date: compressed day data}
        self._raw: dict[str, dict] = {}          # {date: raw day data}
        self._latest: dict | None = None          # compressed latest snapshot
        self._latest_raw: dict | None = None      # raw latest data
        self._dates: list[str] = []               # sorted date list
        self._dates_info: dict[str, int] = {}     # {date: size_kb}

    def startup(self):
        """启动时全量预加载所有 day 文件 + latest.json"""
        t0 = time.time()
        day_files = sorted(self.data_dir.glob("day_*.json")) if self.data_dir.exists() else []

        # 并行加载所有 day 文件
        def _load_one(path: Path):
            date_str = path.stem.replace("day_", "")
            try:
                self._load_day(date_str, path)
            except Exception as e:
                logger.warning(f"预加载 {date_str} 失败: {e}")

        with ThreadPoolExecutor(max_workers=min(8, len(day_files) or 1)) as pool:
            pool.map(_load_one, day_files)

        # 加载 latest.json
        try:
            self.update_latest()
        except Exception as e:
            logger.warning(f"预加载 latest.json 失败: {e}")

        # 构建日期列表和 size 信息
        self._dates = sorted(self._days.keys())
        for date_str in self._dates:
            path = self.data_dir / f"day_{date_str}.json"
            if path.exists():
                self._dates_info[date_str] = round(path.stat().st_size / 1024, 1)

        elapsed = time.time() - t0
        logger.info(f"✅ 预加载完成: {len(self._days)} 天数据, 耗时 {elapsed:.1f}s")

    def _load_day(self, date_str: str, path: Path):
        """加载并压缩一天的数据到内存"""
        with open(path, encoding="utf-8") as f:
            raw = json.load(f)
        self._raw[date_str] = raw

        total = raw.get("total_msgs", 0)
        snapshots = raw.get("snapshots", [])
        if not total and snapshots:
            total = snapshots[-1].get("total_messages", 0)

        # 压缩所有快照
        compressed_snaps = [_compress_snapshot(s) for s in snapshots]

        meta = {
            "start": snapshots[0]["time"] if snapshots else "",
            "end": snapshots[-1]["time"] if snapshots else "",
            "count": len(snapshots),
            "message_count": total,
        }
        self._days[date_str] = {"date": raw.get("date", date_str), "meta": meta, "snapshots": compressed_snaps}

    def update_day(self, date_str: str):
        """增量更新某天（collector/upload 写完后调用）"""
        path = self.data_dir / f"day_{date_str}.json"
        if not path.exists():
            return
        try:
            self._load_day(date_str, path)
            if date_str not in self._dates:
                self._dates = sorted(self._days.keys())
            self._dates_info[date_str] = round(path.stat().st_size / 1024, 1)
        except Exception as e:
            logger.warning(f"更新 {date_str} 失败: {e}")

    def update_latest(self):
        """重新加载 latest.json"""
        latest_path = self.data_dir / "latest.json"
        if not latest_path.exists():
            self._latest = None
            self._latest_raw = None
            return
        with open(latest_path, encoding="utf-8") as f:
            raw = json.load(f)
        self._latest_raw = raw
        self._latest = _compress_snapshot(raw)

    def get_latest_raw(self) -> dict | None:
        return self._latest_raw

    def get_dates(self) -> list[str]:
        return list(self._dates)

    def get_dates_info(self) -> list[dict]:
        result = []
        for date_str in reversed(self._dates):
            result.append({"date": date_str, "size_kb": self._dates_info.get(date_str, 0)})
        return result

    def get_latest(self) -> dict | None:
        return self._latest

    def get_day(self, date_str: str) -> dict | None:
        return self._days.get(date_str)

    def get_snapshots(self, date_str: str, start: int = 0, count: int | None = None) -> list[dict]:
        day = self._days.get(date_str)
        if not day:
            return []
        snaps = day["snapshots"]
        if count is None or count <= 0:
            return snaps[start:]
        count = min(count, 100)
        return snaps[start:start + count]

    def get_raw_day(self, date_str: str) -> dict | None:
        return self._raw.get(date_str)

    def get_raw_snapshots(self, date_str: str) -> list[dict]:
        raw = self._raw.get(date_str)
        if not raw:
            return []
        return raw.get("snapshots", [])
```

- [ ] **Step 2: 验证文件创建成功**

Run: `python -c "from backend.data_store import DataStore; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/data_store.py
git commit -m "feat: add DataStore class with startup preload and incremental update"
```

---

### Task 2: 重构 server.py 使用 DataStore

**Files:**
- Modify: `backend/server.py`

**Interfaces:**
- Consumes: `DataStore` from `backend.data_store`
- Produces: 所有 API 端点改为调用 store 方法，返回格式不变

- [ ] **Step 1: 替换 imports 和全局变量**

在 `backend/server.py` 顶部，替换 imports：

```python
# 删除这行:
from concurrent.futures import ThreadPoolExecutor

# 新增:
from backend.data_store import DataStore
```

删除全局缓存变量（原 lines 43-45）：

```python
# 删除:
# ---- 响应缓存（同日期不重复处理） ----
_day_cache = {}  # {date_str: {"mtime": float, "data": dict}} 压缩后缓存
_raw_cache = {}  # {date_str: {"mtime": float, "data": dict}} 原始数据缓存（用于快照范围查询）
```

删除 `_compress_snapshot()` 函数（原 lines 48-84），已移到 `data_store.py`。

在 `app = FastAPI(...)` 之后、CORS 中间件之后，添加：

```python
store = DataStore(data_dir)

@app.on_event("startup")
def startup_event():
    store.startup()
```

- [ ] **Step 2: 重构 `/api/status` 端点**

`/api/status` 需要 latest.json 的 mtime 和 date 字段。DataStore 已在 Task 1 中提供 `get_latest_raw()`，直接使用：

```python
@app.get("/api/status")
def api_status():
    dates = store.get_dates()
    latest_raw = store.get_latest_raw()
    latest_time = None
    current_date = None

    latest_path = data_dir / "latest.json"
    if latest_path.exists():
        latest_time = datetime.fromtimestamp(latest_path.stat().st_mtime, tz=CST).strftime("%Y-%m-%d %H:%M")
        if latest_raw:
            current_date = latest_raw.get("date") or latest_raw.get("time", "")[:10]

    if not current_date and dates:
        current_date = dates[-1]

    group_count = len(cfg.get("groups", []))
    return {
        "status": "ok",
        "current_date": current_date,
        "latest_time": latest_time,
        "group_count": group_count,
        "task_running": False,
    }
```

- [ ] **Step 3: 重构 `/api/dates` 端点**

```python
@app.get("/api/dates")
def api_dates():
    return store.get_dates_info()
```

- [ ] **Step 4: 重构 `/api/latest` 端点**

```python
@app.get("/api/latest")
def api_latest():
    result = store.get_latest()
    if result is None:
        raise HTTPException(404, "暂无实时数据")
    return result
```

- [ ] **Step 5: 重构 `/api/day/{date}` 端点**

```python
@app.get("/api/day/{date_str}")
def api_day(date_str: str):
    result = store.get_day(date_str)
    if result is None:
        raise HTTPException(404, f"日期 {date_str} 数据不存在")
    return result
```

- [ ] **Step 6: 重构 `/api/day/{date}/meta` 端点**

```python
@app.get("/api/day/{date_str}/meta")
def api_day_meta(date_str: str):
    day = store.get_day(date_str)
    if day is None:
        raise HTTPException(404, f"日期 {date_str} 数据不存在")
    raw_snaps = store.get_raw_snapshots(date_str)
    return {
        "date": day["date"],
        "total": day["meta"]["message_count"],
        "count": day["meta"]["count"],
        "times": [s["time"] for s in raw_snaps],
    }
```

- [ ] **Step 7: 重构 `/api/day/{date}/snapshots` 端点**

```python
@app.get("/api/day/{date_str}/snapshots")
def api_day_snapshots(date_str: str, start: int = 0, count: int = 0):
    if store.get_day(date_str) is None:
        raise HTTPException(404, f"日期 {date_str} 数据不存在")
    return store.get_snapshots(date_str, start, count if count > 0 else None)
```

- [ ] **Step 8: 重构 `/api/stock-messages/{date}` 端点**

```python
@app.get("/api/stock-messages/{date_str}")
def api_stock_messages(date_str: str, code: str, time: str = ""):
    raw_snaps = store.get_raw_snapshots(date_str)
    if not raw_snaps:
        raise HTTPException(404, f"日期 {date_str} 数据不存在")

    target_time = time or ""
    snap = None
    for s in raw_snaps:
        if target_time and s["time"] == target_time:
            snap = s
            break
    if snap is None:
        snap = raw_snaps[-1]

    for t in snap.get("top10_stocks", []):
        if t["code"] == code:
            result = []
            for g in t.get("group_details", []):
                result.append({
                    "group": g["group"],
                    "messages": [{"time": m["time"].split(" ")[1], "text": m["text"]} for m in g["messages"]]
                })
            return result
    return []
```

- [ ] **Step 9: 重构 `/api/report/{date}` 端点**

```python
@app.get("/api/report/{date_str}")
def api_report(date_str: str):
    day_data = store.get_day(date_str)
    if day_data is None:
        raise HTTPException(404, f"日期 {date_str} 数据不存在")

    try:
        market_idx = fetch_indices()
    except Exception:
        market_idx = []
    try:
        adv_dec = fetch_advance_decline()
    except Exception:
        adv_dec = None

    result = generate_report(date_str, day_data, market_idx, adv_dec)

    # 合并日报数据（若存在）
    daily_report_file = data_dir / f"daily_report_{date_str}.json"
    if daily_report_file.exists():
        try:
            with open(daily_report_file, encoding="utf-8") as f:
                result["dailyReport"] = json.load(f)
        except Exception:
            pass

    return result
```

- [ ] **Step 10: 重构 `/api/day/{date}/sentiment-timeline` 端点**

```python
@app.get("/api/day/{date_str}/sentiment-timeline")
def api_sentiment_timeline(date_str: str):
    raw_snaps = store.get_raw_snapshots(date_str)
    if not raw_snaps:
        raise HTTPException(404, f"日期 {date_str} 数据不存在")

    key_times = ["09:30", "10:00", "10:30", "11:00", "11:30", "13:30", "14:00", "14:30", "15:00"]
    key_labels = ["开盘", "早盘升温", "盘中观察", "午前收盘", "午间收盘",
                  "午后开盘", "午后分化", "尾盘走势", "收盘"]
    result = []
    for i, kt in enumerate(key_times):
        best = None
        best_diff = float("inf")
        for snap in raw_snaps:
            t = snap.get("time", "")
            time_part = t.split(" ")[1] if " " in t else t
            try:
                snap_min = int(time_part.split(":")[0]) * 60 + int(time_part.split(":")[1])
                key_min = int(kt.split(":")[0]) * 60 + int(kt.split(":")[1])
                diff = abs(snap_min - key_min)
                if diff < best_diff:
                    best_diff = diff
                    best = snap
            except (ValueError, IndexError):
                continue
        if best:
            sd = best.get("sentiment_detail", {})
            bu = sd.get("bull", 0)
            be = sd.get("bear", 0)
            ne = sd.get("neutral", 0)
            total = bu + be + ne
            if total > 0:
                bull_bar = round(bu / total * 100)
                bear_bar = round(be / total * 100)
                neutral_bar = 100 - bull_bar - bear_bar
            else:
                bull_bar = bear_bar = neutral_bar = 33
            result.append({
                "time": kt, "label": key_labels[i],
                "bullBar": bull_bar, "bearBar": bear_bar, "neutralBar": neutral_bar,
                "overall": best.get("overall_sentiment", "观望为主"),
            })
    return result
```

- [ ] **Step 11: 重构 `/api/day/{date}/extreme-stats` 端点**

```python
@app.get("/api/day/{date_str}/extreme-stats")
def api_extreme_stats(date_str: str):
    raw_snaps = store.get_raw_snapshots(date_str)
    if not raw_snaps:
        raise HTTPException(404, f"日期 {date_str} 数据不存在")

    eh_count = 0
    el_count = 0
    for snap in raw_snaps:
        sd = snap.get("sentiment_detail", {})
        if sd.get("extreme_high", 0) > 3:
            eh_count += 1
        if sd.get("extreme_low", 0) > 3:
            el_count += 1
    return {"month_extreme_high": eh_count, "month_extreme_low": el_count}
```

- [ ] **Step 12: 重构 upload 端点，写入后更新 store**

```python
@app.post("/api/upload")
def api_upload(data: dict = Body(...)):
    filename = data.get("filename")
    if not filename or "/" in filename or "\\" in filename:
        raise HTTPException(400, "filename 必须为文件名（不含路径），如 day_2026-06-07.json 或 latest.json")
    if not filename.endswith(".json"):
        raise HTTPException(400, "filename 必须以 .json 结尾")

    content = data.get("data")
    if content is None:
        raise HTTPException(400, "缺少 data 字段")

    target = data_dir / filename
    with open(target, "w", encoding="utf-8") as f:
        json.dump(content, f, ensure_ascii=False)

    # 更新 store
    if filename == "latest.json":
        store.update_latest()
    elif filename.startswith("day_"):
        date_str = filename.replace("day_", "").replace(".json", "")
        store.update_day(date_str)

    return {"status": "ok", "filename": filename, "size_kb": round(target.stat().st_size / 1024, 1)}


@app.post("/api/upload/latest")
def api_upload_latest(data: dict = Body(...)):
    target = data_dir / "latest.json"
    with open(target, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    store.update_latest()
    return {"status": "ok", "filename": "latest.json", "size_kb": round(target.stat().st_size / 1024, 1)}


@app.post("/api/upload/day/{date_str}")
def api_upload_day(date_str: str, data: dict = Body(...)):
    if not __import__("re").match(r"^\d{4}-\d{2}-\d{2}$", date_str):
        raise HTTPException(400, "日期格式必须为 YYYY-MM-DD")
    target = data_dir / f"day_{date_str}.json"
    with open(target, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    store.update_day(date_str)
    return {"status": "ok", "filename": f"day_{date_str}.json", "size_kb": round(target.stat().st_size / 1024, 1)}
```

- [ ] **Step 13: 验证服务启动**

Run: `cd /Users/wansheng/git/hot-dashboard && python -m uvicorn backend.server:app --host 0.0.0.0 --port 8765 &`
然后: `curl http://localhost:8765/api/status`
Expected: 返回 JSON 包含 `"status": "ok"`，日志显示 "✅ 预加载完成: N 天数据"

- [ ] **Step 14: 验证所有端点**

```bash
curl http://localhost:8765/api/dates | python -m json.tool | head -20
curl http://localhost:8765/api/latest | python -m json.tool | head -10
curl http://localhost:8765/api/day/2026-07-09 | python -m json.tool | head -20
curl http://localhost:8765/api/day/2026-07-09/meta | python -m json.tool
curl "http://localhost:8765/api/day/2026-07-09/snapshots?start=0&count=2" | python -m json.tool | head -30
```

Expected: 所有端点返回数据格式与重构前一致，响应时间 < 50ms

- [ ] **Step 15: Commit**

```bash
git add backend/server.py
git commit -m "refactor: replace day_cache/raw_cache with DataStore, all endpoints use store methods"
```

---

### Task 3: 更新 collector.py 调用 store.update_day()

**Files:**
- Modify: `backend/collector.py`

**Interfaces:**
- Consumes: `DataStore` 实例（从 server.py 传入或全局导入）
- Produces: collector 写完 day 文件后自动更新内存缓存

- [ ] **Step 1: 在 collector.py 中导入 store**

在 `backend/collector.py` 顶部添加：

```python
# 在文件末尾或函数内部导入，避免循环依赖
# 方案：通过函数参数传入 store，或在函数内部延迟导入
```

由于 `collector.py` 被 `server.py` 导入，而 `store` 在 `server.py` 中创建，为避免循环依赖，采用延迟导入方案：

在 `collect_live()` 和 `collect_replay()` 函数内部：

```python
def collect_live(cfg=None, data_dir=None):
    # ... 原有逻辑 ...

    # 在写入 day_file 之后（原 line 512）:
    with open(day_file, "w", encoding="utf-8") as f:
        json.dump(day_data, f, ensure_ascii=False, indent=2, default=str)

    # 新增：更新 DataStore
    try:
        from backend.server import store
        store.update_day(date_str)
        store.update_latest()  # collect_live 也写了 latest.json
    except (ImportError, AttributeError):
        pass  # 独立运行 collector 时 store 不存在

    return output
```

```python
def collect_replay(date_str, cfg=None, data_dir=None):
    # ... 原有逻辑 ...

    # 在写入 out_path 之后（原 line 585）:
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(day_data, f, ensure_ascii=False, indent=2, default=str)
    print(f"\n💾 回放数据: {out_path}", flush=True)

    # 新增：更新 DataStore
    try:
        from backend.server import store
        store.update_day(date_str)
    except (ImportError, AttributeError):
        pass

    return day_data
```

- [ ] **Step 2: 验证 collector 写入后 store 自动更新**

```bash
# 触发一次实时采集
curl -X POST http://localhost:8765/api/collect
# 等待几秒后，检查最新数据是否包含新快照
curl http://localhost:8765/api/latest | python -m json.tool | head -5
```

Expected: latest 快照时间更新，无需重启服务

- [ ] **Step 3: Commit**

```bash
git add backend/collector.py
git commit -m "feat: collector calls store.update_day() after writing day files"
```

---

## 文件清单

| 操作 | 文件 | 说明 |
|------|------|------|
| 新建 | `backend/data_store.py` | DataStore 类 + `_compress_snapshot()` 函数 |
| 改造 | `backend/server.py` | 删除缓存 + `_compress_snapshot`，所有端点改用 store |
| 改造 | `backend/collector.py` | `collect_live` 和 `collect_replay` 写完后调用 store.update_day() |

## 验证

1. 启动服务，确认日志显示 `✅ 预加载完成: N 天数据, 耗时 X.Xs`
2. `curl /api/day/2026-06-15`（最大文件 57MB）— 响应时间 < 50ms
3. 切换多个日期 — 每次均 < 50ms
4. 重启服务后首次请求 — 同样 < 50ms（因为已预加载）
5. Collector 写入新数据后 — `store.update_day()` 自动刷新，下次请求返回新数据
6. Upload 端点写入后 — store 自动更新
7. 所有现有 API 端点返回数据格式不变
8. `npm run build` 无 TypeScript 错误（前端无需改动）
