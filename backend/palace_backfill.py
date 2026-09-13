"""大V 观点宫殿 —— 回补：用 lark-cli 把历史群消息翻进档案层。

从最新往回翻（--sort desc），直到越过 --since 或 has_more=false。
重复消息由 archive 层按 message_id 去重，所以重复跑是安全的。
"""

from __future__ import annotations

import json
import logging
import subprocess
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path

from backend.palace_archive import append_messages, load_ids, load_state, save_state

logger = logging.getLogger(__name__)

CST = timezone(timedelta(hours=8))
DEFAULT_PAGE_SIZE = 50


def fetch_page(chat_id: str, page_token: str | None = None,
               page_size: int = DEFAULT_PAGE_SIZE, timeout: int = 25):
    """抓一页消息。返回 (messages, next_token, has_more)。

    与 collector.fetch_messages_incremental 用同一条 lark-cli 命令，
    区别是这里拿 page_token 逐页往前翻，而不是只抓最近几页。
    """
    cmd = [
        "lark-cli", "im", "+chat-messages-list",
        "--chat-id", chat_id, "--page-size", str(page_size),
        "--sort", "desc", "--format", "json",
    ]
    if page_token:
        cmd.extend(["--page-token", page_token])

    r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if r.returncode != 0:
        raise RuntimeError(f"lark-cli 退出码 {r.returncode}: {(r.stderr or '').strip()[:200]}")

    payload = json.loads(r.stdout)
    data = payload.get("data") or {}
    return (
        data.get("messages") or [],
        data.get("page_token"),
        bool(data.get("has_more")),
    )


def _day_of(ts: str) -> str:
    """'2026-07-06 08:09' -> '2026-07-06'；空值给一个必然 >= since 的哨兵。"""
    return ts[:10] if ts else "9999-99-99"


def backfill_group(chat_id: str, group_name: str, since: str, data_dir,
                   max_pages: int = 200, page_size: int = DEFAULT_PAGE_SIZE,
                   fetch=None, sleep: float = 0.15) -> dict:
    """回补单群。返回 {"added": int, "earliest": str}。单群失败由调用方兜底。"""
    fetch = fetch or fetch_page
    known = load_ids(data_dir, chat_id)
    added = 0
    earliest = ""
    token = None
    skipped_no_id = 0
    skipped_dup = 0

    for _ in range(max_pages):
        messages, next_token, has_more = fetch(chat_id, token, page_size)
        if not messages:
            break

        fresh = [m for m in messages if _day_of(m.get("create_time", "")) >= since]
        if fresh:
            stats = {}
            added += append_messages(data_dir, chat_id, group_name, fresh,
                                     known_ids=known, stats=stats)
            skipped_no_id += stats.get("skipped_no_id", 0)
            skipped_dup += stats.get("skipped_dup", 0)

        stamps = [m.get("create_time", "") for m in messages if m.get("create_time")]
        if stamps:
            page_earliest = min(stamps)
            earliest = page_earliest if not earliest else min(earliest, page_earliest)
            if any(s[:10] < since for s in stamps):
                break

        if not has_more or not next_token:
            break
        token = next_token
        time.sleep(sleep)

    # 记断点：只在真的翻到了消息、且比上次记录的更早时才写。
    # 「一条都没翻到」不记 —— 否则下次会被当成已覆盖而跳过。
    if earliest:
        state = load_state(data_dir)
        prev = (state.get(chat_id) or {}).get("earliest_ts", "")
        if not prev or earliest < prev:
            state[chat_id] = {
                "earliest_ts": earliest,
                "updated_at": datetime.now(CST).strftime("%Y-%m-%d %H:%M"),
            }
            save_state(data_dir, state)

    if skipped_no_id:
        logger.warning(f"回补 {group_name}: {skipped_no_id} 条消息缺 "
                       f"message_id/msg_id 被丢，未进档案（上游字段可能变了）")

    return {"added": added, "earliest": earliest,
            "skipped_no_id": skipped_no_id, "skipped_dup": skipped_dup}


def resolve_groups(cfg: dict, selector: str) -> list[dict]:
    """selector 为 'all' 返回全部群，否则按 chat_id / 群名子串匹配。"""
    groups = cfg.get("groups") or []
    if selector == "all":
        return list(groups)
    return [g for g in groups if selector in g.get("chat_id", "") or selector in g.get("name", "")]


def run_backfill(cfg: dict, selector: str, since: str, data_dir,
                 max_pages: int = 200, force: bool = False) -> dict:
    """按群回补。返回 {群名: {...}} 汇总。

    已覆盖到 since 或更早的群直接跳过（除非 force），避免重跑时从头翻。
    断点状态由 backfill_group 负责落盘，这里只负责读它做跳过判断。
    """
    data_dir = Path(data_dir)
    state = load_state(data_dir)
    summary = {}

    for g in resolve_groups(cfg, selector):
        chat_id, name = g["chat_id"], g["name"]
        done_to = (state.get(chat_id) or {}).get("earliest_ts", "")[:10]
        if not force and done_to and done_to <= since:
            summary[name] = {"skipped": True, "earliest": done_to}
            logger.info(f"跳过 {name}：已回补到 {done_to}")
            continue
        try:
            # 断点由 backfill_group 自己写（见上），这里不再重复落盘。
            result = backfill_group(chat_id, name, since, data_dir, max_pages=max_pages)
            summary[name] = {"skipped": False, **result}
        except Exception as e:
            logger.warning(f"回补失败 {name}: {e}")
            summary[name] = {"error": str(e)}

    return summary
