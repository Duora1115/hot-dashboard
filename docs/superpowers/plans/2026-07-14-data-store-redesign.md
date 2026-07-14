# 数据层重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the backend data layer with smart caching, indexing, and HTTP caching to eliminate slow page loads, missing data, slow startup, and page switching lag.

**Architecture:** 4-layer architecture — storage (compressed snapshots in memory), index (stock/sector/time reverse lookups), raw data LRU cache (avoid repeated disk reads), derived data cache (precomputed results with version-based invalidation). HTTP ETag/Cache-Control headers on all API endpoints. Disk cleanup for old data files.

**Tech Stack:** Python 3.12, FastAPI, pytest, collections.OrderedDict

## Global Constraints

- Cloud deployment, memory 2-4GB
- Keep only 7-14 days of data
- Pure Python — no Redis, SQLite, or external dependencies
- Do not change data file formats (`day_*.json`, `latest.json`)
- All existing API endpoints must return the same data format

---

### Task 1: Create IndexRegistry with tests

**Files:**
- Create: `backend/index.py`
- Create: `tests/test_index.py`

**Interfaces:**
- Consumes: compressed snapshot data from DataStore (dict with `stk[].c`, `sec[].n`, `t` fields)
- Produces: `IndexRegistry` class used by DataStore and server endpoints

- [ ] **Step 1: Create tests for IndexRegistry**

Create `tests/test_index.py`:

```python
import pytest
from backend.index import IndexRegistry


def _make_compressed_day(date_str, snapshots):
    """Helper: build a compressed day dict for testing."""
    return {"date": date_str, "meta": {"count": len(snapshots)}, "snapshots": snapshots}


def _make_snapshot(time_str, stocks=None, sectors=None):
    """Helper: build a compressed snapshot for testing."""
    return {
        "t": time_str,
        "stk": stocks or [],
        "sec": sectors or [],
    }


class TestIndexRegistry:
    def test_build_stock_index(self):
        idx = IndexRegistry()
        day = _make_compressed_day("2026-07-07", [
            _make_snapshot("2026-07-07 09:30", stocks=[
                {"c": "002396", "n": "星网宇达"},
                {"c": "300750", "n": "宁德时代"},
            ]),
            _make_snapshot("2026-07-07 10:00", stocks=[
                {"c": "002396", "n": "星网宇达"},
            ]),
        ])
        idx.build_for_day("2026-07-07", day)

        assert ("2026-07-07", 0) in idx.stock_index["002396"]
        assert ("2026-07-07", 1) in idx.stock_index["002396"]
        assert ("2026-07-07", 0) in idx.stock_index["300750"]

    def test_build_sector_index(self):
        idx = IndexRegistry()
        day = _make_compressed_day("2026-07-07", [
            _make_snapshot("2026-07-07 09:30", sectors=[
                {"n": "半导体"}, {"n": "AI算力"},
            ]),
        ])
        idx.build_for_day("2026-07-07", day)

        assert ("2026-07-07", 0) in idx.sector_index["半导体"]
        assert ("2026-07-07", 0) in idx.sector_index["AI算力"]

    def test_build_time_index(self):
        idx = IndexRegistry()
        day = _make_compressed_day("2026-07-07", [
            _make_snapshot("2026-07-07 09:30"),
            _make_snapshot("2026-07-07 10:00"),
        ])
        idx.build_for_day("2026-07-07", day)

        assert idx.time_index["2026-07-07 09:30"] == ("2026-07-07", 0)
        assert idx.time_index["2026-07-07 10:00"] == ("2026-07-07", 1)

    def test_remove_date(self):
        idx = IndexRegistry()
        day = _make_compressed_day("2026-07-07", [
            _make_snapshot("2026-07-07 09:30", stocks=[{"c": "002396"}]),
        ])
        idx.build_for_day("2026-07-07", day)
        assert len(idx.stock_index["002396"]) == 1

        idx.remove_date("2026-07-07")
        assert "002396" not in idx.stock_index or len(idx.stock_index["002396"]) == 0

    def test_rebuild_date_replaces_old(self):
        idx = IndexRegistry()
        day_v1 = _make_compressed_day("2026-07-07", [
            _make_snapshot("2026-07-07 09:30", stocks=[{"c": "002396"}]),
        ])
        idx.build_for_day("2026-07-07", day_v1)

        day_v2 = _make_compressed_day("2026-07-07", [
            _make_snapshot("2026-07-07 09:30", stocks=[{"c": "002396"}]),
            _make_snapshot("2026-07-07 10:00", stocks=[{"c": "300750"}]),
        ])
        idx.build_for_day("2026-07-07", day_v2)

        assert len(idx.stock_index["002396"]) == 1
        assert len(idx.stock_index["300750"]) == 1

    def test_get_stock_locations(self):
        idx = IndexRegistry()
        day = _make_compressed_day("2026-07-07", [
            _make_snapshot("2026-07-07 09:30", stocks=[{"c": "002396"}]),
            _make_snapshot("2026-07-07 10:00", stocks=[{"c": "002396"}]),
        ])
        idx.build_for_day("2026-07-07", day)

        locs = idx.get_stock_locations("002396")
        assert len(locs) == 2
        assert ("2026-07-07", 0) in locs
        assert ("2026-07-07", 1) in locs

    def test_get_stock_locations_missing(self):
        idx = IndexRegistry()
        assert idx.get_stock_locations("999999") == []

    def test_build_from_multiple_days(self):
        idx = IndexRegistry()
        for date in ["2026-07-06", "2026-07-07"]:
            day = _make_compressed_day(date, [
                _make_snapshot(f"{date} 09:30", stocks=[{"c": "002396"}]),
            ])
            idx.build_for_day(date, day)

        locs = idx.get_stock_locations("002396")
        assert len(locs) == 2
        dates = {d for d, _ in locs}
        assert dates == {"2026-07-06", "2026-07-07"}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/wansheng/git/hot-dashboard && python -m pytest tests/test_index.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'backend.index'`

- [ ] **Step 3: Implement IndexRegistry**

Create `backend/index.py`:

```python
"""
IndexRegistry — 股票/板块/时间的反查索引。
从压缩快照构建，支持按日期增量更新和删除。
"""

import logging
from collections import defaultdict

logger = logging.getLogger(__name__)


class IndexRegistry:
    def __init__(self):
        self.stock_index: dict[str, list[tuple[str, int]]] = defaultdict(list)
        self.sector_index: dict[str, list[tuple[str, int]]] = defaultdict(list)
        self.time_index: dict[str, tuple[str, int]] = {}

    def build_for_day(self, date_str: str, day_data: dict):
        """构建某天的索引（先清除旧条目，再重新扫描）。"""
        self.remove_date(date_str)

        for snap_idx, snap in enumerate(day_data.get("snapshots", [])):
            # 股票索引
            for stock in snap.get("stk", []):
                code = stock.get("c", "")
                if code:
                    self.stock_index[code].append((date_str, snap_idx))

            # 板块索引
            for sector in snap.get("sec", []):
                name = sector.get("n", "")
                if name:
                    self.sector_index[name].append((date_str, snap_idx))

            # 时间索引
            time_str = snap.get("t", "")
            if time_str:
                self.time_index[time_str] = (date_str, snap_idx)

    def remove_date(self, date_str: str):
        """删除某天的所有索引条目。"""
        for code in list(self.stock_index.keys()):
            self.stock_index[code] = [
                (d, i) for d, i in self.stock_index[code] if d != date_str
            ]
            if not self.stock_index[code]:
                del self.stock_index[code]

        for name in list(self.sector_index.keys()):
            self.sector_index[name] = [
                (d, i) for d, i in self.sector_index[name] if d != date_str
            ]
            if not self.sector_index[name]:
                del self.sector_index[name]

        times_to_remove = [
            t for t, (d, _) in self.time_index.items() if d == date_str
        ]
        for t in times_to_remove:
            del self.time_index[t]

    def get_stock_locations(self, code: str) -> list[tuple[str, int]]:
        """获取某只股票出现的所有 (date, snap_idx)。"""
        return list(self.stock_index.get(code, []))

    def get_sector_locations(self, name: str) -> list[tuple[str, int]]:
        """获取某板块出现的所有 (date, snap_idx)。"""
        return list(self.sector_index.get(name, []))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/wansheng/git/hot-dashboard && python -m pytest tests/test_index.py -v`
Expected: All 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/index.py tests/test_index.py
git commit -m "feat: add IndexRegistry for stock/sector/time reverse lookups"
```

---

### Task 2: Create RawDataLRU with tests

**Files:**
- Create: `backend/cache.py`
- Create: `tests/test_cache.py`

**Interfaces:**
- Consumes: date strings, raw day data dicts from disk
- Produces: `RawDataLRU` and `DerivedCache` classes used by DataStore

- [ ] **Step 1: Create tests for RawDataLRU and DerivedCache**

Create `tests/test_cache.py`:

```python
import time
import pytest
from backend.cache import RawDataLRU, DerivedCache


class TestRawDataLRU:
    def test_get_returns_none_when_empty(self):
        lru = RawDataLRU(max_days=3)
        assert lru.get("2026-07-07") is None

    def test_put_and_get(self):
        lru = RawDataLRU(max_days=3)
        data = {"date": "2026-07-07", "snapshots": []}
        lru.put("2026-07-07", data)
        assert lru.get("2026-07-07") is data

    def test_evicts_oldest_when_over_capacity(self):
        lru = RawDataLRU(max_days=2)
        lru.put("2026-07-05", {"d": 5})
        lru.put("2026-07-06", {"d": 6})
        lru.put("2026-07-07", {"d": 7})

        assert lru.get("2026-07-05") is None  # evicted (oldest)
        assert lru.get("2026-07-06") is not None
        assert lru.get("2026-07-07") is not None

    def test_access_refreshes_order(self):
        lru = RawDataLRU(max_days=2)
        lru.put("2026-07-05", {"d": 5})
        lru.put("2026-07-06", {"d": 6})

        # Access 07-05 to make it recently used
        lru.get("2026-07-05")

        # Now add 07-07 — should evict 07-06 (now the oldest)
        lru.put("2026-07-07", {"d": 7})

        assert lru.get("2026-07-05") is not None  # kept (recently accessed)
        assert lru.get("2026-07-06") is None       # evicted
        assert lru.get("2026-07-07") is not None

    def test_evict_specific_date(self):
        lru = RawDataLRU(max_days=3)
        lru.put("2026-07-05", {"d": 5})
        lru.put("2026-07-06", {"d": 6})

        lru.evict("2026-07-05")
        assert lru.get("2026-07-05") is None
        assert lru.get("2026-07-06") is not None

    def test_size_tracking(self):
        lru = RawDataLRU(max_days=3)
        assert lru.current_size == 0
        lru.put("2026-07-07", {"snapshots": [1, 2, 3]})
        assert lru.current_size == 1


class TestDerivedCache:
    def test_get_returns_none_when_empty(self):
        cache = DerivedCache()
        assert cache.get("sentiment_tl", "2026-07-07") is None

    def test_set_and_get(self):
        cache = DerivedCache()
        data = {"result": [1, 2, 3]}
        cache.set("sentiment_tl", "2026-07-07", data)
        assert cache.get("sentiment_tl", "2026-07-07") == data

    def test_invalidate_by_date(self):
        cache = DerivedCache()
        cache.set("sentiment_tl", "2026-07-07", {"a": 1})
        cache.set("extreme", "2026-07-07", {"b": 2})
        cache.set("sentiment_tl", "2026-07-06", {"c": 3})

        cache.invalidate("2026-07-07")

        assert cache.get("sentiment_tl", "2026-07-07") is None
        assert cache.get("extreme", "2026-07-07") is None
        assert cache.get("sentiment_tl", "2026-07-06") == {"c": 3}

    def test_version_increments_on_invalidate(self):
        cache = DerivedCache()
        v1 = cache.get_version("2026-07-07")
        cache.set("sentiment_tl", "2026-07-07", {"a": 1})
        cache.invalidate("2026-07-07")
        v2 = cache.get_version("2026-07-07")
        assert v2 > v1

    def test_different_keys_independent(self):
        cache = DerivedCache()
        cache.set("key_a", "2026-07-07", {"a": 1})
        cache.set("key_b", "2026-07-07", {"b": 2})

        cache.invalidate("2026-07-07")

        assert cache.get("key_a", "2026-07-07") is None
        assert cache.get("key_b", "2026-07-07") is None

    def test_ttl_expiry(self):
        cache = DerivedCache()
        cache.set("report", "2026-07-07", {"data": 1}, ttl=0.1)
        assert cache.get("report", "2026-07-07") is not None
        time.sleep(0.15)
        assert cache.get("report", "2026-07-07") is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/wansheng/git/hot-dashboard && python -m pytest tests/test_cache.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'backend.cache'`

- [ ] **Step 3: Implement RawDataLRU and DerivedCache**

Create `backend/cache.py`:

```python
"""
缓存层 — 原始数据 LRU 缓存 + 派生数据缓存。
"""

import time
import logging
from collections import OrderedDict
from typing import Any

logger = logging.getLogger(__name__)


class RawDataLRU:
    """LRU 缓存，保留最近访问的 N 天原始数据。"""

    def __init__(self, max_days: int = 3):
        self.max_days = max_days
        self._cache: OrderedDict[str, dict] = OrderedDict()

    @property
    def current_size(self) -> int:
        return len(self._cache)

    def get(self, date_str: str) -> dict | None:
        if date_str in self._cache:
            self._cache.move_to_end(date_str)
            return self._cache[date_str]
        return None

    def put(self, date_str: str, data: dict):
        if date_str in self._cache:
            self._cache.move_to_end(date_str)
        self._cache[date_str] = data
        while len(self._cache) > self.max_days:
            oldest_key, _ = self._cache.popitem(last=False)
            logger.debug(f"RawDataLRU 淘汰: {oldest_key}")

    def evict(self, date_str: str):
        self._cache.pop(date_str, None)


class DerivedCache:
    """派生数据缓存，数据更新时按日期失效。支持可选 TTL。"""

    def __init__(self):
        self._cache: dict[str, tuple[Any, float, float | None]] = {}
        self._versions: dict[str, int] = {}

    def _make_key(self, cache_key: str, date_str: str) -> str:
        return f"{cache_key}:{date_str}"

    def get(self, cache_key: str, date_str: str) -> Any | None:
        key = self._make_key(cache_key, date_str)
        entry = self._cache.get(key)
        if entry is None:
            return None
        result, set_time, ttl = entry
        if ttl is not None and (time.time() - set_time) > ttl:
            del self._cache[key]
            return None
        return result

    def set(self, cache_key: str, date_str: str, result: Any, ttl: float | None = None):
        key = self._make_key(cache_key, date_str)
        self._cache[key] = (result, time.time(), ttl)

    def invalidate(self, date_str: str):
        keys_to_remove = [
            k for k in self._cache if k.endswith(f":{date_str}")
        ]
        for k in keys_to_remove:
            del self._cache[k]
        self._versions[date_str] = self._versions.get(date_str, 0) + 1

    def get_version(self, date_str: str) -> int:
        return self._versions.get(date_str, 0)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/wansheng/git/hot-dashboard && python -m pytest tests/test_cache.py -v`
Expected: All 11 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/cache.py tests/test_cache.py
git commit -m "feat: add RawDataLRU and DerivedCache for data layer caching"
```

---

### Task 3: Refactor DataStore to compose all layers

**Files:**
- Modify: `backend/data_store.py` (full rewrite)
- Create: `tests/test_data_store.py`

**Interfaces:**
- Consumes: `IndexRegistry` from `backend/index.py`, `RawDataLRU` + `DerivedCache` from `backend/cache.py`
- Produces: Refactored `DataStore` class used by `server.py` and `collector.py` — same external API plus new methods (`get_version`, `get_raw_snapshots` via LRU, `get_snapshot`)

- [ ] **Step 1: Create tests for refactored DataStore**

Create `tests/test_data_store.py`:

```python
import json
import pytest
from pathlib import Path
from backend.data_store import DataStore, _compress_snapshot


@pytest.fixture
def data_dir(tmp_path):
    """Create a temp data directory with test data."""
    # Create two day files
    day1 = {
        "date": "2026-07-06",
        "total_msgs": 100,
        "snapshots": [
            {
                "time": "2026-07-06 09:30",
                "total_messages": 50,
                "active_groups": 5,
                "overall_sentiment": "偏多",
                "sentiment_detail": {"bull": 10, "bear": 3, "neutral": 5, "extreme_high": 2, "extreme_low": 1},
                "action_summary": {"买入信号": 3},
                "top10_stocks": [
                    {"code": "002396", "name": "星网宇达", "score": 50, "mention_count": 10,
                     "group_count": 3, "action_count": 2, "bull": 5, "bear": 1,
                     "first_time": "2026-07-06 09:00", "last_time": "2026-07-06 09:30",
                     "sectors": ["军工"], "group_details": [
                         {"group": "群A", "count": 5, "messages": [
                             {"time": "2026-07-06 09:15", "text": "002396 看多"}
                         ]}
                     ]}
                ],
                "top8_sectors": [
                    {"name": "军工", "score": 30, "mention_count": 8, "group_count": 3,
                     "group_details": [], "sample_text": "军工板块活跃"}
                ],
            }
        ],
    }
    day2 = {
        "date": "2026-07-07",
        "total_msgs": 200,
        "snapshots": [
            {
                "time": "2026-07-07 09:30",
                "total_messages": 100,
                "active_groups": 8,
                "overall_sentiment": "偏多",
                "sentiment_detail": {"bull": 20, "bear": 5, "neutral": 10, "extreme_high": 5, "extreme_low": 2},
                "action_summary": {"买入信号": 5},
                "top10_stocks": [
                    {"code": "002396", "name": "星网宇达", "score": 60, "mention_count": 15,
                     "group_count": 5, "action_count": 3, "bull": 8, "bear": 2,
                     "first_time": "2026-07-07 09:00", "last_time": "2026-07-07 09:30",
                     "sectors": ["军工"], "group_details": []}
                ],
                "top8_sectors": [],
            },
            {
                "time": "2026-07-07 10:00",
                "total_messages": 150,
                "active_groups": 10,
                "overall_sentiment": "分歧",
                "sentiment_detail": {"bull": 15, "bear": 15, "neutral": 20, "extreme_high": 1, "extreme_low": 4},
                "action_summary": {"卖出信号": 3},
                "top10_stocks": [
                    {"code": "300750", "name": "宁德时代", "score": 80, "mention_count": 20,
                     "group_count": 8, "action_count": 5, "bull": 10, "bear": 5,
                     "first_time": "2026-07-07 09:30", "last_time": "2026-07-07 10:00",
                     "sectors": ["新能源"], "group_details": []}
                ],
                "top8_sectors": [
                    {"name": "新能源", "score": 50, "mention_count": 15, "group_count": 6,
                     "group_details": [], "sample_text": "新能源持续活跃"}
                ],
            },
        ],
    }

    with open(tmp_path / "day_2026-07-06.json", "w", encoding="utf-8") as f:
        json.dump(day1, f, ensure_ascii=False)
    with open(tmp_path / "day_2026-07-07.json", "w", encoding="utf-8") as f:
        json.dump(day2, f, ensure_ascii=False)

    # Create latest.json
    latest = day2["snapshots"][0]
    latest["date"] = "2026-07-07"
    with open(tmp_path / "latest.json", "w", encoding="utf-8") as f:
        json.dump(latest, f, ensure_ascii=False)

    return tmp_path


class TestDataStore:
    def test_startup_loads_recent_days(self, data_dir):
        store = DataStore(data_dir, max_hot_days=14)
        store.startup()

        assert "2026-07-06" in store.get_dates()
        assert "2026-07-07" in store.get_dates()
        assert store.get_day("2026-07-07") is not None

    def test_startup_only_loads_recent_n_days(self, data_dir):
        store = DataStore(data_dir, max_hot_days=1)
        store.startup()

        # Only 1 day loaded — the most recent
        assert store.get_day("2026-07-07") is not None
        # 07-06 not loaded yet (lazy)
        assert "2026-07-06" not in store._days

    def test_lazy_load_on_access(self, data_dir):
        store = DataStore(data_dir, max_hot_days=1)
        store.startup()

        # Access 07-06 — triggers lazy load
        day = store.get_day("2026-07-06")
        assert day is not None
        assert "2026-07-06" in store._days

    def test_get_latest(self, data_dir):
        store = DataStore(data_dir)
        store.startup()

        latest = store.get_latest()
        assert latest is not None
        assert latest["t"] == "2026-07-07 09:30"

    def test_index_built_on_startup(self, data_dir):
        store = DataStore(data_dir)
        store.startup()

        locs = store.index.get_stock_locations("002396")
        assert len(locs) >= 1

    def test_get_raw_snapshots_via_lru(self, data_dir):
        store = DataStore(data_dir, raw_lru_days=2)
        store.startup()

        raw = store.get_raw_snapshots("2026-07-07")
        assert len(raw) == 2
        assert raw[0]["time"] == "2026-07-07 09:30"

        # Second call should hit LRU
        raw2 = store.get_raw_snapshots("2026-07-07")
        assert raw2 == raw

    def test_update_day_refreshes_data_and_index(self, data_dir):
        store = DataStore(data_dir)
        store.startup()

        # Modify the day file
        day2 = json.loads((data_dir / "day_2026-07-07.json").read_text(encoding="utf-8"))
        day2["snapshots"].append({
            "time": "2026-07-07 10:30",
            "total_messages": 200,
            "active_groups": 12,
            "overall_sentiment": "偏空",
            "sentiment_detail": {"bull": 5, "bear": 20, "neutral": 10, "extreme_high": 0, "extreme_low": 6},
            "action_summary": {"卖出信号": 8},
            "top10_stocks": [
                {"code": "600519", "name": "贵州茅台", "score": 90, "mention_count": 25,
                 "group_count": 10, "action_count": 1, "bull": 2, "bear": 15,
                 "first_time": "2026-07-07 10:00", "last_time": "2026-07-07 10:30",
                 "sectors": ["消费"], "group_details": []}
            ],
            "top8_sectors": [],
        })
        with open(data_dir / "day_2026-07-07.json", "w", encoding="utf-8") as f:
            json.dump(day2, f, ensure_ascii=False)

        store.update_day("2026-07-07")

        day = store.get_day("2026-07-07")
        assert len(day["snapshots"]) == 3

        # Index should include new stock
        locs = store.index.get_stock_locations("600519")
        assert ("2026-07-07", 2) in locs

    def test_version_increments_on_update(self, data_dir):
        store = DataStore(data_dir)
        store.startup()

        v1 = store.get_version("2026-07-07")
        store.update_day("2026-07-07")
        v2 = store.get_version("2026-07-07")
        assert v2 > v1

    def test_derived_cache_invalidate_on_update(self, data_dir):
        store = DataStore(data_dir)
        store.startup()

        store.derived_cache.set("sentiment_tl", "2026-07-07", {"cached": True})
        assert store.derived_cache.get("sentiment_tl", "2026-07-07") is not None

        store.update_day("2026-07-07")
        assert store.derived_cache.get("sentiment_tl", "2026-07-07") is None

    def test_eviction_when_over_max_hot_days(self, data_dir):
        store = DataStore(data_dir, max_hot_days=1)
        store.startup()

        # Force load both days
        store.get_day("2026-07-06")
        store.get_day("2026-07-07")

        # Only 1 should remain in memory (the most recently accessed)
        assert len(store._days) == 1

    def test_get_dates_info(self, data_dir):
        store = DataStore(data_dir)
        store.startup()

        info = store.get_dates_info()
        assert len(info) == 2
        assert info[0]["date"] == "2026-07-07"  # reversed order
        assert "size_kb" in info[0]

    def test_get_snapshot_single(self, data_dir):
        store = DataStore(data_dir)
        store.startup()

        snap = store.get_snapshot("2026-07-07", 0)
        assert snap is not None
        assert snap["t"] == "2026-07-07 09:30"

    def test_get_snapshot_out_of_range(self, data_dir):
        store = DataStore(data_dir)
        store.startup()

        snap = store.get_snapshot("2026-07-07", 999)
        assert snap is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/wansheng/git/hot-dashboard && python -m pytest tests/test_data_store.py -v`
Expected: FAIL — `DataStore` doesn't accept `max_hot_days` or `raw_lru_days` params yet

- [ ] **Step 3: Rewrite DataStore**

Rewrite `backend/data_store.py` to compose the three new layers:

```python
#!/usr/bin/env python3
"""
DataStore — 4 层数据架构：
  存储层（压缩快照内存）+ 索引层 + 原始数据 LRU + 派生数据缓存
启动时只加载最近 N 天，其余懒加载。
"""

import json
import logging
import time
from pathlib import Path
from datetime import datetime, timezone, timedelta
from concurrent.futures import ThreadPoolExecutor

from backend.index import IndexRegistry
from backend.cache import RawDataLRU, DerivedCache

logger = logging.getLogger(__name__)

CST = timezone(timedelta(hours=8))


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
    def __init__(self, data_dir: Path, max_hot_days: int = 14, raw_lru_days: int = 3):
        self.data_dir = data_dir
        self.max_hot_days = max_hot_days
        self._days: dict[str, dict] = {}
        self._latest: dict | None = None
        self._dates: list[str] = []
        self._dates_info: dict[str, int] = {}

        # 4-layer components
        self.index = IndexRegistry()
        self.raw_cache = RawDataLRU(max_days=raw_lru_days)
        self.derived_cache = DerivedCache()

    def startup(self):
        """启动：只加载最近 max_hot_days 天，构建索引。"""
        t0 = time.time()
        day_files = sorted(self.data_dir.glob("day_*.json")) if self.data_dir.exists() else []

        # 计算 size_info 和日期列表（仅扫描文件，不加载）
        for path in day_files:
            date_str = path.stem.replace("day_", "")
            self._dates_info[date_str] = round(path.stat().st_size / 1024, 1)

        all_dates = sorted(self._dates_info.keys())
        recent_dates = all_dates[-self.max_hot_days:] if len(all_dates) > self.max_hot_days else all_dates

        # 并行加载最近 N 天
        def _load_one(path: Path):
            date_str = path.stem.replace("day_", "")
            if date_str not in recent_dates:
                return
            try:
                self._load_day(date_str, path)
            except Exception as e:
                logger.warning(f"预加载 {date_str} 失败: {e}")

        with ThreadPoolExecutor(max_workers=min(8, len(recent_dates) or 1)) as pool:
            pool.map(_load_one, day_files)

        # 构建索引
        for date_str in list(self._days.keys()):
            try:
                self.index.build_for_day(date_str, self._days[date_str])
            except Exception as e:
                logger.warning(f"索引构建 {date_str} 失败: {e}")

        self._dates = sorted(self._days.keys())

        # 加载 latest
        try:
            self.update_latest()
        except Exception as e:
            logger.warning(f"预加载 latest.json 失败: {e}")

        elapsed = time.time() - t0
        logger.info(
            f"✅ 预加载完成: {len(self._days)} 天数据 (共 {len(all_dates)} 天), "
            f"耗时 {elapsed:.1f}s"
        )

    def _load_day(self, date_str: str, path: Path):
        """加载并压缩一天的数据到内存。"""
        with open(path, encoding="utf-8") as f:
            raw = json.load(f)

        total = raw.get("total_msgs", 0)
        snapshots = raw.get("snapshots", [])
        if not total and snapshots:
            total = snapshots[-1].get("total_messages", 0)

        compressed_snaps = [_compress_snapshot(s) for s in snapshots]
        meta = {
            "start": snapshots[0]["time"] if snapshots else "",
            "end": snapshots[-1]["time"] if snapshots else "",
            "count": len(snapshots),
            "message_count": total,
        }
        day_data = {"date": raw.get("date", date_str), "meta": meta, "snapshots": compressed_snaps}
        self._days[date_str] = day_data

    def _evict_if_needed(self):
        """当内存天数超过 max_hot_days 时，淘汰最老的。"""
        while len(self._days) > self.max_hot_days:
            oldest = min(self._days.keys())
            del self._days[oldest]
            self.index.remove_date(oldest)
            self.derived_cache.invalidate(oldest)
            self.raw_cache.evict(oldest)
            if oldest in self._dates:
                self._dates.remove(oldest)
            logger.debug(f"内存淘汰: {oldest}")

    def update_day(self, date_str: str):
        """增量更新某天（collector/upload 写完后调用）。"""
        path = self.data_dir / f"day_{date_str}.json"
        if not path.exists():
            return
        try:
            self._load_day(date_str, path)
            self.index.build_for_day(date_str, self._days[date_str])
            self.derived_cache.invalidate(date_str)
            self.raw_cache.evict(date_str)  # raw 缓存也失效，下次从磁盘重读
            if date_str not in self._dates:
                self._dates = sorted(self._days.keys())
            self._dates_info[date_str] = round(path.stat().st_size / 1024, 1)
            self._evict_if_needed()
        except Exception as e:
            logger.warning(f"更新 {date_str} 失败: {e}")

    def update_latest(self):
        """重新加载 latest.json。"""
        latest_path = self.data_dir / "latest.json"
        if not latest_path.exists():
            self._latest = None
            return
        with open(latest_path, encoding="utf-8") as f:
            raw = json.load(f)
        self._latest = _compress_snapshot(raw)
        today = datetime.now(CST).strftime("%Y-%m-%d")
        self.derived_cache.invalidate(today)

    def get_latest_raw(self) -> dict | None:
        """按需从磁盘读取 latest.json 原始数据。"""
        latest_path = self.data_dir / "latest.json"
        if not latest_path.exists():
            return None
        try:
            with open(latest_path, encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.warning(f"读取 latest.json 失败: {e}")
            return None

    def get_dates(self) -> list[str]:
        """返回所有可用日期（包括未加载到内存的）。"""
        all_dates = sorted(self._dates_info.keys())
        return all_dates

    def get_dates_info(self) -> list[dict]:
        result = []
        for date_str in reversed(sorted(self._dates_info.keys())):
            result.append({"date": date_str, "size_kb": self._dates_info.get(date_str, 0)})
        return result

    def get_latest(self) -> dict | None:
        return self._latest

    def get_day(self, date_str: str) -> dict | None:
        """获取压缩日数据，不在内存时懒加载。"""
        if date_str in self._days:
            return self._days[date_str]
        # 懒加载
        path = self.data_dir / f"day_{date_str}.json"
        if not path.exists():
            return None
        try:
            self._load_day(date_str, path)
            self.index.build_for_day(date_str, self._days[date_str])
            self._evict_if_needed()
            return self._days[date_str]
        except Exception as e:
            logger.warning(f"懒加载 {date_str} 失败: {e}")
            return None

    def get_snapshot(self, date_str: str, snap_idx: int) -> dict | None:
        """获取单个压缩快照。"""
        day = self.get_day(date_str)
        if not day:
            return None
        snaps = day.get("snapshots", [])
        if 0 <= snap_idx < len(snaps):
            return snaps[snap_idx]
        return None

    def get_snapshots(self, date_str: str, start: int = 0, count: int | None = None) -> list[dict]:
        day = self.get_day(date_str)
        if not day:
            return []
        snaps = day["snapshots"]
        if count is None or count <= 0:
            return snaps[start:]
        count = min(count, 100)
        return snaps[start:start + count]

    def get_raw_snapshots(self, date_str: str) -> list[dict]:
        """获取原始快照（通过 LRU 缓存，避免每次读磁盘）。"""
        cached = self.raw_cache.get(date_str)
        if cached is not None:
            return cached.get("snapshots", [])
        # 从磁盘读取
        path = self.data_dir / f"day_{date_str}.json"
        if not path.exists():
            return []
        try:
            with open(path, encoding="utf-8") as f:
                raw = json.load(f)
            self.raw_cache.put(date_str, raw)
            return raw.get("snapshots", [])
        except Exception as e:
            logger.warning(f"读取原始数据 {date_str} 失败: {e}")
            return []

    def get_version(self, date_str: str) -> int:
        """获取某天的数据版本号（用于 ETag）。"""
        return self.derived_cache.get_version(date_str)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/wansheng/git/hot-dashboard && python -m pytest tests/test_data_store.py -v`
Expected: All 12 tests PASS

- [ ] **Step 5: Run all tests together**

Run: `cd /Users/wansheng/git/hot-dashboard && python -m pytest tests/ -v`
Expected: All tests PASS (index + cache + data_store)

- [ ] **Step 6: Commit**

```bash
git add backend/data_store.py tests/test_data_store.py
git commit -m "refactor: DataStore 4-layer architecture with index, LRU, derived cache"
```

---

### Task 4: Update server.py for new DataStore API

**Files:**
- Modify: `backend/server.py:45-47` (startup), `backend/server.py:103-156` (meta + stock-messages), `backend/server.py:240-301` (sentiment-timeline + extreme-stats)

**Interfaces:**
- Consumes: `DataStore` from `backend/data_store.py` with new `.index`, `.derived_cache`, `.raw_cache` attributes
- Produces: Same API response formats, but faster

- [ ] **Step 1: Update startup call**

The `startup_event()` already calls `store.startup()` — no changes needed since the new `startup()` signature is the same.

- [ ] **Step 2: Optimize `/api/day/{date_str}/meta` endpoint**

Replace `backend/server.py` lines 103-115:

```python
@app.get("/api/day/{date_str}/meta")
def api_day_meta(date_str: str):
    """获取日期的元信息，不加载完整数据。"""
    # 先检查文件是否存在（不触发完整加载）
    path = data_dir / f"day_{date_str}.json"
    if not path.exists():
        raise HTTPException(404, f"日期 {date_str} 数据不存在")

    # 如果已加载，直接用内存数据
    day = store.get_day(date_str)
    if day is None:
        raise HTTPException(404, f"日期 {date_str} 数据不存在")

    # 时间列表从索引获取（不读原始数据）
    times = []
    for time_key, (d, idx) in sorted(store.index.time_index.items()):
        if d == date_str:
            times.append(time_key.split(" ")[1] if " " in time_key else time_key)

    return {
        "date": day["date"],
        "total": day["meta"]["message_count"],
        "count": day["meta"]["count"],
        "times": times,
    }
```

- [ ] **Step 3: Optimize `/api/stock-messages/{date_str}` endpoint**

Replace `backend/server.py` lines 131-156:

```python
@app.get("/api/stock-messages/{date_str}")
def api_stock_messages(date_str: str, code: str, time: str = ""):
    """按需获取指定股票的消息原文（用索引定位，不扫描全部快照）。"""
    # 用索引定位包含该股票的快照
    locations = store.index.get_stock_locations(code)
    date_locs = [(d, i) for d, i in locations if d == date_str]

    if not date_locs:
        # 索引未命中，回退到原始数据扫描
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

    # 索引命中 — 从 raw cache 获取需要的快照
    raw_snaps = store.get_raw_snapshots(date_str)
    if not raw_snaps:
        raise HTTPException(404, f"日期 {date_str} 数据不存在")

    target_time = time or ""
    result = []
    for _, snap_idx in date_locs:
        if snap_idx >= len(raw_snaps):
            continue
        snap = raw_snaps[snap_idx]
        if target_time and snap.get("time", "") != target_time:
            continue
        for t in snap.get("top10_stocks", []):
            if t["code"] == code:
                for g in t.get("group_details", []):
                    result.append({
                        "group": g["group"],
                        "messages": [{"time": m["time"].split(" ")[1], "text": m["text"]} for m in g["messages"]]
                    })
                return result

    # 如果指定时间没匹配到，返回最后一个命中的
    if target_time and not result:
        last_idx = date_locs[-1][1]
        if last_idx < len(raw_snaps):
            snap = raw_snaps[last_idx]
            for t in snap.get("top10_stocks", []):
                if t["code"] == code:
                    for g in t.get("group_details", []):
                        result.append({
                            "group": g["group"],
                            "messages": [{"time": m["time"].split(" ")[1], "text": m["text"]} for m in g["messages"]]
                        })
                    return result
    return []
```

- [ ] **Step 4: Optimize `/api/day/{date_str}/sentiment-timeline` with derived cache**

Replace `backend/server.py` lines 240-283:

```python
@app.get("/api/day/{date_str}/sentiment-timeline")
def api_sentiment_timeline(date_str: str):
    """获取情绪时间序列（带派生缓存）。"""
    # 检查缓存
    cached = store.derived_cache.get("sentiment_tl", date_str)
    if cached is not None:
        return cached

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

    store.derived_cache.set("sentiment_tl", date_str, result)
    return result
```

- [ ] **Step 5: Optimize `/api/day/{date_str}/extreme-stats` with derived cache**

Replace `backend/server.py` lines 286-301:

```python
@app.get("/api/day/{date_str}/extreme-stats")
def api_extreme_stats(date_str: str):
    """统计极值情绪次数（带派生缓存）。"""
    cached = store.derived_cache.get("extreme", date_str)
    if cached is not None:
        return cached

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

    result = {"month_extreme_high": eh_count, "month_extreme_low": el_count}
    store.derived_cache.set("extreme", date_str, result)
    return result
```

- [ ] **Step 6: Optimize `/api/report/{date_str}` with derived cache**

Replace `backend/server.py` lines 178-217:

```python
@app.get("/api/report/{date_str}")
def api_report(date_str: str):
    """生成晨报数据（带派生缓存，TTL 30s 因为包含行情数据）。"""
    cached = store.derived_cache.get("report", date_str)
    if cached is not None:
        return cached

    day_data = store.get_day(date_str)
    if day_data is None:
        raise HTTPException(404, f"日期 {date_str} 数据不存在")

    from concurrent.futures import ThreadPoolExecutor, as_completed

    market_idx = []
    adv_dec = None

    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = {
            executor.submit(fetch_indices): "indices",
            executor.submit(fetch_advance_decline): "advance_decline",
        }
        for future in as_completed(futures):
            try:
                result = future.result(timeout=3)
                if futures[future] == "indices":
                    market_idx = result
                else:
                    adv_dec = result
            except Exception:
                pass

    result = generate_report(date_str, day_data, market_idx, adv_dec)

    daily_report_file = data_dir / f"daily_report_{date_str}.json"
    if daily_report_file.exists():
        try:
            with open(daily_report_file, encoding="utf-8") as f:
                result["dailyReport"] = json.load(f)
        except Exception:
            pass

    # 缓存 30 秒（因为行情数据 30 秒刷新）
    store.derived_cache.set("report", date_str, result, ttl=30)
    return result
```

- [ ] **Step 7: Verify server starts without errors**

Run: `cd /Users/wansheng/git/hot-dashboard && python -c "from backend.server import app; print('OK')"`
Expected: `OK` (no import errors)

- [ ] **Step 8: Commit**

```bash
git add backend/server.py
git commit -m "perf: optimize API endpoints with index lookups and derived cache"
```

---

### Task 5: Add HTTP caching headers (ETag + Cache-Control)

**Files:**
- Modify: `backend/server.py` (all GET endpoints)

**Interfaces:**
- Consumes: `store.get_version(date_str)` from DataStore
- Produces: HTTP 304 responses, Cache-Control headers

- [ ] **Step 1: Add ETag helper and cache decorator**

Add to the top of `backend/server.py`, after imports:

```python
from fastapi import Request
from fastapi.responses import Response
```

Add helper function after `store = DataStore(data_dir)`:

```python
def _etag_for(date_str: str) -> str:
    version = store.get_version(date_str)
    return f'"{date_str}-v{version}"'


def _check_etag(request: Request, date_str: str) -> Response | None:
    """If client's If-None-Match matches, return 304. Otherwise None."""
    etag = _etag_for(date_str)
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers={"ETag": etag})
    return None


# Cache-Control policies per endpoint type
_CACHE_POLICIES = {
    "status": "no-cache",
    "dates": "max-age=60",
    "latest": "no-cache",
    "day": "max-age=300",
    "meta": "max-age=300",
    "snapshots": "max-age=300",
    "sentiment_tl": "max-age=60",
    "extreme": "max-age=60",
    "report": "max-age=30",
    "market": "max-age=30",
    "stock_messages": "max-age=300",
}
```

- [ ] **Step 2: Add ETag + Cache-Control to all GET endpoints**

Update each endpoint to include ETag checking and Cache-Control headers. Here are the changes:

**`/api/status`** — line 52:
```python
@app.get("/api/status")
def api_status(request: Request):
    """服务状态"""
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
    etag = f'"status-v{store.get_version("latest")}"'
    headers = {"ETag": etag, "Cache-Control": _CACHE_POLICIES["status"]}
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers=headers)
    return JSONResponse({
        "status": "ok",
        "current_date": current_date,
        "latest_time": latest_time,
        "group_count": group_count,
        "task_running": False,
    }, headers=headers)
```

**`/api/dates`** — line 79:
```python
@app.get("/api/dates")
def api_dates(request: Request):
    """列出所有可用日期"""
    result = store.get_dates_info()
    etag = f'"dates-{len(result)}"'
    headers = {"ETag": etag, "Cache-Control": _CACHE_POLICIES["dates"]}
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers=headers)
    return JSONResponse(result, headers=headers)
```

**`/api/latest`** — line 85:
```python
@app.get("/api/latest")
def api_latest(request: Request):
    """获取最新实时快照"""
    result = store.get_latest()
    if result is None:
        raise HTTPException(404, "暂无实时数据")
    etag = f'"latest-v{store.get_version("latest")}"'
    headers = {"ETag": etag, "Cache-Control": _CACHE_POLICIES["latest"]}
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers=headers)
    return JSONResponse(result, headers=headers)
```

**`/api/day/{date_str}`** — line 94:
```python
@app.get("/api/day/{date_str}")
def api_day(date_str: str, request: Request):
    """获取指定日期的完整回放数据"""
    not_modified = _check_etag(request, date_str)
    if not_modified:
        return not_modified
    result = store.get_day(date_str)
    if result is None:
        raise HTTPException(404, f"日期 {date_str} 数据不存在")
    return JSONResponse(result, headers={
        "ETag": _etag_for(date_str),
        "Cache-Control": _CACHE_POLICIES["day"],
    })
```

**`/api/day/{date_str}/meta`** — add `request: Request`:
```python
@app.get("/api/day/{date_str}/meta")
def api_day_meta(date_str: str, request: Request):
    # ... existing body ...
    # At the end, wrap return:
    return JSONResponse({...}, headers={
        "ETag": _etag_for(date_str),
        "Cache-Control": _CACHE_POLICIES["meta"],
    })
```

**`/api/day/{date_str}/snapshots`** — add `request: Request`:
```python
@app.get("/api/day/{date_str}/snapshots")
def api_day_snapshots(date_str: str, request: Request, start: int = 0, count: int = 0):
    not_modified = _check_etag(request, date_str)
    if not_modified:
        return not_modified
    if store.get_day(date_str) is None:
        raise HTTPException(404, f"日期 {date_str} 数据不存在")
    result = store.get_snapshots(date_str, start, count if count > 0 else None)
    return JSONResponse(result, headers={
        "ETag": _etag_for(date_str),
        "Cache-Control": _CACHE_POLICIES["snapshots"],
    })
```

**`/api/stock-messages/{date_str}`** — add `request: Request`:
```python
@app.get("/api/stock-messages/{date_str}")
def api_stock_messages(date_str: str, request: Request, code: str, time: str = ""):
    not_modified = _check_etag(request, date_str)
    if not_modified:
        return not_modified
    # ... existing body ...
    # At end, wrap final return:
    return JSONResponse(result, headers={
        "ETag": _etag_for(date_str),
        "Cache-Control": _CACHE_POLICIES["stock_messages"],
    })
```

**`/api/market/indices`**:
```python
@app.get("/api/market/indices")
def api_market_indices(request: Request):
    try:
        result = fetch_indices()
    except Exception:
        result = []
    return JSONResponse(result, headers={"Cache-Control": _CACHE_POLICIES["market"]})
```

**`/api/market/advance-decline`**:
```python
@app.get("/api/market/advance-decline")
def api_market_advance_decline(request: Request):
    try:
        result = fetch_advance_decline()
    except Exception:
        result = None
    return JSONResponse(result, headers={"Cache-Control": _CACHE_POLICIES["market"]})
```

**`/api/day/{date_str}/sentiment-timeline`** — add `request: Request`:
```python
    # At end:
    return JSONResponse(result, headers={
        "ETag": _etag_for(date_str),
        "Cache-Control": _CACHE_POLICIES["sentiment_tl"],
    })
```

**`/api/day/{date_str}/extreme-stats`** — add `request: Request`:
```python
    # At end:
    return JSONResponse(result, headers={
        "ETag": _etag_for(date_str),
        "Cache-Control": _CACHE_POLICIES["extreme"],
    })
```

**`/api/report/{date_str}`** — add `request: Request`:
```python
    # At end:
    return JSONResponse(result, headers={
        "ETag": _etag_for(date_str),
        "Cache-Control": _CACHE_POLICIES["report"],
    })
```

- [ ] **Step 3: Verify server starts**

Run: `cd /Users/wansheng/git/hot-dashboard && python -c "from backend.server import app; print('OK')"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add backend/server.py
git commit -m "feat: add ETag + Cache-Control HTTP caching to all API endpoints"
```

---

### Task 6: Add disk cleanup to collector + config

**Files:**
- Modify: `backend/collector.py` (add `cleanup_old_files` function, call it after writes)
- Modify: `config/settings.yaml` (add cache config section)

**Interfaces:**
- Consumes: `data_dir` path, `retention_days` from config
- Produces: Old day files deleted from disk

- [ ] **Step 1: Add cache config to settings.yaml**

Add to `config/settings.yaml` after the `server:` section:

```yaml
# 缓存和数据保留策略
cache:
  max_hot_days: 14        # 内存中最多保留的天数
  raw_lru_days: 3         # 原始数据 LRU 缓存天数
  retention_days: 14      # 磁盘文件保留天数（超过则删除）
```

- [ ] **Step 2: Add cleanup function to collector.py**

Add at the end of `backend/collector.py` (before `if __name__ == "__main__":`):

```python
def cleanup_old_files(data_dir, retention_days=14):
    """删除超过保留期的旧 day 文件。"""
    from datetime import datetime, timedelta
    cutoff = (datetime.now(CST) - timedelta(days=retention_days)).strftime("%Y-%m-%d")
    removed = 0
    for f in data_dir.glob("day_*.json"):
        date_str = f.stem.replace("day_", "")
        if date_str < cutoff:
            try:
                f.unlink()
                removed += 1
                logger.info(f"清理过期文件: {f.name}")
            except Exception as e:
                logger.warning(f"删除 {f.name} 失败: {e}")
    if removed:
        logger.info(f"共清理 {removed} 个过期文件")
    return removed
```

Add import at top of collector.py (after existing imports):
```python
import logging
logger = logging.getLogger(__name__)
```

- [ ] **Step 3: Call cleanup after collect_live and collect_replay**

In `collect_live()`, after `store.update_day(date_str)` (around line 515), add:

```python
    # 清理过期文件
    try:
        retention = cfg.get("cache", {}).get("retention_days", 14)
        cleanup_old_files(data_dir, retention_days=retention)
    except Exception as e:
        logger.warning(f"清理过期文件失败: {e}")
```

In `collect_replay()`, after `store.update_day(date_str)` (around line 597), add the same block.

- [ ] **Step 4: Verify collector still works**

Run: `cd /Users/wansheng/git/hot-dashboard && python -c "from backend.collector import cleanup_old_files; print('OK')"`
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add backend/collector.py config/settings.yaml
git commit -m "feat: add disk cleanup for old data files + cache config"
```

---

### Task 7: Frontend fetch cache strategy

**Files:**
- Modify: `src/lib/api.ts`

**Interfaces:**
- Consumes: HTTP Cache-Control and ETag headers from backend
- Produces: Browser handles 304 responses automatically

- [ ] **Step 1: Update fetchJson to use default cache**

Modify `src/lib/api.ts` line 17-23:

```typescript
async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    cache: 'default',  // 让浏览器自动处理 Cache-Control 和 ETag/304
    ...options,
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/wansheng/git/hot-dashboard && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/api.ts
git commit -m "perf: enable browser HTTP cache for API requests"
```

---

### Task 8: Integration test — verify all endpoints work

**Files:**
- None (manual verification)

- [ ] **Step 1: Start backend and test startup log**

Run:
```bash
cd /Users/wansheng/git/hot-dashboard
# Kill any existing processes
pkill -f "uvicorn" 2>/dev/null; sleep 1
# Start backend
python -m uvicorn backend.server:app --host 0.0.0.0 --port 8765 2>&1 | head -20
```
Expected: Log shows `✅ 预加载完成: X 天数据 (共 Y 天), 耗时 Z.Zs` where Z < 2.0

- [ ] **Step 2: Test ETag / 304 behavior**

Run:
```bash
# First request — get ETag
ETAG=$(curl -sI http://localhost:8765/api/dates | grep -i etag | tr -d '\r' | awk '{print $2}')
echo "ETag: $ETAG"

# Second request with If-None-Match — should get 304
curl -sI -H "If-None-Match: $ETAG" http://localhost:8765/api/dates | head -5
```
Expected: Second request returns `HTTP/1.1 304 Not Modified`

- [ ] **Step 3: Test stock-messages with index**

Run:
```bash
# Find a stock code that exists
STOCK=$(curl -s http://localhost:8765/api/latest | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['stk'][0]['c'] if d.get('stk') else '')")
echo "Testing stock: $STOCK"

# Time the request
time curl -s "http://localhost:8765/api/stock-messages/2026-07-07?code=$STOCK" | python3 -m json.tool | head -10
```
Expected: Response time < 200ms

- [ ] **Step 4: Test sentiment-timeline caching**

Run:
```bash
# First call (computes)
time curl -s http://localhost:8765/api/day/2026-07-07/sentiment-timeline | python3 -m json.tool | head -5

# Second call (cached)
time curl -s http://localhost:8765/api/day/2026-07-07/sentiment-timeline | python3 -m json.tool | head -5
```
Expected: Second call significantly faster (< 10ms vs first call)

- [ ] **Step 5: Test Cache-Control headers**

Run:
```bash
curl -sI http://localhost:8765/api/day/2026-07-07 | grep -i cache-control
curl -sI http://localhost:8765/api/report/2026-07-07 | grep -i cache-control
curl -sI http://localhost:8765/api/market/indices | grep -i cache-control
```
Expected: Each returns appropriate Cache-Control value

- [ ] **Step 6: Test lazy loading**

Run:
```bash
# Access a date that was not pre-loaded (if there are > max_hot_days dates)
curl -s http://localhost:8765/api/dates | python3 -c "import sys,json; dates=[d['date'] for d in json.load(sys.stdin)]; print(f'Total dates: {len(dates)}'); print(f'Oldest: {dates[-1]}')"

# Request oldest date (triggers lazy load)
OLDEST=$(curl -s http://localhost:8765/api/dates | python3 -c "import sys,json; print(json.load(sys.stdin)[-1]['date'])")
time curl -s "http://localhost:8765/api/day/$OLDEST" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Snapshots: {len(d.get(\"snapshots\", []))}')"
```
Expected: Lazy-loaded date returns data, slightly slower than pre-loaded

- [ ] **Step 7: Verify all data formats unchanged**

Run:
```bash
# Compare response shapes against expected types
curl -s http://localhost:8765/api/status | python3 -c "
import sys, json
d = json.load(sys.stdin)
required = ['status', 'current_date', 'latest_time', 'group_count', 'task_running']
missing = [k for k in required if k not in d]
print(f'status: {\"OK\" if not missing else f\"MISSING: {missing}\"}')
"

curl -s http://localhost:8765/api/day/2026-07-07 | python3 -c "
import sys, json
d = json.load(sys.stdin)
required = ['date', 'meta', 'snapshots']
missing = [k for k in required if k not in d]
print(f'day: {\"OK\" if not missing else f\"MISSING: {missing}\"}')
"
```
Expected: Both show `OK`

- [ ] **Step 8: Final commit (if any fixups needed)**

```bash
git add -A
git commit -m "fix: integration test fixups"
```

---

### Task 9: Full test suite run + cleanup

- [ ] **Step 1: Run complete test suite**

Run: `cd /Users/wansheng/git/hot-dashboard && python -m pytest tests/ -v --tb=short`
Expected: All tests PASS

- [ ] **Step 2: Verify no regressions in existing functionality**

Run the backend and hit every endpoint:
```bash
for endpoint in \
  "/api/status" \
  "/api/dates" \
  "/api/latest" \
  "/api/day/2026-07-07" \
  "/api/day/2026-07-07/meta" \
  "/api/day/2026-07-07/snapshots?start=0&count=5" \
  "/api/day/2026-07-07/sentiment-timeline" \
  "/api/day/2026-07-07/extreme-stats" \
  "/api/market/indices" \
  "/api/market/advance-decline" \
  "/api/report/2026-07-07"; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:8765$endpoint")
  echo "$endpoint → $STATUS"
done
```
Expected: All return 200

- [ ] **Step 3: Final commit and push**

```bash
git status
git log --oneline -5
```

Review the commit history, then push when ready.
