"""/api/sector-messages：按需取板块的群消息明细。

压缩存快照时 _compact 会把 sec[].gd 整个剥掉（占体积九成以上），板块抽屉的
「群消息摘要」因此永远没有数据。这个端点从原始 LRU 快照里把它捞回来，快照选择
规则与 /api/stock-messages 一致：不带 time 就给最后一份（累计窗口里最全的那份）。
"""
import json
import re
import sys
import tempfile
from pathlib import Path

import pytest
from starlette.testclient import TestClient

sys.path.insert(0, str(Path(__file__).parent.parent))

from backend import server
from backend.data_store import DataStore

DATE = "2026-07-06"
SECTOR = "半导体"

# RFC 7232 的 etagc 只允许 %x21 / %x23-7E，不含空格、CR、LF 和引号本身。
_SAFE_ETAG = re.compile(r'"[0-9A-Za-z:.|_-]+"')


def _sector(name, group_details):
    return {
        "name": name, "score": 100, "mention_count": sum(g["count"] for g in group_details),
        "group_count": len(group_details), "groups": [g["group"] for g in group_details],
        "group_details": group_details, "sample_text": "样例",
    }


def _group(name, texts):
    return {
        "group": name, "count": len(texts),
        "messages": [{"time": f"{DATE} {t}", "text": f"{name} 的 {t}"} for t in texts],
    }


@pytest.fixture
def client():
    tmp = Path(tempfile.mkdtemp(prefix="hotdash-sector-msgs-"))
    # 两份快照，后者是前者的超集 —— 模拟当天 09:30 → 10:00 的累计过程。
    early = _sector(SECTOR, [_group("群A", ["09:30"])])
    late = _sector(SECTOR, [_group("群A", ["09:30", "09:50"]), _group("群B", ["10:00"])])
    day = {
        "date": DATE,
        "total_msgs": 10,
        "snapshots": [
            {"time": f"{DATE} 09:30", "total_messages": 5, "active_groups": 1,
             "overall_sentiment": "偏多", "sentiment_detail": {}, "action_summary": {},
             "top10_stocks": [], "top8_sectors": [early]},
            {"time": f"{DATE} 10:00", "total_messages": 10, "active_groups": 2,
             "overall_sentiment": "偏多", "sentiment_detail": {}, "action_summary": {},
             "top10_stocks": [], "top8_sectors": [late]},
        ],
    }
    (tmp / f"day_{DATE}.json").write_text(json.dumps(day, ensure_ascii=False), encoding="utf-8")

    server.data_dir = tmp
    server.store = DataStore(tmp)
    server.store.startup()
    with TestClient(server.app) as c:
        yield c


def _messages(resp):
    return [(g["group"], len(g["messages"])) for g in resp.json()]


def test_without_time_returns_latest_snapshot(client):
    r = client.get(f"/api/sector-messages/{DATE}", params={"name": SECTOR})

    assert r.status_code == 200
    assert _messages(r) == [("群A", 2), ("群B", 1)], "必须取最全的那份快照，不是最早的"


def test_explicit_time_still_returns_that_snapshot(client):
    """历史回放要看当时那份，不能被改成永远给最新。"""
    r = client.get(f"/api/sector-messages/{DATE}",
                   params={"name": SECTOR, "time": f"{DATE} 09:30"})

    assert _messages(r) == [("群A", 1)]


def test_unknown_sector_returns_empty_not_html(client):
    """板块不在快照里时给空数组。

    404 会被 server 的 SPA 兜底处理器变成 200 + index.html，前端拿到的就不是
    JSON 了——所以这条路径必须走 200 + []。
    """
    r = client.get(f"/api/sector-messages/{DATE}", params={"name": "不存在的板块"})

    assert r.status_code == 200
    assert r.json() == []


def test_etag_varies_with_name(client):
    a = client.get(f"/api/sector-messages/{DATE}", params={"name": SECTOR})
    b = client.get(f"/api/sector-messages/{DATE}", params={"name": "券商"})

    assert a.headers["etag"] != b.headers["etag"], "不同板块的响应体不同，ETag 不能共用"


def test_etag_varies_with_time(client):
    a = client.get(f"/api/sector-messages/{DATE}", params={"name": SECTOR})
    b = client.get(f"/api/sector-messages/{DATE}",
                   params={"name": SECTOR, "time": f"{DATE} 09:30"})

    assert a.headers["etag"] != b.headers["etag"]


def test_matching_etag_returns_304(client):
    params = {"name": SECTOR}
    first = client.get(f"/api/sector-messages/{DATE}", params=params)
    again = client.get(f"/api/sector-messages/{DATE}", params=params,
                       headers={"If-None-Match": first.headers["etag"]})

    assert again.status_code == 304


@pytest.mark.parametrize("time_value", [
    f"{DATE} 09:30",       # 空格：RFC 7232 的 etagc（%x21 / %x23-7E）不含 %x20
    "x\r\nX-Injected: 1",  # CR/LF：h11 的头部校验会直接掐断连接
    'a"b\\c',              # 引号/反斜杠：原样拼进去会提前把 ETag 闭合掉
])
def test_etag_scope_is_header_safe(client, time_value):
    """scope 由查询参数拼出来，含用户输入，不能原样写进响应头（摘要法免疫）。"""
    r = client.get(f"/api/sector-messages/{DATE}",
                   params={"name": SECTOR, "time": time_value})

    assert r.status_code == 200
    etag = r.headers["etag"]
    assert _SAFE_ETAG.fullmatch(etag), f"ETag 含非法字符: {etag!r}"
