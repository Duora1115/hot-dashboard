"""/api/day/{date}/group-activity：从原始快照聚合「群 × 时间槽」消息数。

/api/day 的压缩快照把 sec[].gd 整段剥掉了（占体积九成以上），情绪页的
「群活跃度热力图」因此永远显示「暂无群消息数据」。这个端点回一个小体积计数矩阵。
"""
import json
import sys
import tempfile
from pathlib import Path

import pytest
from starlette.testclient import TestClient

sys.path.insert(0, str(Path(__file__).parent.parent))

from backend import server
from backend.data_store import DataStore

DATE = "2026-07-06"


def _sector(name, group_details):
    return {"name": name, "score": 100, "mention_count": 0, "group_count": len(group_details),
            "groups": [g["group"] for g in group_details], "group_details": group_details,
            "sample_text": ""}


def _group(name, count):
    return {"group": name, "count": count,
            "messages": [{"time": f"{DATE} 09:30", "text": "x"}]}


def _snap(t, sectors, sentiment):
    return {"time": t, "total_messages": 5, "active_groups": 2,
            "overall_sentiment": sentiment, "sentiment_detail": {}, "action_summary": {},
            "top10_stocks": [], "top8_sectors": sectors}


def _write_day(tmp, day):
    (tmp / f"day_{DATE}.json").write_text(json.dumps(day, ensure_ascii=False), encoding="utf-8")


@pytest.fixture
def client():
    tmp = Path(tempfile.mkdtemp(prefix="hotdash-group-act-"))
    day = {
        "date": DATE,
        "total_msgs": 10,
        "snapshots": [
            _snap(f"{DATE} 09:30", [_sector("半导体", [_group("群A", 3)])], "偏多"),
            _snap(f"{DATE} 09:35", [_sector("半导体", [_group("群A", 5), _group("群B", 2)])], "偏空"),
        ],
    }
    _write_day(tmp, day)
    server.data_dir = tmp
    server.store = DataStore(tmp)
    server.store.startup()
    with TestClient(server.app) as c:
        yield c


@pytest.fixture
def client_dup_group():
    """同一快照里同一个群出现在两个板块：计数必须取 max，不能累加。

    若实现用 ``+=``，会把「板块里的计数」加进「消息数」，群A 的格点会变成
    3 + 5 = 8。正确的口径是同一快照内取最大 5（群A 在该快照的消息数）。
    """
    tmp = Path(tempfile.mkdtemp(prefix="hotdash-group-dup-"))
    day = {
        "date": DATE,
        "total_msgs": 10,
        "snapshots": [
            _snap(f"{DATE} 09:30", [
                _sector("半导体", [_group("群A", 3)]),
                _sector("消费", [_group("群A", 5)]),
            ], "偏多"),
        ],
    }
    _write_day(tmp, day)
    server.data_dir = tmp
    server.store = DataStore(tmp)
    server.store.startup()
    with TestClient(server.app) as c:
        yield c


def test_groups_slots_and_cells(client):
    r = client.get(f"/api/day/{DATE}/group-activity")
    assert r.status_code == 200
    body = r.json()
    assert body["groups"] == ["群A", "群B"]
    assert body["slots"] == ["09:30", "09:35"]
    # rows 与 groups 同序，cols 与 slots 同序
    assert body["cells"] == [[3, 5], [0, 2]]


def test_sentiment_per_group_uses_latest_snapshot(client):
    body = client.get(f"/api/day/{DATE}/group-activity").json()
    assert body["sentiment"] == {"群A": "偏空", "群B": "偏空"}


def test_unknown_date_returns_empty_shape(client):
    body = client.get("/api/day/2020-01-01/group-activity").json()
    assert body["groups"] == [] and body["slots"] == []


def test_same_group_two_sectors_takes_max_not_sum(client_dup_group):
    """回归保护：同一快照同一群出现在多个板块时取 max（5），不是累加（8）。"""
    body = client_dup_group.get(f"/api/day/{DATE}/group-activity").json()

    assert body["groups"] == ["群A"]
    assert body["cells"] == [[5]], "同一群在同一快照里跨板块应取最大计数，不能累加板块数"


def test_rows_stay_aligned_with_sorted_groups(client_dup_group):
    """groups 已排序，cells[gi] 必须跟着 groups[gi] 走（Task 11 前端依赖）。"""
    body = client_dup_group.get(f"/api/day/{DATE}/group-activity").json()

    assert body["groups"] == sorted(body["groups"])
    assert len(body["cells"]) == len(body["groups"])
