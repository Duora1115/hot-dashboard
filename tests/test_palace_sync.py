"""把本地档案层推到云端：逐群推送 + 收尾触发一次重建。"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from backend import palace_sync
from backend.palace_archive import append_rows


def _seed(tmp_path, chat_id, n):
    rows = [{"id": f"{chat_id}-m{i}", "ts": "2026-07-06 08:09",
             "sender": "ou_aaa", "text": "江波龙看多"} for i in range(n)]
    assert append_rows(tmp_path, chat_id, f"群_{chat_id}", rows) == n


def _spy(monkeypatch, ok=True):
    """记录 post_to_cloud 的调用，返回 calls 列表。"""
    calls = []

    def fake(cfg, path, payload, label="", timeout=None):
        calls.append({"path": path, "payload": payload, "timeout": timeout})
        return ok

    monkeypatch.setattr(palace_sync, "post_to_cloud", fake)
    return calls


def test_push_archive_posts_every_group_then_rebuilds_once(tmp_path, monkeypatch):
    _seed(tmp_path, "oc_a", 2)
    _seed(tmp_path, "oc_b", 1)
    calls = _spy(monkeypatch)

    stats = palace_sync.push_archive({}, tmp_path)

    paths = [c["path"] for c in calls]
    assert paths.count("/api/palace/archive") == 2
    assert paths.count("/api/palace/rebuild") == 1
    assert paths[-1] == "/api/palace/rebuild", "重建必须在所有档案推完之后"
    assert stats == {"groups": 2, "ok": 2, "rows": 3}


def test_push_archive_gives_rebuild_a_longer_timeout(tmp_path, monkeypatch):
    """重建是同步的，用默认 30 秒超时容易在慢机器上误判失败。"""
    _seed(tmp_path, "oc_a", 1)
    calls = _spy(monkeypatch)

    palace_sync.push_archive({}, tmp_path)

    rebuild = next(c for c in calls if c["path"] == "/api/palace/rebuild")
    archive = next(c for c in calls if c["path"] == "/api/palace/archive")
    assert rebuild["timeout"] == 180
    assert archive["timeout"] is None


def test_push_archive_sends_rows_and_chat_id(tmp_path, monkeypatch):
    _seed(tmp_path, "oc_a", 2)
    calls = _spy(monkeypatch)

    palace_sync.push_archive({}, tmp_path)

    payload = calls[0]["payload"]
    assert payload["chat_id"] == "oc_a"
    assert [r["id"] for r in payload["rows"]] == ["oc_a-m0", "oc_a-m1"]


def test_push_archive_skips_rebuild_when_all_pushes_fail(tmp_path, monkeypatch):
    _seed(tmp_path, "oc_a", 1)
    calls = _spy(monkeypatch, ok=False)

    stats = palace_sync.push_archive({}, tmp_path)

    assert [c["path"] for c in calls] == ["/api/palace/archive"]
    assert stats["ok"] == 0


def test_push_archive_with_empty_archive_dir_makes_no_calls(tmp_path, monkeypatch):
    calls = _spy(monkeypatch)

    stats = palace_sync.push_archive({}, tmp_path)

    assert calls == []
    assert stats == {"groups": 0, "ok": 0, "rows": 0}


def test_push_archive_skips_empty_archive_file(tmp_path, monkeypatch):
    _seed(tmp_path, "oc_a", 1)
    (tmp_path / "archive" / "oc_empty.jsonl").write_text("", encoding="utf-8")
    calls = _spy(monkeypatch)

    stats = palace_sync.push_archive({}, tmp_path)

    assert [c["payload"]["chat_id"] for c in calls if c["path"].endswith("/archive")] == ["oc_a"]
    assert stats["rows"] == 1
