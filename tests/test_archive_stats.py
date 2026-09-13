"""archive_stats：一条命令判断档案层是否还活着。"""
import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.collector import CST
from scripts.archive_stats import main, summarize


def _write(data_dir, chat_id, rows):
    p = Path(data_dir) / "archive" / f"{chat_id}.jsonl"
    p.parent.mkdir(parents=True, exist_ok=True)
    with open(p, "a", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")


def test_summarize_missing_dir_is_reported_not_crashing(tmp_path, capsys):
    info = summarize(tmp_path)

    assert info["exists"] is False
    assert info["group_count"] == 0
    assert info["total_rows"] == 0
    assert info["newest_ts"] is None

    assert main(["--data-dir", str(tmp_path)]) == 0
    out = capsys.readouterr().out
    assert "不存在" in out


def test_summarize_counts_rows_and_newest_across_groups(tmp_path):
    _write(tmp_path, "oc_1", [{"id": "a", "ts": "2026-09-11 08:09", "text": "x"}])
    _write(tmp_path, "oc_2", [{"id": "b", "ts": "2026-09-13 10:00", "text": "y"},
                              {"id": "c", "ts": "坏时间戳", "text": "z"}])

    info = summarize(tmp_path)

    assert info["exists"] is True
    assert info["group_count"] == 2
    assert info["total_rows"] == 3
    assert info["newest_ts"] == "2026-09-13 10:00"
    by_chat = {g["chat_id"]: g for g in info["groups"]}
    assert by_chat["oc_1"]["rows"] == 1
    assert by_chat["oc_1"]["newest_ts"] == "2026-09-11 08:09"
    assert by_chat["oc_2"]["rows"] == 2
    assert by_chat["oc_2"]["newest_ts"] == "2026-09-13 10:00"


def test_summarize_survives_non_dict_json_line(tmp_path):
    """合法 JSON 但不是对象（如 [1,2,3]）不能让体检脚本崩。"""
    p = tmp_path / "archive" / "oc_1.jsonl"
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text('[1,2,3]\n{"id":"a","ts":"2026-09-13 10:00","text":"x"}\n',
                 encoding="utf-8")

    info = summarize(tmp_path)

    assert info["total_rows"] == 2
    assert info["newest_ts"] == "2026-09-13 10:00"


def test_main_max_age_hours_exit_codes(tmp_path):
    old = (datetime.now(CST).replace(tzinfo=None) - timedelta(hours=5)).strftime("%Y-%m-%d %H:%M")
    _write(tmp_path, "oc_1", [{"id": "a", "ts": old, "text": "x"}])

    assert main(["--data-dir", str(tmp_path), "--max-age-hours", "1"]) != 0, "过期应非零退出"
    assert main(["--data-dir", str(tmp_path), "--max-age-hours", "10"]) == 0, "新鲜应零退出"


def test_main_max_age_hours_missing_dir_is_nonzero(tmp_path):
    assert main(["--data-dir", str(tmp_path), "--max-age-hours", "1"]) != 0, "没有档案也算不健康"
