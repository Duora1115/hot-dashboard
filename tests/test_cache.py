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
