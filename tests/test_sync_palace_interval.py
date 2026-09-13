"""scripts/sync.py --palace 的限频：间隔没到就不重推档案、不重建。

档案是只追加的（当前 5.4 万行 / ~12.9 MB），`push_archive` 每次全量重推并
触发云端全量重建，所以每 5 分钟一次的 cron 需要一个下限。这里覆盖：
新鲜跳过、过期照跑、0 不限频、失败不盖戳（下一轮必须重试）、坏戳不崩。
"""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import scripts.sync as sync
from backend import palace_sync


def _stamp(data_dir):
    return Path(data_dir) / sync.STAMP_NAME


def _set_stamp(data_dir, age_s):
    _stamp(data_dir).write_text(repr(time.time() - age_s), encoding="utf-8")


def _patch_config(monkeypatch, data_dir):
    """把 data_dir 指到 tmp_path（绝对路径与 base 相除仍是绝对路径）。"""
    monkeypatch.setattr(sync, "load_config",
                        lambda: {"server": {"data_dir": str(data_dir)}, "cloud": {}})


def _patch_push(monkeypatch, ok=1, rows=5, calls=None):
    calls = [] if calls is None else calls

    def fake(cfg, data_dir):
        calls.append(1)
        return {"groups": 1, "ok": ok, "rows": rows}

    monkeypatch.setattr(palace_sync, "push_archive", fake)
    return calls


# ---- 纯函数：should_skip_palace ----------------------------------------

def test_should_skip_fresh_stamp(tmp_path):
    _set_stamp(tmp_path, age_s=42)

    reason = sync.should_skip_palace(tmp_path, 1800)

    assert reason is not None
    assert "跳过" in reason and "42s" in reason and "1800s" in reason


def test_should_skip_stale_stamp(tmp_path):
    _set_stamp(tmp_path, age_s=3600)

    assert sync.should_skip_palace(tmp_path, 1800) is None


def test_should_skip_missing_stamp_means_run(tmp_path):
    assert sync.should_skip_palace(tmp_path, 1800) is None


def test_should_skip_min_interval_zero_never_skips(tmp_path):
    _set_stamp(tmp_path, age_s=0)

    assert sync.should_skip_palace(tmp_path, 0) is None


def test_should_skip_corrupt_or_empty_stamp_never_raises(tmp_path):
    # "inf" / "1e999" / "nan" 都能被 float() 解析：若当成有效时间戳，
    # now - inf = -inf 会一路走到 int() 抛 OverflowError。
    for raw in ("not-a-number", "", "   ", "\n", "{}", "12.3.4",
                "inf", "-inf", "Infinity", "1e999", "nan"):
        _stamp(tmp_path).write_text(raw, encoding="utf-8")
        assert sync.should_skip_palace(tmp_path, 1800) is None, raw
        assert sync.read_stamp(tmp_path) is None, raw


# ---- main() 端到端（push_archive 被 monkeypatch） -----------------------

def test_main_fresh_stamp_skips_push_and_leaves_stamp(tmp_path, monkeypatch, capsys):
    _set_stamp(tmp_path, age_s=42)
    before = _stamp(tmp_path).read_text(encoding="utf-8")
    _patch_config(monkeypatch, tmp_path)
    calls = _patch_push(monkeypatch)

    rc = sync.main(["--palace", "--min-interval", "1800"])

    assert rc == 0
    assert calls == [], "距离上次成功不足 1800s，不该推送"
    assert _stamp(tmp_path).read_text(encoding="utf-8") == before, "跳过的 run 不能改戳"
    assert "跳过" in capsys.readouterr().out


def test_main_stale_stamp_runs_push_and_stamps(tmp_path, monkeypatch):
    _set_stamp(tmp_path, age_s=3600)
    _patch_config(monkeypatch, tmp_path)
    calls = _patch_push(monkeypatch, ok=1)

    rc = sync.main(["--palace", "--min-interval", "1800"])

    assert rc == 0
    assert calls == [1]
    assert _stamp(tmp_path).exists()


def test_main_min_interval_zero_runs_even_with_fresh_stamp(tmp_path, monkeypatch):
    """默认值 0 = 不限频，行为与改造前一致，必须照推。"""
    _set_stamp(tmp_path, age_s=0)
    _patch_config(monkeypatch, tmp_path)
    calls = _patch_push(monkeypatch, ok=1)

    rc = sync.main(["--palace", "--min-interval", "0"])

    assert rc == 0
    assert calls == [1]


def test_main_min_interval_zero_success_writes_no_stamp(tmp_path, monkeypatch):
    """不限频的成功推送也不能盖戳，否则 legacy --palace 会凭空造出 stamp 文件。

    这是「--min-interval 0 与改造前逐字节一致」的关键：旧行为从不写 data/ 下任何东西。
    """
    _patch_config(monkeypatch, tmp_path)
    calls = _patch_push(monkeypatch, ok=1)

    rc = sync.main(["--palace", "--min-interval", "0"])

    assert rc == 0
    assert calls == [1], "0 = 不限频，成功推送照跑"
    assert not _stamp(tmp_path).exists(), "不限频的 run 不得写 stamp"


def test_main_failed_push_does_not_stamp_so_next_run_retries(tmp_path, monkeypatch):
    _patch_config(monkeypatch, tmp_path)
    _patch_push(monkeypatch, ok=0)

    assert sync.main(["--palace", "--min-interval", "1800"]) == 0
    assert not _stamp(tmp_path).exists(), "ok==0 不能盖戳，否则失败被藏一个间隔"

    # 间隔没到，但因为上次失败没盖戳，下一轮必须立刻重试并成功盖戳。
    calls = _patch_push(monkeypatch, ok=1)
    assert sync.main(["--palace", "--min-interval", "1800"]) == 0
    assert calls == [1], "上次失败后即使间隔未到也必须重试"
    assert _stamp(tmp_path).exists()


def test_main_corrupt_stamp_runs_push_without_raising(tmp_path, monkeypatch):
    _stamp(tmp_path).write_text("not-a-number", encoding="utf-8")
    _patch_config(monkeypatch, tmp_path)
    calls = _patch_push(monkeypatch, ok=1)

    rc = sync.main(["--palace", "--min-interval", "1800"])

    assert rc == 0
    assert calls == [1], "坏戳当作从未同步，必须推送"


def test_main_min_interval_ignored_by_non_palace_modes(tmp_path, monkeypatch):
    """--min-interval 只对 --palace 有意义，别的模式不能被它挡住。"""
    _set_stamp(tmp_path, age_s=0)
    _patch_config(monkeypatch, tmp_path)
    pushed = []
    monkeypatch.setattr(sync, "push_to_cloud",
                        lambda cfg, date, data_dir: pushed.append(date))

    rc = sync.main(["--latest", "--min-interval", "1800"])

    assert rc == 0
    assert pushed, "--latest 不该被 --min-interval 影响"
