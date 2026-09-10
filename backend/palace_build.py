"""大V 观点宫殿 —— 写路径：抽取观点 → 统计画像 → 生成索引。

全部是派生数据，可幂等重建：删掉 data/palace/ 重跑结果一致。
档案层（data/archive/）是唯一真相源。
"""

from __future__ import annotations

import json
import logging
import os
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from backend.collector import LINK_RE, analyze_text, load_stock_mapping
from backend.jsonio import dump_path
from backend.palace_archive import archive_dir, iter_jsonl, iter_messages

logger = logging.getLogger(__name__)

CST = timezone(timedelta(hours=8))
PALACE_DIRNAME = "palace"


def opinions_path(data_dir, chat_id: str) -> Path:
    """单群观点文件（data/palace/opinions/<chat_id>.jsonl）。"""
    return Path(data_dir) / PALACE_DIRNAME / "opinions" / f"{chat_id}.jsonl"


def _link_names(text: str) -> dict[str, str]:
    """{code: 链接文字}。整条消息的股票名映射，比 analyze_text 的单个 name 更全。"""
    return {m.group(2): m.group(1) for m in LINK_RE.finditer(text)}


def extract_opinions(messages, cfg, name_map=None) -> list[dict]:
    """把档案消息转成观点行：一条「观点」= 一条消息 × 它提及的一只票。

    只取 by_code（就近归因）的结果——不做消息级板块回落，否则会把整条消息的
    题材误挂到窗口外的票上。没有股票链接/没有提及的消息自然产出 0 行。
    """
    if name_map is None:
        name_map = load_stock_mapping()

    rows = []
    for m in messages:
        text = m.get("text", "")
        if not text:
            continue
        analysis = analyze_text(text, cfg)
        by_code = analysis.get("by_code") or {}
        if not by_code:
            continue
        links = _link_names(text)
        for code, entry in by_code.items():
            rows.append({
                "ts": m.get("ts", ""),
                "id": m.get("id", ""),
                "code": code,
                "name": name_map.get(code) or links.get(code) or "",
                "bull": bool(entry.get("bull")),
                "bear": bool(entry.get("bear")),
                "actions": list(entry.get("actions") or []),
                "sectors": list(entry.get("sectors") or []),
                "text": text,
            })
    return rows


def write_opinions(data_dir, chat_id: str, opinions: list[dict]) -> Path:
    """覆盖写单群观点文件（先写 .tmp 再 os.replace，避免半截文件）。"""
    path = opinions_path(data_dir, chat_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".jsonl.tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        for row in opinions:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
    os.replace(tmp, path)
    return path


def iter_opinions(data_dir, chat_id: str):
    """逐行迭代单群观点文件。"""
    return iter_jsonl(opinions_path(data_dir, chat_id))


# ---- 风格画像（纯规则，spec §7）----

DEFAULT_TRADING_STYLES: dict[str, list[str]] = {
    "打板短线": ["涨停", "打板", "一字", "封板", "竞价", "接力", "首板"],
    "低吸埋伏": ["低吸", "回调", "分批", "埋伏", "左侧", "补仓"],
    "趋势中长线": ["格局", "持有", "趋势", "主升", "中线", "基本面"],
}


def _profile_cfg(cfg) -> dict:
    return ((cfg or {}).get("palace") or {}).get("profile") or {}


def _bias(opinions: list[dict]) -> dict:
    bull = sum(1 for o in opinions if o.get("bull"))
    bear = sum(1 for o in opinions if o.get("bear"))
    total = bull + bear
    if total == 0:
        return {"bull": 0, "bear": 0, "ratio": None, "label": "无信号"}
    ratio = round(bull / total, 2)
    label = "偏多" if ratio >= 0.65 else "偏空" if ratio <= 0.35 else "中性"
    return {"bull": bull, "bear": bear, "ratio": ratio, "label": label}


def _trading(opinions: list[dict], styles: dict[str, list[str]]) -> list[str]:
    body = "\n".join(o.get("text", "") for o in opinions)
    scored = [
        (sum(body.count(w) for w in words), label)
        for label, words in styles.items()
    ]
    hits = [(s, label) for s, label in scored if s > 0]
    hits.sort(key=lambda x: (-x[0], x[1]))
    return [label for _, label in hits[:2]]


def _breadth(opinions: list[dict]) -> dict:
    counts = Counter(o.get("code", "") for o in opinions if o.get("code"))
    total = sum(counts.values())
    if total == 0:
        return {"distinct_stocks": 0, "concentration": 0.0}
    return {
        "distinct_stocks": len(counts),
        "concentration": round(counts.most_common(1)[0][1] / total, 2),
    }


def _top_sectors(opinions: list[dict], top_n: int) -> list[list]:
    counts: Counter = Counter()
    for o in opinions:
        counts.update(set(o.get("sectors") or []))  # 同一条观点内去重，按条数计
    return [[name, n] for name, n in counts.most_common(top_n)]


def _session(opinions: list[dict], start: str, end: str) -> dict:
    if not opinions:
        return {"intraday": 0.0, "after_hours": 0.0}
    inside = sum(1 for o in opinions if start <= (o.get("ts") or "")[11:16] <= end)
    ratio = round(inside / len(opinions), 2)
    return {"intraday": ratio, "after_hours": round(1 - ratio, 2)}


def build_profile(opinions: list[dict], cfg) -> dict:
    """从该群全部观点统计 6 个维度。纯规则、可解释、零依赖。"""
    prof = _profile_cfg(cfg)
    return {
        "bias": _bias(opinions),
        "trading": _trading(opinions, prof.get("trading_styles") or DEFAULT_TRADING_STYLES),
        "breadth": _breadth(opinions),
        "top_sectors": _top_sectors(opinions, prof.get("top_sectors_n", 5)),
        "session": _session(
            opinions,
            prof.get("intraday_start", "09:30"),
            prof.get("intraday_end", "15:00"),
        ),
        "ai_summary": None,
    }


# ---- 索引层（spec §4.3）----

def kols_index_path(data_dir) -> Path:
    return Path(data_dir) / PALACE_DIRNAME / "kols.json"


def stock_index_path(data_dir) -> Path:
    return Path(data_dir) / PALACE_DIRNAME / "stock_index.json"


def build_kol_entry(chat_id: str, group_name: str, messages: list[dict],
                    opinions: list[dict], profile: dict) -> dict:
    """单个大V的画像条目（写进 kols.json 的 kols[chat_id]）。"""
    stamps = sorted(m.get("ts", "") for m in messages if m.get("ts"))
    return {
        "chat_id": chat_id,
        "name": group_name,
        "msg_count": len(messages),
        "opinion_count": len(opinions),
        "active_days": len({m.get("ts", "")[:10] for m in messages if m.get("ts")}),
        "stock_count": len({o.get("code", "") for o in opinions if o.get("code")}),
        "first_ts": stamps[0] if stamps else "",
        "last_ts": stamps[-1] if stamps else "",
        "style": profile,
    }


def build_stock_index(groups: dict) -> dict:
    """每票跨群汇总（不含正文）。groups = {chat_id: {"name":..,"opinions":[...]}}。"""
    index: dict = {}
    for chat_id, g in groups.items():
        group_name = g.get("name", chat_id)
        for o in g.get("opinions") or []:
            code = o.get("code", "")
            if not code:
                continue
            ts = o.get("ts", "")
            entry = index.setdefault(code, {
                "name": o.get("name", ""),
                "group_count": 0, "total_mentions": 0,
                "first_ts": "", "last_ts": "", "groups": {},
            })
            if not entry["name"] and o.get("name"):
                entry["name"] = o["name"]
            entry["total_mentions"] += 1
            if ts:
                if not entry["first_ts"] or ts < entry["first_ts"]:
                    entry["first_ts"] = ts
                if ts > entry["last_ts"]:
                    entry["last_ts"] = ts

            ge = entry["groups"].setdefault(chat_id, {
                "name": group_name, "count": 0, "bull": 0, "bear": 0,
                "actions": [], "last_ts": "",
            })
            ge["count"] += 1
            ge["bull"] += 1 if o.get("bull") else 0
            ge["bear"] += 1 if o.get("bear") else 0
            for a in o.get("actions") or []:
                if a not in ge["actions"]:
                    ge["actions"].append(a)
            if ts and ts > ge["last_ts"]:
                ge["last_ts"] = ts

    for entry in index.values():
        entry["group_count"] = len(entry["groups"])
    return index


def build_coverage(groups: dict) -> dict:
    """覆盖范围 + 区间内「全部群消息数为 0」的工作日。groups = {chat_id: {"messages":[...]}}。"""
    all_ts = [m.get("ts", "") for g in groups.values() for m in g.get("messages") or []]
    days = {ts[:10] for ts in all_ts if ts}
    if not days:
        return {"from": "", "to": "", "groups": len(groups), "missing_days": []}

    lo, hi = min(days), max(days)
    missing = []
    cursor = date.fromisoformat(lo)
    end = date.fromisoformat(hi)
    while cursor <= end:
        iso = cursor.isoformat()
        if cursor.weekday() < 5 and iso not in days:
            missing.append(iso)
        cursor += timedelta(days=1)
    return {"from": lo, "to": hi, "groups": len(groups), "missing_days": missing}


def build_all(data_dir, cfg) -> dict:
    """全量重建：归档 → opinions/ → kols.json + stock_index.json。

    幂等：重复跑结果一致。data/palace/ 整个删掉重跑也能恢复。
    """
    data_dir = Path(data_dir)
    chat_to_name = {g["chat_id"]: g["name"] for g in (cfg.get("groups") or [])}
    name_map = load_stock_mapping()

    groups: dict = {}
    for path in sorted(archive_dir(data_dir).glob("*.jsonl")):
        chat_id = path.stem
        group_name = chat_to_name.get(chat_id, chat_id)
        messages = list(iter_messages(data_dir, chat_id))
        opinions = extract_opinions(messages, cfg, name_map)
        write_opinions(data_dir, chat_id, opinions)
        groups[chat_id] = {"name": group_name, "messages": messages, "opinions": opinions}
        logger.info(f"{group_name}: 消息 {len(messages)}，观点 {len(opinions)}")

    kols = {
        chat_id: build_kol_entry(chat_id, g["name"], g["messages"], g["opinions"],
                                 build_profile(g["opinions"], cfg))
        for chat_id, g in groups.items()
    }
    coverage = build_coverage(groups)
    generated_at = datetime.now(CST).isoformat(timespec="seconds")

    doc = {"generated_at": generated_at, "coverage": coverage, "kols": kols}
    dump_path(doc, kols_index_path(data_dir), indent=True)
    dump_path(build_stock_index(groups), stock_index_path(data_dir), indent=True)

    logger.info(f"✅ palace 索引完成: {len(kols)} 群, "
                f"{sum(k['opinion_count'] for k in kols.values())} 观点, "
                f"缺 {len(coverage['missing_days'])} 个交易日")
    return doc
