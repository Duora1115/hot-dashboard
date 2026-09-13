"""回补：翻页、越过 since 停止、跳过已覆盖的群"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.palace_archive import archive_path, load_ids, load_state, save_state
from backend.palace_backfill import backfill_group, resolve_groups


def _msg(mid, day, time="08:09"):
    return {"message_id": mid, "create_time": f"{day} {time}", "content": f"{mid} 看多 江波龙"}


def _pager(pages):
    """把 [[msg,...], ...] 变成一个假的 fetch(chat_id, token, page_size) 函数。"""
    calls = {"n": 0}

    def fetch(chat_id, page_token=None, page_size=50):
        i = calls["n"]
        calls["n"] += 1
        if i >= len(pages):
            return [], None, False
        return pages[i], (f"tok{i+1}" if i + 1 < len(pages) else None), i + 1 < len(pages)

    fetch.calls = calls
    return fetch


def test_backfill_walks_pages_and_archives_in_range_messages(tmp_path):
    pages = [
        [_msg("om_3", "2026-07-08"), _msg("om_2", "2026-07-07")],
        [_msg("om_1", "2026-07-05")],
    ]
    result = backfill_group("oc_1", "253_橙子不糊涂", "2026-07-01",
                            tmp_path, fetch=_pager(pages), sleep=0)

    assert load_ids(tmp_path, "oc_1") == {"om_1", "om_2", "om_3"}
    assert result["added"] == 3
    assert result["earliest"] == "2026-07-05 08:09"


def test_backfill_stops_after_passing_since(tmp_path):
    # 第二页已经越过 since（06-30 < 07-01），不应再请求第三页
    pages = [
        [_msg("om_3", "2026-07-08")],
        [_msg("om_1", "2026-06-30")],
        [_msg("om_0", "2026-06-01")],
    ]
    fetch = _pager(pages)
    backfill_group("oc_1", "群", "2026-07-01", tmp_path, fetch=fetch, sleep=0)

    assert fetch.calls["n"] == 2, "越过 since 后必须停止翻页"
    assert "om_0" not in load_ids(tmp_path, "oc_1")


def test_backfill_skips_messages_older_than_since(tmp_path):
    pages = [[_msg("om_3", "2026-07-08"), _msg("om_old", "2026-05-01")]]
    backfill_group("oc_1", "群", "2026-07-01", tmp_path, fetch=_pager(pages), sleep=0)

    assert load_ids(tmp_path, "oc_1") == {"om_3"}


def test_backfill_is_idempotent(tmp_path):
    pages = [[_msg("om_1", "2026-07-08")]]
    backfill_group("oc_1", "群", "2026-07-01", tmp_path, fetch=_pager(pages), sleep=0)
    second = backfill_group("oc_1", "群", "2026-07-01", tmp_path, fetch=_pager(pages), sleep=0)

    assert second["added"] == 0
    lines = archive_path(tmp_path, "oc_1").read_text(encoding="utf-8").strip().split("\n")
    assert len(lines) == 1


def test_backfill_reports_missing_id_rows(tmp_path):
    """翻到的消息缺 id：added=0 之外必须能看到 skipped_no_id。"""
    no_id = [{"create_time": "2026-07-08 08:09", "content": "无 id"}]
    result = backfill_group("oc_1", "群", "2026-07-01", tmp_path,
                            fetch=_pager([no_id]), sleep=0)

    assert result["added"] == 0
    assert result["skipped_no_id"] == 1
    assert result["skipped_dup"] == 0


def test_backfill_rerun_is_dup_not_missing_id(tmp_path):
    pages = [[_msg("om_1", "2026-07-08")]]
    backfill_group("oc_1", "群", "2026-07-01", tmp_path, fetch=_pager(pages), sleep=0)

    result = backfill_group("oc_1", "群", "2026-07-01", tmp_path,
                            fetch=_pager(pages), sleep=0)

    assert result["added"] == 0
    assert result["skipped_dup"] == 1
    assert result["skipped_no_id"] == 0


def test_backfill_stops_when_has_more_is_false(tmp_path):
    pages = [[_msg("om_1", "2026-07-08")]]
    fetch = _pager(pages)
    backfill_group("oc_1", "群", "2026-01-01", tmp_path, fetch=fetch, sleep=0)

    assert fetch.calls["n"] == 1, "首页 has_more=false 即终止，不该再请求下一页"


def test_backfill_respects_max_pages(tmp_path):
    pages = [[_msg(f"om_{i}", "2026-07-08")] for i in range(5)]
    fetch = _pager(pages)
    backfill_group("oc_1", "群", "2026-01-01", tmp_path, fetch=fetch, max_pages=2, sleep=0)

    assert fetch.calls["n"] == 2


def test_backfill_records_state(tmp_path):
    pages = [[_msg("om_1", "2026-07-08")]]
    backfill_group("oc_1", "群", "2026-07-01", tmp_path, fetch=_pager(pages), sleep=0)

    state = load_state(tmp_path)
    assert state["oc_1"]["earliest_ts"] == "2026-07-08 08:09"


def test_resolve_groups_by_name_and_all():
    cfg = {"groups": [
        {"chat_id": "oc_1", "name": "001_震哥仅ls"},
        {"chat_id": "oc_2", "name": "253_橙子不糊涂"},
    ]}

    assert len(resolve_groups(cfg, "all")) == 2
    assert [g["chat_id"] for g in resolve_groups(cfg, "253")] == ["oc_2"]
    assert [g["chat_id"] for g in resolve_groups(cfg, "oc_1")] == ["oc_1"]
    assert resolve_groups(cfg, "不存在") == []
