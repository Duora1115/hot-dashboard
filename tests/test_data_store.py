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


@pytest.fixture
def data_dir_zero_total(tmp_path):
    """total_msgs 落盘为 0，但快照里有真实 total_messages 的日子。

    线上 33 个 day 文件里有 5 个是这种形态（如 2026-06-11 读 0 而实际 1110）。
    peek 只看文件头的字面 0，day loader 会用 snapshots[-1]["total_messages"] 兜底，
    于是 /api/dates 与 /api/day 对同一天报出两个数。
    """
    day = {
        "date": "2026-06-11",
        "total_msgs": 0,
        "snapshots": [
            {
                "time": "2026-06-11 09:30",
                "total_messages": 500,
                "active_groups": 3,
                "overall_sentiment": "偏多",
                "sentiment_detail": {"bull": 1, "bear": 0, "neutral": 0, "extreme_high": 0, "extreme_low": 0},
                "action_summary": {},
                "top10_stocks": [],
                "top8_sectors": [],
            },
            {
                "time": "2026-06-11 15:00",
                "total_messages": 1110,
                "active_groups": 5,
                "overall_sentiment": "偏多",
                "sentiment_detail": {"bull": 2, "bear": 1, "neutral": 1, "extreme_high": 0, "extreme_low": 0},
                "action_summary": {},
                "top10_stocks": [],
                "top8_sectors": [],
            },
        ],
    }
    with open(tmp_path / "day_2026-06-11.json", "w", encoding="utf-8") as f:
        json.dump(day, f, ensure_ascii=False)
    return tmp_path


@pytest.fixture
def data_dir_unresolvable(tmp_path):
    """peek 读 0，且 snapshots 里也没有可兜底的条数 —— 解析后仍是 0。

    ``_msg_counts_resolved`` 存在的意义正是这种日子：解析结果落定成 0，若不留
    记号，每次 ``get_dates_info`` 都会把同一份文件重读一遍。`data_dir_zero_total`
    （解析成 1110）咬不到这个守卫，因为 ``_msg_counts`` 非 0 本身就会跳过重解析。
    """
    day = {
        "date": "2026-06-11",
        "total_msgs": 0,
        "snapshots": [
            {
                "time": "2026-06-11 09:30",
                "total_messages": 0,
                "active_groups": 0,
                "overall_sentiment": "中性",
                "sentiment_detail": {},
                "action_summary": {},
                "top10_stocks": [],
                "top8_sectors": [],
            }
        ],
    }
    with open(tmp_path / "day_2026-06-11.json", "w", encoding="utf-8") as f:
        json.dump(day, f, ensure_ascii=False)
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

    def test_dates_info_includes_message_count(self, data_dir):
        store = DataStore(data_dir)
        store.startup()
        info = {d["date"]: d for d in store.get_dates_info()}
        assert info["2026-07-06"]["message_count"] == 100
        assert "size_kb" in info["2026-07-06"], "size_kb 保留，前端还有别处可能用到"

    def test_message_count_read_does_not_load_the_day(self, data_dir):
        """get_dates_info 不能把整天读进内存 —— 35 天 × 30MB 会让首屏崩掉。"""
        store = DataStore(data_dir)
        store.startup()
        loaded_after_startup = set(store._days)     # startup 只预热 eager_load_days 天（默认 1）
        store.get_dates_info()
        assert set(store._days) == loaded_after_startup, "get_dates_info 不该触发任何懒加载"

    def test_update_day_refreshes_message_count(self, data_dir):
        """collector 每次写盘都调 update_day；_msg_counts 不刷新会整天报旧值。"""
        store = DataStore(data_dir)
        store.startup()
        info = {d["date"]: d for d in store.get_dates_info()}
        assert info["2026-07-06"]["message_count"] == 100

        # 采集端改写同一天，条数变化
        day1 = json.loads((data_dir / "day_2026-07-06.json").read_text(encoding="utf-8"))
        day1["total_msgs"] = 250
        with open(data_dir / "day_2026-07-06.json", "w", encoding="utf-8") as f:
            json.dump(day1, f, ensure_ascii=False)

        store.update_day("2026-07-06")

        info = {d["date"]: d for d in store.get_dates_info()}
        assert info["2026-07-06"]["message_count"] == 250

    def test_zero_total_msgs_agrees_with_day_meta(self, data_dir_zero_total):
        """total_msgs 落盘为 0（表示未知）时，/api/dates 的条数必须等于 /api/day 的 meta。"""
        store = DataStore(data_dir_zero_total, eager_load_days=0)
        store.startup()

        info = {d["date"]: d for d in store.get_dates_info()}
        day = store.get_day("2026-06-11")

        assert info["2026-06-11"]["message_count"] == day["meta"]["message_count"]
        assert info["2026-06-11"]["message_count"] == 1110, \
            "0 是未知而非空，应回落到 snapshots[-1]['total_messages']"

    def test_zero_total_resolution_does_not_keep_day_in_memory(self, data_dir_zero_total):
        """解析 0 值日条数时不能把整天留在内存 —— /api/dates 仍须保持惰性。"""
        store = DataStore(data_dir_zero_total, eager_load_days=0)
        store.startup()
        assert "2026-06-11" not in store._days

        store.get_dates_info()
        assert set(store._days) == set(), "解析完 0 值日应立刻释放，不该常驻"

    def test_zero_total_resolution_is_cached(self, data_dir_unresolvable, monkeypatch):
        """解析结果已落定（哪怕落定成 0）的日期，后续 get_dates_info 不该再解析。

        信号用调用计数器，不用抛异常：``_resolve_message_count`` 里是
        ``except Exception``，patch ``_load_day`` 抛 AssertionError 会被吞掉后照
        样返回缓存值 —— 那种写法删掉 ``_msg_counts_resolved`` 守卫也照样通过，
        等于没测。这里断言第二次 ``get_dates_info`` 没再碰 ``_load_day``。
        """
        store = DataStore(data_dir_unresolvable, eager_load_days=0)
        store.startup()
        store.get_dates_info()

        assert store._msg_counts["2026-06-11"] == 0
        assert "2026-06-11" in store._msg_counts_resolved

        calls = []
        real_load = store._load_day

        def counting_load(*args, **kwargs):
            calls.append(args[0] if args else kwargs.get("date_str"))
            return real_load(*args, **kwargs)

        monkeypatch.setattr(store, "_load_day", counting_load)
        info = {d["date"]: d for d in store.get_dates_info()}
        assert info["2026-06-11"]["message_count"] == 0
        assert calls == [], "已解析过的 0 值日不该再次加载"

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
