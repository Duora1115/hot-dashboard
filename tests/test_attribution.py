"""归因污染修复的单元测试（就近归因 / 关键词清理）"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from backend import collector


def test_settings_attribution_block():
    cfg = collector.load_config()
    assert cfg["attribution"]["window_chars"] == 30
    assert "农业" in cfg["attribution"]["ignore_link_texts"]


def test_settings_high_risk_keywords_cleaned():
    cfg = collector.load_config()
    bank = cfg["sectors"]["银行"]
    assert "红利" not in bank
    assert "高股息" not in bank
    assert "不良" not in bank
    # 移出的词被新板块承接
    assert "红利" in cfg["sectors"]["高股息"]
    assert "高股息" in cfg["sectors"]["高股息"]
    # 其余高危词
    assert "华为" not in cfg["sectors"]["AI算力"]
    assert "推理" not in cfg["sectors"]["AI算力"]
    assert "训练" not in cfg["sectors"]["AI算力"]
    assert "牛市" not in cfg["sectors"]["券商"]


from backend.collector import attribute_message


def _link(name, code):
    market = "1" if code.startswith("6") else "0"
    return f"[{name}](https://wap.eastmoney.com/quote/stock/{market}.{code}.html)"


def test_proximity_attributes_to_nearby_stock_only():
    cfg = {"sectors": {"光模块": ["光模块"]}, "sentiments": {}, "actions": {}}
    text = (
        _link("中际旭创", "300308") + "光模块需求旺盛。"
        + "今天大盘震荡。" * 5
        + _link("海康威视", "002415") + "经营正常。"
    )
    by_code = attribute_message(text, cfg)
    assert by_code["300308"]["sectors"] == ["光模块"]
    assert by_code["002415"]["sectors"] == []


def test_window_char_limit_within_one_sentence():
    cfg = {"sectors": {"光模块": ["光模块"]}, "sentiments": {}, "actions": {}}
    near = _link("中际旭创", "300308") + "光模块"
    far = _link("中际旭创", "300308") + "啊" * 50 + "光模块"
    assert attribute_message(near, cfg)["300308"]["sectors"] == ["光模块"]
    assert attribute_message(far, cfg)["300308"]["sectors"] == []


def test_long_url_does_not_inflate_distance():
    cfg = {"sectors": {"光模块": ["光模块"]}, "sentiments": {}, "actions": {}}
    text = "光模块景气 " + _link("中际旭创", "300308")
    assert attribute_message(text, cfg)["300308"]["sectors"] == ["光模块"]


def test_ignore_link_texts_drops_mention():
    cfg = {"sectors": {"农业": ["农业"]}, "sentiments": {}, "actions": {},
           "attribution": {"ignore_link_texts": ["农业"]}}
    text = _link("农业", "601288") + "厄尔尼诺鱼粉中水"
    assert "601288" not in attribute_message(text, cfg)


def test_multiple_stocks_no_cross_contamination():
    cfg = {"sectors": {"光模块": ["光模块"], "银行": ["银行"]},
           "sentiments": {}, "actions": {}}
    text = _link("中际旭创", "300308") + "光模块。" + _link("农业银行", "601288") + "银行板块走弱。"
    by_code = attribute_message(text, cfg)
    assert by_code["300308"]["sectors"] == ["光模块"]
    assert by_code["601288"]["sectors"] == ["银行"]


def test_bare_code_is_a_mention():
    cfg = {"sectors": {"光模块": ["光模块"]}, "sentiments": {}, "actions": {}}
    by_code = attribute_message("300308 光模块景气度回升", cfg)
    assert by_code["300308"]["sectors"] == ["光模块"]


def test_longest_match_wins_over_substring():
    cfg = {"sectors": {"消费": ["消费"], "消费电子": ["消费电子"]},
           "sentiments": {}, "actions": {}}
    text = _link("立讯精密", "002475") + "消费电子回暖"
    assert attribute_message(text, cfg)["002475"]["sectors"] == ["消费电子"]


def test_ascii_keyword_has_word_boundary():
    cfg = {"sectors": {"AI算力": ["AI"]}, "sentiments": {}, "actions": {}}
    assert attribute_message(_link("中际旭创", "300308") + "he said it", cfg)["300308"]["sectors"] == []
    assert attribute_message(_link("中际旭创", "300308") + "AI 算力景气", cfg)["300308"]["sectors"] == ["AI算力"]


def test_bull_bear_attributed_per_code():
    cfg = {"sectors": {}, "sentiments": {"看多": ["看好"], "看空": ["看空"]}, "actions": {}}
    text = _link("中际旭创", "300308") + "看好。" + _link("海康威视", "002415") + "看空。"
    by_code = attribute_message(text, cfg)
    assert by_code["300308"]["bull"] is True and by_code["300308"]["bear"] is False
    assert by_code["002415"]["bear"] is True and by_code["002415"]["bull"] is False


def test_b2_regression_hikvision_not_bank():
    """海康威视 + 红利，不应因旧词库被打上银行。"""
    cfg = {"sectors": {"银行": ["银行", "息差"], "高股息": ["高股息", "红利"]},
           "sentiments": {}, "actions": {}}
    text = _link("海康威视", "002415") + "白马红利股"
    assert "银行" not in attribute_message(text, cfg)["002415"]["sectors"]


def test_analyze_text_exposes_by_code():
    cfg = {"sectors": {"光模块": ["光模块"]}, "sentiments": {"看多": ["看好"]}, "actions": {}}
    text = _link("中际旭创", "300308") + "光模块看好。" + _link("海康威视", "002415") + "正常。"
    r = collector.analyze_text(text, cfg)
    assert r["by_code"]["300308"]["sectors"] == ["光模块"]
    assert r["by_code"]["300308"]["bull"] is True
    assert r["by_code"]["002415"]["sectors"] == []
    assert r["by_code"]["002415"]["bull"] is False


def test_analyze_text_message_level_sectors_dedup_substring():
    cfg = {"sectors": {"消费": ["消费"], "消费电子": ["消费电子"]},
           "sentiments": {}, "actions": {}}
    r = collector.analyze_text("消费电子回暖", cfg)
    assert r["sectors"] == ["消费电子"]


def test_compute_snapshot_attributes_sectors_per_stock():
    cfg = {"sectors": {"光模块": ["光模块"], "银行": ["银行"]},
           "sentiments": {"看多": ["看好"]}, "actions": {}}
    text = (_link("中际旭创", "300308") + "光模块看好。"
            + _link("农业银行", "601288") + "银行板块。")
    msg = {"message_id": "m1", "create_time": "2026-08-08 10:47", "content": text,
           "_analysis": collector.analyze_text(text, cfg)}
    snap = collector.compute_snapshot({"群A": [msg]}, "2026-08-08 10:47", cfg)

    zj = next(s for s in snap["top10_stocks"] if s["code"] == "300308")
    ny = next(s for s in snap["top10_stocks"] if s["code"] == "601288")
    assert set(zj["sectors"]) == {"光模块"}
    assert set(ny["sectors"]) == {"银行"}
    # 消息关联板块是消息级并集，两只票相同
    assert set(zj["mention_sectors"]) == {"光模块", "银行"}
    assert set(ny["mention_sectors"]) == {"光模块", "银行"}


def test_compress_snapshot_exposes_ms():
    from backend.data_store import _compress_snapshot
    raw = {
        "time": "2026-08-08 10:00", "total_messages": 1, "active_groups": 1,
        "top10_stocks": [{
            "code": "300308", "name": "中际旭创", "score": 10,
            "mention_count": 1, "group_count": 1, "action_count": 0,
            "bull": 1, "bear": 0, "sectors": ["光模块"],
            "mention_sectors": ["光模块", "银行"],
            "first_time": "2026-08-08 10:00", "last_time": "2026-08-08 10:00",
        }],
        "top8_sectors": [],
    }
    out = _compress_snapshot(raw, {"300308": "中际旭创"})
    stk = out["stk"][0]
    assert stk["sec"] == ["光模块"]
    assert stk["ms"] == ["光模块", "银行"]


def test_compress_snapshot_ms_defaults_empty():
    from backend.data_store import _compress_snapshot
    raw = {
        "time": "2026-08-08 10:00", "total_messages": 1, "active_groups": 1,
        "top10_stocks": [{
            "code": "300308", "name": "中际旭创", "score": 10,
            "mention_count": 1, "group_count": 1, "action_count": 0,
            "bull": 1, "bear": 0, "sectors": ["光模块"],
            "first_time": "2026-08-08 10:00", "last_time": "2026-08-08 10:00",
        }],
        "top8_sectors": [],
    }
    out = _compress_snapshot(raw, {"300308": "中际旭创"})
    assert out["stk"][0]["ms"] == []


def test_recompute_day_from_cache(tmp_path):
    from scripts.recompute import recompute_day
    cfg = {
        "groups": [{"name": "群A", "chat_id": "chat_a"}],
        "sectors": {"光模块": ["光模块"]},
        "sentiments": {}, "actions": {},
        "attribution": {"window_chars": 30, "ignore_link_texts": []},
    }
    cache = {
        "chat_a": {
            "m1": {
                "message_id": "m1", "msg_type": "text",
                "create_time": "2026-08-08 10:47",
                "content": _link("中际旭创", "300308") + "光模块",
            }
        }
    }
    day = recompute_day("2026-08-08", cache, cfg, tmp_path, dry_run=True)
    assert day["total_msgs"] == 1
    assert day["snapshots"], "应生成快照"
    stk = next(s for s in day["snapshots"][-1]["top10_stocks"] if s["code"] == "300308")
    assert stk["sectors"] == ["光模块"]
    assert stk["mention_sectors"] == ["光模块"]


def test_recompute_day_writes_file(tmp_path):
    from scripts.recompute import recompute_day
    cfg = {
        "groups": [{"name": "群A", "chat_id": "chat_a"}],
        "sectors": {"光模块": ["光模块"]},
        "sentiments": {}, "actions": {},
        "attribution": {"window_chars": 30, "ignore_link_texts": []},
    }
    cache = {"chat_a": {"m1": {
        "message_id": "m1", "msg_type": "text",
        "create_time": "2026-08-08 10:47",
        "content": _link("中际旭创", "300308") + "光模块",
    }}}
    recompute_day("2026-08-08", cache, cfg, tmp_path, dry_run=False)
    assert (tmp_path / "day_2026-08-08.json").exists()


def test_ignored_link_text_drops_ghost_stock_from_snapshot():
    """Bug A：链接文字命中歧义清单的伪提及不应成为排行里的幽灵股。"""
    cfg = {"sectors": {"光模块": ["光模块"], "农业": ["农业"]},
           "sentiments": {}, "actions": {},
           "attribution": {"window_chars": 30, "ignore_link_texts": ["农业"]}}
    text = _link("农业", "601288") + "厄尔尼诺鱼粉景气。" + _link("中际旭创", "300308") + "光模块。"
    msg = {"message_id": "m1", "create_time": "2026-08-08 10:47", "content": text,
           "_analysis": collector.analyze_text(text, cfg)}
    snap = collector.compute_snapshot({"群A": [msg]}, "2026-08-08 10:47", cfg)
    codes = {s["code"] for s in snap["top10_stocks"]}
    assert "601288" not in codes, "农业链接是伪提及，不应出现在个股排行"
    assert "300308" in codes
