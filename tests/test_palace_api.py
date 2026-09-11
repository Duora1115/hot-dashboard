"""palace API：只读、可降级（无索引时不 500）"""
import json
import sys
import tempfile
from pathlib import Path

import pytest
from starlette.testclient import TestClient

sys.path.insert(0, str(Path(__file__).parent.parent))

from backend import server
from backend.palace import PalaceStore
from backend.palace_build import build_profile, kols_index_path


@pytest.fixture
def client():
    tmp = Path(tempfile.mkdtemp(prefix="hotdash-palace-test-"))
    server.data_dir = tmp
    server.palace = PalaceStore(tmp)
    server.palace.startup()
    with TestClient(server.app) as c:
        yield c


def _seed(tmp: Path):
    """往 palace 索引里塞一个大V + 一只票，返回 tmp。"""
    kols_index_path(tmp).parent.mkdir(parents=True, exist_ok=True)
    opinions = [{"ts": "2026-07-06 08:09", "id": "om_1", "code": "301308", "name": "江波龙",
                 "bull": True, "bear": False, "actions": ["买入信号"],
                 "sectors": ["半导体"], "text": "江波龙 看多"}]
    from backend.palace_build import build_stock_index, stock_index_path, write_opinions
    write_opinions(tmp, "oc_1", opinions)
    stock_index_path(tmp).write_text(json.dumps(
        build_stock_index({"oc_1": {"name": "253_橙子不糊涂", "opinions": opinions}}),
        ensure_ascii=False), encoding="utf-8")
    kols_index_path(tmp).write_text(json.dumps({
        "generated_at": "2026-09-11T10:00:00+08:00",
        "coverage": {"from": "2026-07-06", "to": "2026-07-06", "groups": 1, "missing_days": []},
        "kols": {"oc_1": {
            "chat_id": "oc_1", "name": "253_橙子不糊涂", "msg_count": 1, "opinion_count": 1,
            "active_days": 1, "stock_count": 1, "first_ts": "2026-07-06 08:09",
            "last_ts": "2026-07-06 08:09", "style": build_profile(opinions, {}),
        }},
    }, ensure_ascii=False), encoding="utf-8")
    return tmp


def test_meta_degrades_without_index(client):
    r = client.get("/api/palace/meta")

    assert r.status_code == 200, "无索引也必须 200，不能 500"
    assert r.json() == {"generated_at": "", "coverage": {}}


def test_kols_list_degrades_to_empty(client):
    r = client.get("/api/palace/kols")

    assert r.status_code == 200
    assert r.json()["kols"] == []


def test_kol_detail_404_when_unknown(client):
    assert client.get("/api/palace/kols/oc_nope").status_code == 404
    assert client.get("/api/palace/kols/oc_nope/stocks/301308").status_code == 404
    assert client.get("/api/palace/stocks/999999").status_code == 404


def test_endpoints_after_seeding():
    tmp = Path(tempfile.mkdtemp(prefix="hotdash-palace-test-"))
    _seed(tmp)
    server.data_dir = tmp
    server.palace = PalaceStore(tmp)
    server.palace.startup()

    with TestClient(server.app) as c:
        kols = c.get("/api/palace/kols")
        assert kols.status_code == 200
        assert kols.json()["kols"][0]["name"] == "253_橙子不糊涂"

        kol = c.get("/api/palace/kols/oc_1")
        assert kol.status_code == 200
        assert kol.json()["stocks"][0]["code"] == "301308"
        assert kol.json()["stocks"][0]["count"] == 1
        assert "recent" not in kol.json()["stocks"][0]

        stocks = c.get("/api/palace/stocks")
        assert stocks.status_code == 200
        assert stocks.json()["stocks"][0]["code"] == "301308"

        timeline = c.get("/api/palace/kols/oc_1/stocks/301308")
        assert timeline.status_code == 200
        assert len(timeline.json()["opinions"]) == 1

        meta = c.get("/api/palace/meta")
        assert meta.json()["coverage"]["groups"] == 1


def _seed_two_groups(tmp: Path):
    """两个群讨论同一只票（时间交错），返回 tmp。"""
    from backend.palace_build import build_stock_index, stock_index_path, write_opinions

    def op(ts, oid, text):
        return {"ts": ts, "id": oid, "code": "300308", "name": "中际旭创",
                "bull": oid != "a2", "bear": oid == "a2",
                "actions": ["买入信号"], "sectors": ["CPO"], "text": text}

    groups = {
        "oc_a": {"name": "253_橙子不糊涂", "opinions": [
            op("2026-07-06 09:30", "a1", "A 早上看多"),
            op("2026-07-06 14:00", "a2", "A 尾盘转空"),
        ]},
        "oc_b": {"name": "006_帝凌枫", "opinions": [
            op("2026-07-06 10:15", "b1", "B 盘中加仓"),
        ]},
    }
    for chat_id, g in groups.items():
        write_opinions(tmp, chat_id, g["opinions"])
    stock_index_path(tmp).parent.mkdir(parents=True, exist_ok=True)
    stock_index_path(tmp).write_text(json.dumps(
        build_stock_index(groups), ensure_ascii=False), encoding="utf-8")
    kols_index_path(tmp).write_text(json.dumps({
        "generated_at": "2026-09-11T10:00:00+08:00",
        "coverage": {"from": "2026-07-06", "to": "2026-07-06", "groups": 2, "missing_days": []},
        "kols": {},
    }, ensure_ascii=False), encoding="utf-8")
    return tmp


def _client_for(tmp: Path) -> TestClient:
    server.data_dir = tmp
    server.palace = PalaceStore(tmp)
    server.palace.startup()
    return TestClient(server.app)


def test_stock_opinions_merges_groups_newest_first():
    tmp = Path(tempfile.mkdtemp(prefix="hotdash-palace-test-"))
    _seed_two_groups(tmp)

    with _client_for(tmp) as c:
        r = c.get("/api/palace/stocks/300308/opinions")

    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "中际旭创"
    assert body["group_count"] == 2
    assert body["total_mentions"] == 3
    assert [o["ts"] for o in body["opinions"]] == [
        "2026-07-06 14:00", "2026-07-06 10:15", "2026-07-06 09:30",
    ]
    # 每条都带得出处的群，前端才能点回该大V 的个股页
    assert body["opinions"][0]["chat_id"] == "oc_a"
    assert body["opinions"][0]["group"] == "253_橙子不糊涂"
    assert body["opinions"][1]["chat_id"] == "oc_b"
    assert body["opinions"][1]["group"] == "006_帝凌枫"


def test_stock_opinions_404_when_unknown():
    tmp = Path(tempfile.mkdtemp(prefix="hotdash-palace-test-"))
    _seed_two_groups(tmp)

    with _client_for(tmp) as c:
        r = c.get("/api/palace/stocks/999999/opinions")

    assert r.status_code == 404
    assert r.json()["detail"]


def test_palace_endpoints_are_read_only(client):
    """写接口方法必须不被 palace 路由接受。"""
    assert client.post("/api/palace/kols").status_code == 405
