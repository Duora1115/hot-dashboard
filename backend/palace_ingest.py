"""大V 观点宫殿 —— 离线导出导入层。

把云端导出的群聊 JSON（每群一个文件，含 chat_id / messages）灌进档案层。
与 palace_backfill 的分工：回补走 lark-cli 在线翻页（仅云端可用），本模块吃
离线导出文件，用于冷启动与本地复现。

导出文件的消息结构与 lark-cli 一致（message_id / create_time / content /
sender.id），正是 append_messages 已做的字段映射，因此不做二次转换。
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

from backend.palace_archive import append_messages

logger = logging.getLogger(__name__)


def load_export(path) -> dict:
    """读一个导出文件；结构不完整或不可解析时抛 ValueError。"""
    path = Path(path)
    try:
        doc = json.loads(path.read_text(encoding="utf-8"))
    except OSError as e:
        raise ValueError(f"{path.name} 读取失败: {e}") from e
    except ValueError as e:
        raise ValueError(f"{path.name} 不是合法 JSON: {e}") from e
    if not isinstance(doc, dict):
        raise ValueError(f"{path.name} 顶层不是对象")
    if not doc.get("chat_id"):
        raise ValueError(f"{path.name} 缺 chat_id")
    if not isinstance(doc.get("messages"), list):
        raise ValueError(f"{path.name} 缺 messages 数组")
    return doc


def ingest_dir(src, data_dir, chat_to_name: dict[str, str] | None = None) -> dict:
    """把 src 目录下的导出文件灌进 ``data_dir/archive/``，返回逐群统计。

    ``chat_to_name`` 传入时只导入登记过的群——配置外的群记入 ``skipped`` 并
    告警，以免把第 26 个群带进索引。不传则全都导入（按 chat_id 命名）。

    幂等：``append_messages`` 按 message_id 去重，重复跑只补新增消息。
    """
    src = Path(src)
    groups: dict[str, dict] = {}
    skipped: list[dict] = []

    for path in sorted(src.glob("*.json")):
        try:
            doc = load_export(path)
        except ValueError as e:
            skipped.append({"file": path.name, "reason": str(e)})
            logger.warning(f"导出文件已跳过：{e}")
            continue

        chat_id = doc["chat_id"]
        if chat_to_name is not None and chat_id not in chat_to_name:
            skipped.append({"file": path.name, "reason": f"配置外的群 {chat_id}"})
            logger.warning(f"配置外的群已跳过（只做 settings.yaml 里的群）: "
                           f"{chat_id} ({path.name})")
            continue

        messages = doc["messages"]
        if doc.get("message_count") not in (None, len(messages)):
            logger.warning(f"{path.name}: message_count={doc['message_count']} "
                           f"与实际 {len(messages)} 条不符，按实际条数处理")
        if (doc.get("pagination") or {}).get("complete") is False:
            logger.warning(f"{path.name}: 导出未翻完（pagination.complete=False），"
                           f"该群历史可能不全")

        name = (chat_to_name or {}).get(chat_id) or doc.get("group_slug") \
            or doc.get("chat_name") or chat_id
        stats = {}
        added = append_messages(data_dir, chat_id, name, messages, stats=stats)
        if stats.get("skipped_no_id", 0) > 0:
            logger.warning(f"{path.name}: {stats['skipped_no_id']} 条消息缺 "
                           f"message_id/msg_id 被丢，未进档案（上游字段可能变了）")

        prev = groups.get(chat_id)
        if prev:
            prev["added"] += added
            prev["messages"] += len(messages)
            prev["skipped_no_id"] += stats.get("skipped_no_id", 0)
            prev["skipped_dup"] += stats.get("skipped_dup", 0)
            prev["files"].append(path.name)
        else:
            groups[chat_id] = {
                "name": name,
                "added": added,
                "messages": len(messages),
                "skipped_no_id": stats.get("skipped_no_id", 0),
                "skipped_dup": stats.get("skipped_dup", 0),
                "files": [path.name],
            }

    return {"groups": groups, "skipped": skipped}
