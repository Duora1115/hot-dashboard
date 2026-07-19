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
from backend.collector import resolve_stock_name

logger = logging.getLogger(__name__)

CST = timezone(timedelta(hours=8))


def _compress_snapshot(s):
    """压缩单个快照（线程安全，无共享状态）"""
    top10 = []
    for t in s.get("top10_stocks", []):
        code = t["code"]
        # 始终用映射表校正名称，修正历史数据中的错误名称
        name = resolve_stock_name(code, t.get("name", ""))
        top10.append({
            "c": code, "n": name, "h": t["score"], "sc": t["score"],
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
            # 板块关联的股票名也用映射表校正
            "s": [resolve_stock_name(st["code"], st.get("name", ""))
                  for st in s.get("top10_stocks", []) if t["name"] in st.get("sectors", [])],
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
        self._last_access: dict[str, int] = {}
        self._access_counter: int = 0

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
        self._access_counter += 1
        self._last_access[date_str] = self._access_counter

    def _evict_if_needed(self):
        """当内存天数超过 max_hot_days 时，淘汰最近最少使用的。"""
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
            self._access_counter += 1
            self._last_access[date_str] = self._access_counter
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
