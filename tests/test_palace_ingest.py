"""离线导出导入层：结构校验、配置外跳过、幂等"""
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.palace_archive import archive_path, iter_messages
from backend.palace_ingest import ingest_dir, load_export


def _export(chat_id="oc_1", name="001_震哥仅ls", messages=None, **extra):
    doc = {
        "chat_id": chat_id,
        "chat_name": f"☆{name}",
        "group_slug": name,
        "window": {"start": "2026-07-11", "end": "2026-09-11"},
        "message_count": len(messages or []),
        "pagination": {"complete": True, "pages": 1, "items": len(messages or [])},
        "messages": messages if messages is not None else [_raw("om_1")],
    }
    doc.update(extra)
    return doc


def _raw(mid, ts="2026-07-13 09:17", text="江波龙 看多", sender="ou_aaa"):
    """导出文件里的一条原始消息（形状同 lark-cli）。"""
    return {
        "message_id": mid,
        "create_time": ts,
        "content": text,
        "msg_type": "post",
        "sender": {"id": sender, "id_type": "open_id", "sender_type": "user"},
    }


def _write(src: Path, filename: str, doc):
    src.mkdir(parents=True, exist_ok=True)
    (src / filename).write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")


def test_ingest_maps_fields_into_archive_rows(tmp_path):
    src, data = tmp_path / "src", tmp_path / "data"
    _write(src, "☆001☆震哥（仅ls）.json", _export(messages=[_raw("om_1")]))

    result = ingest_dir(src, data, {"oc_1": "001_震哥仅ls"})

    assert result["groups"]["oc_1"]["added"] == 1
    row = next(iter_messages(data, "oc_1"))
    assert row["id"] == "om_1"
    assert row["ts"] == "2026-07-13 09:17"
    assert row["text"] == "江波龙 看多"
    assert row["sender"] == "ou_aaa"
    # 组名取 settings.yaml 的规范名，而不是文件名里的 ☆001☆震哥（仅ls）
    assert row["group"] == "001_震哥仅ls"


def test_ingest_skips_groups_outside_config(tmp_path):
    src, data = tmp_path / "src", tmp_path / "data"
    _write(src, "unknown.json", _export(chat_id="oc_999", name="999_外来群"))

    result = ingest_dir(src, data, {"oc_1": "001_震哥仅ls"})

    assert result["groups"] == {}
    assert len(result["skipped"]) == 1
    assert "配置外" in result["skipped"][0]["reason"]
    assert not archive_path(data, "oc_999").exists(), "配置外的群绝不能落进档案"


def test_ingest_reports_missing_id_rows(tmp_path):
    """导出里整批消息缺 id：added=0 之外必须能看到 skipped_no_id，而不是无声无息。"""
    src, data = tmp_path / "src", tmp_path / "data"
    no_id = [{"create_time": "2026-07-13 09:17", "content": "无 id", "msg_type": "text"}]
    _write(src, "a.json", _export(messages=no_id))

    result = ingest_dir(src, data, {"oc_1": "001_震哥仅ls"})

    g = result["groups"]["oc_1"]
    assert g["added"] == 0
    assert g["skipped_no_id"] == 1, "缺 id 丢行必须被计数并暴露给调用方"
    assert g["skipped_dup"] == 0


def test_ingest_idempotent_rerun_is_dup_not_missing_id(tmp_path):
    """重复导入是正常的，应记为 skipped_dup 而非缺 id。"""
    src, data = tmp_path / "src", tmp_path / "data"
    _write(src, "a.json", _export(messages=[_raw("om_1")]))
    ingest_dir(src, data, {"oc_1": "001_震哥仅ls"})

    second = ingest_dir(src, data, {"oc_1": "001_震哥仅ls"})

    g = second["groups"]["oc_1"]
    assert g["added"] == 0
    assert g["skipped_dup"] == 1
    assert g["skipped_no_id"] == 0


def test_ingest_is_idempotent(tmp_path):
    src, data = tmp_path / "src", tmp_path / "data"
    _write(src, "a.json", _export(messages=[_raw("om_1"), _raw("om_2")]))

    first = ingest_dir(src, data, {"oc_1": "001_震哥仅ls"})
    second = ingest_dir(src, data, {"oc_1": "001_震哥仅ls"})

    assert first["groups"]["oc_1"]["added"] == 2
    assert second["groups"]["oc_1"]["added"] == 0
    assert len(list(iter_messages(data, "oc_1"))) == 2, "重复导入不得产生重复行"


def test_two_files_for_same_group_merge(tmp_path):
    """同群多文件（如「双渠道」导出）合并进同一个档案。"""
    src, data = tmp_path / "src", tmp_path / "data"
    _write(src, "a.json", _export(messages=[_raw("om_1")]))
    _write(src, "b.json", _export(messages=[_raw("om_2")]))

    result = ingest_dir(src, data, {"oc_1": "001_震哥仅ls"})

    assert result["groups"]["oc_1"]["added"] == 2
    assert result["groups"]["oc_1"]["files"] == ["a.json", "b.json"]
    assert len(list(iter_messages(data, "oc_1"))) == 2


def test_broken_file_is_skipped_not_fatal(tmp_path):
    src, data = tmp_path / "src", tmp_path / "data"
    _write(src, "good.json", _export(messages=[_raw("om_1")]))
    (src / "bad.json").write_text("{ not json", encoding="utf-8")
    (src / "nomsg.json").write_text(json.dumps({"chat_id": "oc_2"}), encoding="utf-8")

    result = ingest_dir(src, data, {"oc_1": "001_震哥仅ls", "oc_2": "002_某群"})

    assert result["groups"]["oc_1"]["added"] == 1, "坏文件不该拖垮好文件"
    assert len(result["skipped"]) == 2


def test_load_export_rejects_missing_fields(tmp_path):
    p = tmp_path / "x.json"
    p.write_text(json.dumps({"messages": []}), encoding="utf-8")

    with pytest.raises(ValueError, match="chat_id"):
        load_export(p)
