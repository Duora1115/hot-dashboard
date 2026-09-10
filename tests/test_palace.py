"""PalaceStore：索引常驻 + 单群观点 LRU 懒加载"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.palace import PalaceStore
from backend.palace_build import (
    build_profile, kols_index_path, stock_index_path, write_opinions,
)


def _opinion(code, ts, bull=False, bear=False, name="江波龙"):
    return {"ts": ts, "id": f"om_{ts}", "code": code, "name": name, "bull": bull,
            "bear": bear, "actions": ["买入信号"] if bull else [], "sectors": ["半导体"],
            "text": f"{name} 的观点"}


def _make_store(tmp_path, groups):
    """groups = {chat_id: {"name":.., "opinions":[...]}}"""
    kols = {}
    for chat_id, g in groups.items():
        write_opinions(tmp_path, chat_id, g["opinions"])
        kols[chat_id] = {
            "chat_id": chat_id, "name": g["name"],
            "msg_count": 10, "opinion_count": len(g["opinions"]),
            "active_days": 2, "stock_count": len({o["code"] for o in g["opinions"]}),
            "first_ts": "2026-07-06 08:09", "last_ts": "2026-07-09 08:09",
            "style": build_profile(g["opinions"], {}),
        }
    kols_index_path(tmp_path).parent.mkdir(parents=True, exist_ok=True)
    kols_index_path(tmp_path).write_text(json.dumps({
        "generated_at": "2026-09-11T10:00:00+08:00",
        "coverage": {"from": "2026-07-06", "to": "2026-07-09", "groups": len(groups),
                     "missing_days": ["2026-07-07"]},
        "kols": kols,
    }, ensure_ascii=False), encoding="utf-8")
    return tmp_path


def test_startup_without_index_is_not_ready(tmp_path):
    store = PalaceStore(tmp_path)
    store.startup()

    assert store.is_ready() is False
    assert store.list_kols() == []
    assert store.get_meta()["coverage"] == {}


def test_startup_loads_index(tmp_path):
    _make_store(tmp_path, {"oc_1": {"name": "253_橙子不糊涂",
                                    "opinions": [_opinion("301308", "2026-07-06 08:09", bull=True)]}})
    store = PalaceStore(tmp_path)
    store.startup()

    assert store.is_ready() is True
    assert [k["name"] for k in store.list_kols()] == ["253_橙子不糊涂"]
    assert store.get_meta()["coverage"]["missing_days"] == ["2026-07-07"]


def test_get_kol_aggregates_stocks_with_recent_three(tmp_path):
    ops = [_opinion("301308", f"2026-07-0{i} 08:09", bull=True) for i in range(1, 6)]
    ops.append(_opinion("300308", "2026-07-09 08:09", bear=True, name="中际旭创"))
    _make_store(tmp_path, {"oc_1": {"name": "群", "opinions": ops}})
    store = PalaceStore(tmp_path)
    store.startup()

    kol = store.get_kol("oc_1")
    assert [s["code"] for s in kol["stocks"]] == ["301308", "300308"]
    top = kol["stocks"][0]
    assert top["count"] == 5
    assert top["bull"] == 5
    assert top["first_ts"] == "2026-07-01 08:09"
    assert top["last_ts"] == "2026-07-05 08:09"
    assert len(top["recent"]) == 3
    assert top["recent"][0]["ts"] == "2026-07-05 08:09", "recent 必须时间倒序"


def test_get_kol_returns_none_for_unknown(tmp_path):
    _make_store(tmp_path, {"oc_1": {"name": "群", "opinions": []}})
    store = PalaceStore(tmp_path)
    store.startup()

    assert store.get_kol("oc_nope") is None


def test_get_kol_stock_returns_reverse_chronological_timeline(tmp_path):
    ops = [_opinion("301308", "2026-07-01 08:09"), _opinion("301308", "2026-07-05 08:09"),
           _opinion("300308", "2026-07-06 08:09")]
    _make_store(tmp_path, {"oc_1": {"name": "群", "opinions": ops}})
    store = PalaceStore(tmp_path)
    store.startup()

    tl = store.get_kol_stock("oc_1", "301308")
    assert [o["ts"] for o in tl] == ["2026-07-05 08:09", "2026-07-01 08:09"]
    assert store.get_kol_stock("oc_nope", "301308") is None


def test_get_stock_kols_sorts_groups_by_count(tmp_path):
    _make_store(tmp_path, {
        "oc_1": {"name": "群A", "opinions": [_opinion("301308", "2026-07-01 08:09")] * 3},
        "oc_2": {"name": "群B", "opinions": [_opinion("301308", "2026-07-02 08:09")]},
    })
    stock_index_path(tmp_path).write_text(json.dumps({
        "301308": {"name": "江波龙", "group_count": 2, "total_mentions": 4,
                   "first_ts": "2026-07-01 08:09", "last_ts": "2026-07-02 08:09",
                   "groups": {
                       "oc_1": {"name": "群A", "count": 3, "bull": 3, "bear": 0,
                                "actions": ["买入信号"], "last_ts": "2026-07-01 08:09"},
                       "oc_2": {"name": "群B", "count": 1, "bull": 1, "bear": 0,
                                "actions": [], "last_ts": "2026-07-02 08:09"},
                   }},
    }, ensure_ascii=False), encoding="utf-8")
    store = PalaceStore(tmp_path)
    store.startup()

    entry = store.get_stock_kols("301308")
    assert entry["total_mentions"] == 4
    assert [g["chat_id"] for g in entry["groups"]] == ["oc_1", "oc_2"]
    assert store.get_stock_kols("999999") is None


def test_opinions_lru_evicts_oldest_group(tmp_path):
    _make_store(tmp_path, {
        "oc_1": {"name": "群A", "opinions": [_opinion("301308", "2026-07-01 08:09")]},
        "oc_2": {"name": "群B", "opinions": [_opinion("300308", "2026-07-01 08:09")]},
    })
    store = PalaceStore(tmp_path, lru_groups=1)
    store.startup()

    store._load_opinions("oc_1")
    store._load_opinions("oc_2")

    assert len(store._opinions) == 1
    assert "oc_1" not in store._opinions, "超出 LRU 上限应淘汰最久未用的群"
