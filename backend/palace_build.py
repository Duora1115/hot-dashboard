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
