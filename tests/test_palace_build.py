"""抽取层：一条观点 = 一条消息 × 一只票"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.palace_build import extract_opinions, opinions_path, write_opinions

CFG = {
    "sectors": {"半导体": ["存储", "模组"]},
    "sentiments": {"看多": ["看多", "利好"], "看空": ["看空", "利空"]},
    "actions": {"买入信号": ["买入", "加仓"], "风险提示": ["风险", "注意"]},
    "attribution": {"window_chars": 30, "ignore_link_texts": []},
}


def _link(name, code):
    prefix = "1" if code.startswith("6") else "0"
    return f"[{name}](https://wap.eastmoney.com/quote/stock/{prefix}.{code}.html)"


def _msg(ts, text, mid="om_1"):
    return {"id": mid, "ts": ts, "group": "253_橙子不糊涂", "sender": "ou_a", "text": text}


def test_one_message_with_one_stock_yields_one_opinion():
    text = f"{_link('江波龙', '301308')} 存储模组涨价，看多，买入"
    rows = extract_opinions([_msg("2026-07-06 08:09", text)], CFG, name_map={})

    assert len(rows) == 1
    row = rows[0]
    assert row["code"] == "301308"
    assert row["name"] == "江波龙"
    assert row["bull"] is True
    assert row["actions"] == ["买入信号"]
    assert row["sectors"] == ["半导体"]
    assert row["ts"] == "2026-07-06 08:09"
    assert row["id"] == "om_1"


def test_one_message_with_two_stocks_yields_two_opinions():
    text = f"{_link('江波龙', '301308')} 看多。{_link('中际旭创', '300308')} 看空"
    rows = extract_opinions([_msg("2026-07-06 08:09", text)], CFG, name_map={})

    assert {r["code"] for r in rows} == {"301308", "300308"}
    by_code = {r["code"]: r for r in rows}
    assert by_code["301308"]["bull"] is True
    assert by_code["300308"]["bear"] is True


def test_stock_name_prefers_stock_mapping():
    text = f"{_link('江波龙', '301308')} 看多"
    rows = extract_opinions([_msg("2026-07-06 08:09", text)], CFG,
                            name_map={"301308": "江波龙(官方名)"})

    assert rows[0]["name"] == "江波龙(官方名)"


def test_message_level_sector_is_not_used_as_fallback():
    """板块走就近归因；窗口里没板块词就该是空，不能拿整条消息的板块顶上。"""
    text = f"半导体大涨。{_link('江波龙', '301308')} 看多"
    rows = extract_opinions([_msg("2026-07-06 08:09", text)], CFG, name_map={})

    assert rows[0]["sectors"] == []


def test_message_without_stock_link_yields_nothing():
    rows = extract_opinions([_msg("2026-07-06 08:09", "今天大盘不错，看多")], CFG, name_map={})

    assert rows == []


def test_empty_text_is_skipped():
    assert extract_opinions([_msg("2026-07-06 08:09", "")], CFG, name_map={}) == []


def test_write_opinions_writes_jsonl_and_is_idempotent(tmp_path):
    rows = extract_opinions(
        [_msg("2026-07-06 08:09", f"{_link('江波龙', '301308')} 看多")], CFG, name_map={})
    write_opinions(tmp_path, "oc_1", rows)
    write_opinions(tmp_path, "oc_1", rows)

    lines = opinions_path(tmp_path, "oc_1").read_text(encoding="utf-8").strip().split("\n")
    assert len(lines) == 1, "重建是覆盖写，不是追加"


# ---- 以下是 Task 4 的画像测试 ----

from backend.palace_build import build_profile


def _op(code, ts, text="", bull=False, bear=False, sectors=None):
    return {"ts": ts, "id": "om", "code": code, "name": code, "bull": bull, "bear": bear,
            "actions": [], "sectors": sectors or [], "text": text}


def test_bias_ratio_and_label():
    ops = [_op("1", "2026-07-06 10:00", bull=True)] * 8 + [_op("1", "2026-07-06 10:00", bear=True)] * 2
    prof = build_profile(ops, CFG)

    assert prof["bias"] == {"bull": 8, "bear": 2, "ratio": 0.8, "label": "偏多"}


def test_bias_without_signal_has_null_ratio():
    prof = build_profile([_op("1", "2026-07-06 10:00")], CFG)

    assert prof["bias"]["ratio"] is None
    assert prof["bias"]["label"] == "无信号"


def test_bias_lean_bear_and_neutral():
    assert build_profile([_op("1", "2026-07-06 10:00", bear=True)] * 4
                         + [_op("1", "2026-07-06 10:00", bull=True)], CFG)["bias"]["label"] == "偏空"
    assert build_profile([_op("1", "2026-07-06 10:00", bull=True)] * 2
                         + [_op("1", "2026-07-06 10:00", bear=True)] * 2, CFG)["bias"]["label"] == "中性"


def test_trading_picks_top_two_style_labels():
    ops = [_op("1", "2026-07-06 10:00", text="格局 持有 趋势 主升，低吸 回调")]
    prof = build_profile(ops, CFG)

    assert prof["trading"] == ["趋势中长线", "低吸埋伏"]


def test_trading_is_empty_when_no_keyword_hits():
    assert build_profile([_op("1", "2026-07-06 10:00", text="随便聊聊")], CFG)["trading"] == []


def test_breadth_counts_distinct_stocks_and_concentration():
    ops = [_op("301308", "2026-07-06 10:00")] * 3 + [_op("300308", "2026-07-06 10:00")]
    prof = build_profile(ops, CFG)

    assert prof["breadth"] == {"distinct_stocks": 2, "concentration": 0.75}


def test_top_sectors_dedupes_within_one_opinion():
    ops = [
        _op("1", "2026-07-06 10:00", sectors=["半导体"]),
        _op("2", "2026-07-06 10:00", sectors=["半导体", "半导体"]),
        _op("3", "2026-07-06 10:00", sectors=["军工"]),
    ]
    prof = build_profile(ops, CFG)

    assert prof["top_sectors"][0] == ["半导体", 2]


def test_session_splits_intraday_and_after_hours():
    ops = [
        _op("1", "2026-07-06 10:00"),   # 盘中
        _op("2", "2026-07-06 14:59"),   # 盘中
        _op("3", "2026-07-06 20:00"),   # 盘外
        _op("4", "2026-07-06 08:00"),   # 盘外
    ]
    prof = build_profile(ops, CFG)

    assert prof["session"] == {"intraday": 0.5, "after_hours": 0.5}


def test_ai_summary_is_always_null():
    assert build_profile([_op("1", "2026-07-06 10:00")], CFG)["ai_summary"] is None
