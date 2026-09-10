"""大V 观点宫殿 —— 档案层（追加式真相源）。

每个群一个 JSONL 文件，一行一条消息。只追加、只去重，不做过滤与改写。
归档目录是 data/ 的子目录，而 cleanup_old_files() 只 glob data_dir/day_*.json
（非递归），因此归档不受 retention_days 清理影响。
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

from backend.jsonio import dump_path, load_path

logger = logging.getLogger(__name__)

ARCHIVE_DIRNAME = "archive"
STATE_FILENAME = ".state.json"


def archive_dir(data_dir) -> Path:
    """归档目录（data/archive/）。"""
    return Path(data_dir) / ARCHIVE_DIRNAME


def archive_path(data_dir, chat_id: str) -> Path:
    """单群档案文件（data/archive/<chat_id>.jsonl）。"""
    return archive_dir(data_dir) / f"{chat_id}.jsonl"


def iter_jsonl(path: Path):
    """逐行迭代 JSONL，跳过空行与损坏行。文件不存在时什么都不 yield。"""
    path = Path(path)
    if not path.exists():
        return
    with open(path, encoding="utf-8") as f:
        for lineno, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                yield json.loads(line)
            except ValueError:
                logger.warning(f"JSONL 损坏行已跳过: {path.name}:{lineno}")


def load_ids(data_dir, chat_id: str) -> set[str]:
    """该群已归档的全部 message_id，用于去重。"""
    return {row["id"] for row in iter_jsonl(archive_path(data_dir, chat_id)) if row.get("id")}


def append_messages(data_dir, chat_id: str, group_name: str,
                    messages: list[dict], known_ids: set[str] | None = None) -> int:
    """把 lark-cli 原始消息追加进档案，返回实际写入条数。

    ``known_ids`` 传入时复用它做去重（并在写入后就地更新），避免回补翻页时
    每页都重读整个文件；不传则从磁盘读一次。

    字段映射：id ← message_id（回落 msg_id）、ts ← create_time、
    text ← content、sender ← sender.id（lark-cli 的 sender 是对象，不是字符串）。
    id 缺失或已存在的消息跳过。
    """
    path = archive_path(data_dir, chat_id)
    existing = known_ids if known_ids is not None else load_ids(data_dir, chat_id)

    rows = []
    for m in messages:
        mid = m.get("message_id") or m.get("msg_id")
        if not mid or mid in existing:
            continue
        existing.add(mid)
        rows.append({
            "id": mid,
            "ts": m.get("create_time", ""),
            "group": group_name,
            "sender": (m.get("sender") or {}).get("id", "") if isinstance(m.get("sender"), dict) else "",
            "text": m.get("content", ""),
        })

    if not rows:
        return 0
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    return len(rows)


def iter_messages(data_dir, chat_id: str):
    """逐行迭代该群档案。"""
    return iter_jsonl(archive_path(data_dir, chat_id))


def load_state(data_dir) -> dict:
    """回补断点状态：{chat_id: {"earliest_ts": ..., "updated_at": ...}}。"""
    path = archive_dir(data_dir) / STATE_FILENAME
    if not path.exists():
        return {}
    try:
        return load_path(path) or {}
    except Exception as e:
        logger.warning(f"回补状态文件读取失败，按空处理: {e}")
        return {}


def save_state(data_dir, state: dict) -> None:
    """原子写回补断点状态。"""
    dump_path(state, archive_dir(data_dir) / STATE_FILENAME, indent=True)
