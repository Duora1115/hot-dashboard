"""档案层：追加、去重、断点状态"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.palace_archive import (
    append_messages, append_rows, archive_path, iter_messages, load_ids, load_state,
    save_state,
)


def _row(mid, ts="2026-07-06 08:09", text="江波龙看多", sender="ou_aaa"):
    """已映射格式的档案行（本地 archive 经 HTTP 推送时用的形状）。"""
    return {"id": mid, "ts": ts, "sender": sender, "text": text}


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


def test_stats_report_missing_id_batch(tmp_path):
    """生产故障形态：整批消息都没有 message_id/msg_id。

    append_messages 返回 0 看着像成功，stats 必须点出原因是缺 id。
    """
    stats = {}
    msgs = [
        {"content": "无 id 1", "create_time": "2026-07-06 08:09"},
        {"content": "无 id 2", "create_time": "2026-07-06 08:10"},
    ]

    n = append_messages(tmp_path, "oc_1", "253_橙子不糊涂", msgs, stats=stats)

    assert n == 0
    assert stats["fetched"] == 2
    assert stats["written"] == 0
    assert stats["skipped_no_id"] == 2
    assert stats["skipped_dup"] == 0


def test_stats_distinguish_dup_from_missing_id(tmp_path):
    """重复 id 与缺 id 是两回事，stats 必须分开计数。"""
    append_messages(tmp_path, "oc_1", "253_橙子不糊涂", [_msg("om_1")])

    stats = {}
    n = append_messages(tmp_path, "oc_1", "253_橙子不糊涂",
                        [_msg("om_1"), {"content": "无 id"}], stats=stats)

    assert n == 0
    assert stats == {"fetched": 2, "written": 0, "skipped_no_id": 1, "skipped_dup": 1}


def test_stats_count_written_and_leave_caller_intact(tmp_path):
    """未传 stats 的调用方行为完全不变（返回 int，不依赖 stats）。"""
    stats = {}
    n = append_messages(tmp_path, "oc_1", "253_橙子不糊涂",
                        [_msg("om_1"), _msg("om_2")], stats=stats)

    assert n == 2
    assert stats == {"fetched": 2, "written": 2, "skipped_no_id": 0, "skipped_dup": 0}
    # 不传 stats 仍然是纯 int 返回
    assert append_messages(tmp_path, "oc_2", "群", [_msg("om_9")]) == 1


def test_append_rows_stats_report_skips(tmp_path):
    stats = {}
    n = append_rows(tmp_path, "oc_1", "群",
                    [_row("om_1"), {"text": "无 id"}], stats=stats)

    assert n == 1
    assert stats == {"fetched": 2, "written": 1, "skipped_no_id": 1, "skipped_dup": 0}


def test_known_ids_is_updated_in_place(tmp_path):
    known = load_ids(tmp_path, "oc_1")
    append_messages(tmp_path, "oc_1", "253_橙子不糊涂", [_msg("om_1")], known_ids=known)

    assert known == {"om_1"}


def test_append_rows_writes_mapped_rows(tmp_path):
    n = append_rows(tmp_path, "oc_1", "253_橙子不糊涂", [_row("om_1")])

    assert n == 1
    row = next(iter_messages(tmp_path, "oc_1"))
    assert row == {"id": "om_1", "ts": "2026-07-06 08:09",
                   "group": "253_橙子不糊涂", "sender": "ou_aaa", "text": "江波龙看多"}


def test_append_rows_repush_is_idempotent(tmp_path):
    """推送脚本会整批重推，重复的 id 必须只写一次。"""
    rows = [_row("om_1"), _row("om_2")]
    assert append_rows(tmp_path, "oc_1", "群", rows) == 2
    assert append_rows(tmp_path, "oc_1", "群", rows) == 0
    assert append_rows(tmp_path, "oc_1", "群", rows + [_row("om_3")]) == 1
    assert load_ids(tmp_path, "oc_1") == {"om_1", "om_2", "om_3"}


def test_append_rows_skips_rows_without_id(tmp_path):
    n = append_rows(tmp_path, "oc_1", "群", [{"text": "无 id"}, {"id": "", "text": "空 id"}])

    assert n == 0


def test_append_rows_normalizes_untrusted_fields(tmp_path):
    """行来自网络边界：只保留已知字段并强制类型，group 一律用服务端反查的名字。"""
    n = append_rows(tmp_path, "oc_1", "服务端群名", [{
        "id": "om_1",
        "ts": 1234567890,
        "sender": {"id": "ou_aaa"},
        "text": None,
        "group": "客户端伪造的群名",
        "evil": "额外字段",
    }])

    assert n == 1
    assert next(iter_messages(tmp_path, "oc_1")) == {
        "id": "om_1", "ts": "", "group": "服务端群名", "sender": "", "text": "",
    }


def test_append_rows_known_ids_updated_in_place(tmp_path):
    known = load_ids(tmp_path, "oc_1")
    append_rows(tmp_path, "oc_1", "群", [_row("om_1")], known_ids=known)

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


# ---- 以下是 Task 8 的采集集成测试 ----

from datetime import datetime
from unittest.mock import MagicMock, patch

from backend import collector
from backend.collector import collect_live


def _lark_reply(messages):
    return MagicMock(returncode=0, stdout=__import__("json").dumps(
        {"data": {"messages": messages, "has_more": False, "page_token": None}}))


def _msgs_now():
    """消息时间戳必须取「当前时刻」。

    collect_live 会丢弃 create_time > now 的消息（future 过滤）。写死成
    "09:31" 会让这两个测试在凌晨到早上九点半之间必然失败——本机开发时
    正好是白天，容易漏掉。
    """
    stamp = datetime.now(collector.CST).strftime("%Y-%m-%d %H:%M")
    return [{"message_id": "om_1", "create_time": stamp,
             "content": "江波龙看多", "msg_type": "text"}]


def _cfg(tmp_path):
    return {
        "server": {"data_dir": str(tmp_path)},
        "collector": {"max_pages": 1},
        "groups": [{"chat_id": "oc_1", "name": "253_橙子不糊涂"}],
        "sectors": {}, "sentiments": {}, "actions": {},
    }


def test_collect_live_appends_to_archive(tmp_path):
    with patch("subprocess.run", return_value=_lark_reply(_msgs_now())):
        collect_live(cfg=_cfg(tmp_path), data_dir=tmp_path)

    rows = list(iter_messages(tmp_path, "oc_1"))
    assert len(rows) == 1
    assert rows[0]["text"] == "江波龙看多"


def test_collect_live_survives_archive_failure(tmp_path):
    """档案写失败不能让采集挂掉，也不能改变采集结果。"""
    with patch("subprocess.run", return_value=_lark_reply(_msgs_now())), \
         patch("backend.collector.append_messages", side_effect=OSError("磁盘满")):
        output = collect_live(cfg=_cfg(tmp_path), data_dir=tmp_path)

    assert output["total_messages"] == 1, "档案失败不应影响采集结果"
    assert (tmp_path / "latest.json").exists()


def test_collect_live_reports_whole_batch_dropped_for_missing_id(tmp_path, capsys):
    """抓到了消息、档案却一条没写：必须留下可见的一行，点名群与原因。"""
    stamp = datetime.now(collector.CST).strftime("%Y-%m-%d %H:%M")
    no_id_msgs = [{"create_time": stamp, "content": "无 id", "msg_type": "text"}]

    stats = {}
    with patch("backend.collector.fetch_messages_incremental", return_value=no_id_msgs), \
         patch("subprocess.run", return_value=_lark_reply([])):
        collect_live(cfg=_cfg(tmp_path), data_dir=tmp_path, stats=stats)

    assert stats == {"fetched": 1, "written": 0, "skipped_no_id": 1, "skipped_dup": 0}
    out = capsys.readouterr().out
    assert "档案未写入" in out
    assert "253_橙子不糊涂" in out
    assert "缺id1" in out


def test_collect_live_quiet_when_archive_healthy(tmp_path, capsys):
    """档案正常写入时不出现告警行，避免噪音。"""
    with patch("subprocess.run", return_value=_lark_reply(_msgs_now())):
        collect_live(cfg=_cfg(tmp_path), data_dir=tmp_path, stats={})

    assert "档案未写入" not in capsys.readouterr().out
