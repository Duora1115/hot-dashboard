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
