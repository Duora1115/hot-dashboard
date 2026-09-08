"""校验 src/data/ai_chain.json 的结构、引用完整性与名称一致性。"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHAIN = ROOT / "src" / "data" / "ai_chain.json"
MAPPING = ROOT / "backend" / "stock_mapping.json"

VALID_TIERS = {"直接铲子", "间接铲子", "铲子的铲子"}
# stock_mapping.json 的名称带 XD/DR/XR/N/*ST 前缀且被截断，比对前先剥前缀
_PREFIX = re.compile(r"^(?:XD|XR|DR|N|\*?ST)")


def _load_chain():
    with open(CHAIN, encoding="utf-8") as f:
        return json.load(f)


def _load_mapping():
    with open(MAPPING, encoding="utf-8") as f:
        return json.load(f)


def _norm(name: str) -> str:
    return _PREFIX.sub("", name)


def test_segments_well_formed():
    data = _load_chain()
    ids = [s["id"] for s in data["segments"]]
    assert ids, "segments 不能为空"
    assert len(ids) == len(set(ids)), f"环节 id 重复: {ids}"
    for seg in data["segments"]:
        assert seg["name"], f"{seg['id']} 缺 name"
        assert seg["tier"] in VALID_TIERS, f"{seg['id']} tier 非法: {seg['tier']}"
        for ref in seg["upstream"] + seg["downstream"]:
            assert ref in ids, f"{seg['id']} 引用了未定义环节 {ref}"
            assert ref != seg["id"], f"{seg['id']} 不能以自己为上下游"


def test_stocks_well_formed():
    data = _load_chain()
    mapping = _load_mapping()
    seg_ids = {s["id"] for s in data["segments"]}

    codes = [s["code"] for s in data["stocks"]]
    assert codes, "stocks 不能为空"
    assert len(codes) == len(set(codes)), "股票代码重复"

    for stk in data["stocks"]:
        assert stk["segment"] in seg_ids, f"{stk['name']} 的环节 {stk['segment']} 未定义"
        assert stk["code"] in mapping, f"{stk['name']} ({stk['code']}) 不在 stock_mapping.json"
        assert isinstance(stk["ecosystems"], list), f"{stk['name']} ecosystems 必须是数组"
        assert stk["role"].strip(), f"{stk['name']} 缺 role"
        if "tier" in stk:
            assert stk["tier"] in VALID_TIERS, f"{stk['name']} tier 非法: {stk['tier']}"

        mapped = _norm(mapping[stk["code"]])
        assert stk["name"].startswith(mapped) or mapped.startswith(stk["name"]), (
            f"{stk['code']} 名称与 mapping 不符: json={stk['name']!r} mapping={mapping[stk['code']]!r}"
        )
