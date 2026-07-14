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
