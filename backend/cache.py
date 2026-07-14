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
