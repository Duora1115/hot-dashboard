"""档案层：追加、去重、断点状态"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.palace_archive import (
    append_messages, archive_path, iter_messages, load_ids, load_state, save_state,
)


def _msg(mid, ts="2026-07-06 08:09", text="江波龙看多", sender="ou_aaa"):
    return {
        "message_id": mid,
        "create_time": ts,
        "content": text,
        "msg_type": "text",
        "sender": {"id": sender, "id_type": "open_id", "sender_type": "user"},
    }


def test_append_writes_one_jsonl_row_per_message(tmp_path):
    n = append_messages(tmp_path, "oc_1", "253_橙子不糊涂", [_msg("om_1")])

    assert n == 1
    lines = archive_path(tmp_path, "oc_1").read_text(encoding="utf-8").strip().split("\n")
    assert len(lines) == 1


def test_append_dedupes_by_message_id(tmp_path):
    append_messages(tmp_path, "oc_1", "253_橙子不糊涂", [_msg("om_1")])
    n = append_messages(tmp_path, "oc_1", "253_橙子不糊涂", [_msg("om_1"), _msg("om_2")])

    assert n == 1, "重复的 om_1 不应再写一次"
    assert load_ids(tmp_path, "oc_1") == {"om_1", "om_2"}


def test_append_stores_sender_id_string_not_dict(tmp_path):
    append_messages(tmp_path, "oc_1", "253_橙子不糊涂", [_msg("om_1", sender="ou_bbb")])

    row = next(iter_messages(tmp_path, "oc_1"))
    assert row["sender"] == "ou_bbb"
    assert row["group"] == "253_橙子不糊涂"
    assert row["ts"] == "2026-07-06 08:09"


def test_append_skips_message_without_id(tmp_path):
    n = append_messages(tmp_path, "oc_1", "253_橙子不糊涂", [{"content": "无 id"}])

    assert n == 0
    assert load_ids(tmp_path, "oc_1") == set()


def test_known_ids_is_updated_in_place(tmp_path):
    known = load_ids(tmp_path, "oc_1")
    append_messages(tmp_path, "oc_1", "253_橙子不糊涂", [_msg("om_1")], known_ids=known)

    assert known == {"om_1"}


def test_iter_messages_skips_corrupt_line(tmp_path):
    path = archive_path(tmp_path, "oc_1")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text('{"id":"om_1","ts":"t","text":"好"}\n不是JSON\n', encoding="utf-8")

    rows = list(iter_messages(tmp_path, "oc_1"))
    assert len(rows) == 1
    assert rows[0]["id"] == "om_1"


def test_state_roundtrip(tmp_path):
    assert load_state(tmp_path) == {}
    save_state(tmp_path, {"oc_1": {"earliest_ts": "2026-06-05", "updated_at": "2026-09-11"}})

    assert load_state(tmp_path)["oc_1"]["earliest_ts"] == "2026-06-05"


def test_iter_messages_on_missing_file_yields_nothing(tmp_path):
    assert list(iter_messages(tmp_path, "oc_nope")) == []
