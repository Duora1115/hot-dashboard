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
