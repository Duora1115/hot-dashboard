#!/usr/bin/env python3
"""
DataStore — 4 层数据架构：
  存储层（压缩快照内存）+ 索引层 + 原始数据 LRU + 派生数据缓存
启动时只做磁盘元信息扫描；按需/惰性加载单日；内存中不保留 sec[].gd 消息明细。
"""

import logging
import time
from pathlib import Path
from datetime import datetime, timezone, timedelta
from concurrent.futures import ThreadPoolExecutor

from backend.index import IndexRegistry
from backend.cache import RawDataLRU, DerivedCache
from backend.collector import load_stock_mapping
from backend.jsonio import load_path

logger = logging.getLogger(__name__)

CST = timezone(timedelta(hours=8))


def _compress_snapshot(s, name_map):
    """Compress a raw snapshot into the compact frontend-facing shape.

    ``name_map`` is the pre-loaded stock code → canonical name dict, so we skip
    hundreds of thousands of function calls on hot startup / lazy-load paths.

    Note: this deliberately drops sector ``group_details`` (the ``gd`` field);
    those hold >90% of the byte-weight and are only needed by two endpoints
    which now read them from the raw LRU cache on demand.
    """
    top10 = []
    for t in s.get("top10_stocks", []):
        code = t["code"]
        raw_name = t.get("name", "")
        name = name_map.get(code) or (raw_name if raw_name else code)
        first_time = t.get("first_time", "")
        last_time = t.get("last_time", "")
        sectors = t.get("sectors", [])
        top10.append({
            "c": code, "n": name, "h": t["score"], "sc": t["score"],
            "mc": t["mention_count"], "gc": t["group_count"],
            "ac": t["action_count"], "bu": t["bull"], "be": t["bear"],
            "ft": first_time.split(" ", 1)[1] if " " in first_time else "",
            "lt": last_time.split(" ", 1)[1] if " " in last_time else "",
            "sec": sectors, "s": sectors,
        })

    top10_stocks_raw = s.get("top10_stocks", [])
    top8 = []
    for t in s.get("top8_sectors", []):
        name = t["name"]
        # Pre-compute the "stocks in this sector" list from the top10 stocks.
        stocks_in_sector = [
            name_map.get(st["code"]) or (st.get("name", "") or st["code"])
            for st in top10_stocks_raw
            if name in st.get("sectors", [])
        ]
        top8.append({
            "n": name, "h": t["score"], "sc": t["score"],
            "m": t["mention_count"], "mc": t["mention_count"],
            "g": t["group_count"], "gc": t["group_count"],
            "s": stocks_in_sector,
            "txt": (t.get("sample_text", ""))[:60],
            # NOTE: gd removed on purpose — served on-demand from raw LRU.
        })

    sd = s.get("sentiment_detail", {})
    return {
        "t": s["time"], "msg": s["total_messages"], "grp": s["active_groups"],
        "sent": s.get("overall_sentiment", ""),
        "sd": {"bu": sd.get("bull", 0), "be": sd.get("bear", 0), "ne": sd.get("neutral", 0),
               "eh": sd.get("extreme_high", 0), "el": sd.get("extreme_low", 0)},
        "act": s.get("action_summary", {}),
        "stk": top10, "sec": top8,
    }


class DataStore:
    def __init__(self, data_dir: Path, max_hot_days: int = 14, raw_lru_days: int = 3,
                 eager_load_days: int | None = None):
        self.data_dir = data_dir
        self.max_hot_days = max_hot_days
        # Number of days to pre-load at startup. ``None`` means "no eager
        # preload"; only the latest day is loaded, everything else is lazy.
        # This makes cold starts on tiny remote boxes usable.
        self.eager_load_days = eager_load_days if eager_load_days is not None else 1
        self._days: dict[str, dict] = {}
        self._latest: dict | None = None
        self._dates: list[str] = []
        self._dates_info: dict[str, float] = {}
        self._last_access: dict[str, int] = {}
        self._access_counter: int = 0

        # 4-layer components
        self.index = IndexRegistry()
        self.raw_cache = RawDataLRU(max_days=raw_lru_days)
        self.derived_cache = DerivedCache()

    def startup(self):
        """Metadata-only scan + eager-load a small window. Everything else lazy."""
        t0 = time.time()
        day_files = sorted(self.data_dir.glob("day_*.json")) if self.data_dir.exists() else []

        for path in day_files:
            date_str = path.stem.replace("day_", "")
            self._dates_info[date_str] = round(path.stat().st_size / 1024, 1)

        all_dates = sorted(self._dates_info.keys())

        # Only pre-load the last N days (default 1). Historical dates page in
        # lazily on first access.
        n = max(0, self.eager_load_days)
        recent_dates = all_dates[-n:] if n and len(all_dates) > n else (all_dates if n else [])

        # Warm the stock-name mapping once so every subsequent _load_day avoids
        # a first-touch penalty.
        name_map = load_stock_mapping() or {}

        recent_paths = [
            self.data_dir / f"day_{d}.json"
            for d in recent_dates
            if (self.data_dir / f"day_{d}.json").exists()
        ]

        def _load_one(path: Path):
            date_str = path.stem.replace("day_", "")
            try:
                self._load_day(date_str, path, name_map=name_map)
            except Exception as e:
                logger.warning(f"预加载 {date_str} 失败: {e}")

        if recent_paths:
            workers = min(4, len(recent_paths))
            with ThreadPoolExecutor(max_workers=workers) as pool:
                list(pool.map(_load_one, recent_paths))

        # Build index for the loaded days.
        for date_str in list(self._days.keys()):
            try:
                self.index.build_for_day(date_str, self._days[date_str])
            except Exception as e:
                logger.warning(f"索引构建 {date_str} 失败: {e}")

        self._dates = sorted(self._days.keys())

        try:
            self.update_latest()
        except Exception as e:
            logger.warning(f"预加载 latest.json 失败: {e}")

        elapsed = time.time() - t0
        logger.info(
            f"✅ 启动完成: 索引 {len(all_dates)} 天，预加载 {len(self._days)} 天，"
            f"耗时 {elapsed:.2f}s"
        )

    def _load_day(self, date_str: str, path: Path, name_map: dict | None = None):
        """Load and compress one day into memory."""
        raw = load_path(path)

        total = raw.get("total_msgs", 0)
        snapshots = raw.get("snapshots", [])
        if not total and snapshots:
            total = snapshots[-1].get("total_messages", 0)

        if name_map is None:
            name_map = load_stock_mapping() or {}
        compressed_snaps = [_compress_snapshot(s, name_map) for s in snapshots]
        meta = {
            "start": snapshots[0]["time"] if snapshots else "",
            "end": snapshots[-1]["time"] if snapshots else "",
            "count": len(snapshots),
            "message_count": total,
        }
        day_data = {"date": raw.get("date", date_str), "meta": meta, "snapshots": compressed_snaps}
        self._days[date_str] = day_data
        self._access_counter += 1
        self._last_access[date_str] = self._access_counter

    def _evict_if_needed(self):
        while len(self._days) > self.max_hot_days:
            lru_date = min(self._last_access, key=self._last_access.get)
            del self._days[lru_date]
            del self._last_access[lru_date]
            self.index.remove_date(lru_date)
            self.derived_cache.invalidate(lru_date)
            self.raw_cache.evict(lru_date)
            if lru_date in self._dates:
                self._dates.remove(lru_date)
            logger.debug(f"内存淘汰: {lru_date}")

    def update_day(self, date_str: str):
        path = self.data_dir / f"day_{date_str}.json"
        if not path.exists():
            return
        try:
            self._load_day(date_str, path)
            self.index.build_for_day(date_str, self._days[date_str])
            self.derived_cache.invalidate(date_str)
            self.raw_cache.evict(date_str)
            if date_str not in self._dates:
                self._dates = sorted(self._days.keys())
            self._dates_info[date_str] = round(path.stat().st_size / 1024, 1)
            self._evict_if_needed()
        except Exception as e:
            logger.warning(f"更新 {date_str} 失败: {e}")

    def update_latest(self):
        latest_path = self.data_dir / "latest.json"
        if not latest_path.exists():
            self._latest = None
            return
        raw = load_path(latest_path)
        name_map = load_stock_mapping() or {}
        self._latest = _compress_snapshot(raw, name_map)
        today = datetime.now(CST).strftime("%Y-%m-%d")
        self.derived_cache.invalidate(today)

    def get_latest_raw(self) -> dict | None:
        latest_path = self.data_dir / "latest.json"
        if not latest_path.exists():
            return None
        try:
            return load_path(latest_path)
        except Exception as e:
            logger.warning(f"读取 latest.json 失败: {e}")
            return None

    def get_dates(self) -> list[str]:
        return sorted(self._dates_info.keys())

    def get_dates_info(self) -> list[dict]:
        return [
            {"date": d, "size_kb": self._dates_info.get(d, 0)}
            for d in sorted(self._dates_info.keys(), reverse=True)
        ]

    def get_latest(self) -> dict | None:
        return self._latest

    def get_day(self, date_str: str) -> dict | None:
        if date_str in self._days:
            self._access_counter += 1
            self._last_access[date_str] = self._access_counter
            return self._days[date_str]
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
        """Return raw snapshots (with gd). Cached via LRU."""
        cached = self.raw_cache.get(date_str)
        if cached is not None:
            return cached.get("snapshots", [])
        path = self.data_dir / f"day_{date_str}.json"
        if not path.exists():
            return []
        try:
            raw = load_path(path)
            self.raw_cache.put(date_str, raw)
            return raw.get("snapshots", [])
        except Exception as e:
            logger.warning(f"读取原始数据 {date_str} 失败: {e}")
            return []

    def get_version(self, date_str: str) -> int:
        return self.derived_cache.get_version(date_str)
