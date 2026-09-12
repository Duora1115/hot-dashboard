"""/api/dates 的 ETag 必须覆盖 message_count。

ETag 原来只摘要「日期个数 + 体积总和」。发布 message_count 修复时 day 文件一个
字节都没动，len / total_kb 与部署前逐字节相同，于是浏览器带 If-None-Match 请求
仍拿到 304，继续用那份 message_count 全是错的旧响应体 —— 修复对用户不可见。

这里从请求层验证：同一份数据两次请求第二次 304；message_count 变了就不再 304。
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


def _snapshot(t, total):
    return {
        "time": t,
        "total_messages": total,
        "active_groups": 1,
        "overall_sentiment": "偏多",
        "sentiment_detail": {},
        "action_summary": {},
        "top10_stocks": [],
        "top8_sectors": [],
    }


@pytest.fixture
def client():
    tmp = Path(tempfile.mkdtemp(prefix="hotdash-dates-etag-"))
    for date_str, total in (("2026-07-05", 100), ("2026-07-06", 200)):
        day = {
            "date": date_str,
            "total_msgs": total,
            "snapshots": [_snapshot(f"{date_str} 09:30", total)],
        }
        (tmp / f"day_{date_str}.json").write_text(
            json.dumps(day, ensure_ascii=False), encoding="utf-8"
        )

    server.data_dir = tmp
    server.store = DataStore(tmp, eager_load_days=0)
    server.store.startup()
    with TestClient(server.app) as c:
        yield c


def test_same_data_returns_304(client):
    first = client.get("/api/dates")
    assert first.status_code == 200

    again = client.get(
        "/api/dates", headers={"If-None-Match": first.headers["etag"]}
    )
    assert again.status_code == 304


def test_etag_changes_when_message_count_changes(client):
    first = client.get("/api/dates")
    assert first.status_code == 200
    etag = first.headers["etag"]

    # 模拟「解析 0 值日」这次修复落地：只有 message_count 变，日期个数和体积不变。
    server.store._msg_counts["2026-07-05"] = 123456

    changed = client.get("/api/dates", headers={"If-None-Match": etag})
    assert changed.status_code == 200, "message_count 变了 ETag 必须变，不能再回 304"
    assert changed.headers["etag"] != etag
