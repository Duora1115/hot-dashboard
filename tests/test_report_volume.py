"""晨报量能口径：totalVolume 用当日总数，hourlyData 用逐快照增量。"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.report import compute_volume_data


def _snap(t, msg):
    return {"t": t, "msg": msg}


# msg 是「当日累计值」，不是该快照新增量——这是全部 bug 的根源。
SNAPS = [_snap("2026-09-10 09:30", 100), _snap("2026-09-10 09:35", 160),
         _snap("2026-09-10 10:00", 300), _snap("2026-09-10 10:05", 300)]


def test_total_uses_message_count_not_sum_of_cumulative():
    r = compute_volume_data(SNAPS, message_count=1187, prev_message_count=None)
    assert r["totalVolume"] == 1187, "不能是对累计值求和（那会得到 860）"


def test_hourly_is_per_snapshot_delta():
    r = compute_volume_data(SNAPS, message_count=1187, prev_message_count=None)
    assert r["hourlyData"] == [{"time": "09:00", "volume": 160}, {"time": "10:00", "volume": 140}]


def test_peak_hour_comes_from_deltas():
    r = compute_volume_data(SNAPS, message_count=1187, prev_message_count=None)
    assert r["peakHour"] == "09:00"
    assert r["peakVolume"] == 160


def test_change_percent_is_none_without_previous_day():
    r = compute_volume_data(SNAPS, message_count=1187, prev_message_count=None)
    assert r["prevVolume"] is None
    assert r["changePercent"] is None, "拿不到昨日就返回 None，不要假装是 +0.0%"


def test_change_percent_uses_previous_day_total():
    r = compute_volume_data(SNAPS, message_count=1100, prev_message_count=1000)
    assert r["changePercent"] == 10.0


def test_negative_delta_falls_back_to_cumulative():
    """跨天重置／脏数据：累计值变小说明换了计数起点，按当前累计值兜底。"""
    r = compute_volume_data([_snap("2026-09-10 00:25", 5), _snap("2026-09-10 00:30", 2)],
                            message_count=2, prev_message_count=None)
    assert r["hourlyData"] == [{"time": "00:00", "volume": 7}]


from backend.report import _active_groups


def test_active_groups_uses_last_snapshot_and_configured_total():
    snaps = [{"t": "2026-09-10 00:25", "msg": 3, "grp": 1},
             {"t": "2026-09-10 23:55", "msg": 1187, "grp": 24}]
    assert _active_groups(snaps, total=25) == {"active": 24, "total": 25}


def test_active_groups_falls_back_to_zero():
    assert _active_groups([], total=25) == {"active": 0, "total": 25}


from backend.report import _advance_decline_or_none, generate_report


def test_no_estimate_when_source_missing():
    """旧实现会拿「看多条数 × 30」编一个涨跌家数出来——那会和指数 −1.18% 打架。"""
    assert _advance_decline_or_none(None) is None


def test_real_source_passes_through():
    real = {"rising": 1200, "falling": 420, "unchanged": 3480,
            "limitUp": 13, "limitDown": 2, "risingPercent": 74.1}
    assert _advance_decline_or_none(real) == real


def _day_data_with_one_snapshot():
    return {"meta": {"message_count": 5}, "snapshots": [
        {"t": "2026-09-11 09:30", "msg": 5, "grp": 2, "sent": "偏多",
         "sd": {"bu": 3, "be": 1, "ne": 1}, "sec": [], "stk": [], "act": {}},
    ]}


def test_report_has_no_market_indices_key(monkeypatch):
    """marketIndices 是没人渲染的死数据，返回体里不该再有这个键。"""
    monkeypatch.setattr("backend.market.fetch_kline", lambda *a, **k: [])
    r = generate_report("2026-09-11", _day_data_with_one_snapshot(), advance_decline=None)
    assert "marketIndices" not in r


def test_report_advance_decline_is_none_when_source_missing(monkeypatch):
    """源码返回 None 时必须留白，不能估算出「93.8% 上涨」。"""
    monkeypatch.setattr("backend.market.fetch_kline", lambda *a, **k: [])
    r = generate_report("2026-09-11", _day_data_with_one_snapshot(), advance_decline=None)
    assert r.get("advanceDecline") is None


from backend.report import _empty_report


def test_empty_report_uses_configured_group_total():
    """空数据日不能把接入群总数硬编码成 0（「基于 0 个飞书投资群」）。"""
    r = _empty_report("2026-09-11", active_group_count=25)
    assert r["activeGroups"] == {"active": 0, "total": 25}


def test_generate_report_empty_day_keeps_group_total():
    r = generate_report("2026-09-11", {"snapshots": []}, active_group_count=25)
    assert r["activeGroups"] == {"active": 0, "total": 25}
