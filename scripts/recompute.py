#!/usr/bin/env python3
"""按 msg_cache.json 重算历史 day 文件（新归因语义）。

用法：
  python3 scripts/recompute.py 2026-06-05            # 单日
  python3 scripts/recompute.py 2026-06-05 --dry-run  # 只统计不写盘
  python3 scripts/recompute.py --all                 # 缓存覆盖的全部日期
"""
import argparse
import os
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.collector import (
    _build_windows, analyze_text, compute_snapshot, extract_image_text, load_cache, load_config,
)
from backend.jsonio import dump_path


def build_all_analyzed(cache, cfg, date_str):
    """从 msg_cache 重建 {群名: [带新 _analysis 的当日消息]}。"""
    chat_to_group = {g["chat_id"]: g["name"] for g in cfg["groups"]}
    all_analyzed = defaultdict(list)
    for chat_id, msgs in cache.items():
        grp_name = chat_to_group.get(chat_id, chat_id)
        for m in msgs.values():
            if not m.get("create_time", "").startswith(date_str):
                continue
            text = m.get("content", "")
            if m.get("msg_type") == "image" and text and "[图片OCR]" not in text:
                ocr = extract_image_text(m)
                if ocr:
                    text = f"[图片OCR]{ocr}[/图片OCR]"
            if not text:
                continue
            all_analyzed[grp_name].append({**m, "content": text, "_analysis": analyze_text(text, cfg)})
    return dict(all_analyzed)


def recompute_day(date_str, cache, cfg, data_dir, dry_run=False):
    """重算单日。返回 day_data；dry_run 时不写盘。"""
    all_analyzed = build_all_analyzed(cache, cfg, date_str)
    total = sum(len(v) for v in all_analyzed.values())
    snapshots = [compute_snapshot(all_analyzed, w, cfg) for w in _build_windows(date_str)]
    day_data = {"date": date_str, "total_msgs": total, "snapshots": snapshots}
    if not dry_run:
        data_dir = Path(data_dir)
        data_dir.mkdir(parents=True, exist_ok=True)
        dump_path(day_data, data_dir / f"day_{date_str}.json", indent=True)
    return day_data


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("date", nargs="?", help="YYYY-MM-DD")
    parser.add_argument("--all", action="store_true", help="重算缓存覆盖的全部日期")
    parser.add_argument("--dry-run", action="store_true", help="只统计不写盘")
    args = parser.parse_args()

    cfg = load_config()
    data_dir = Path(cfg["server"]["data_dir"])
    cache = load_cache(data_dir)

    if args.all:
        dates = sorted({m.get("create_time", "")[:10]
                        for msgs in cache.values() for m in msgs.values()
                        if m.get("create_time")})
    elif args.date:
        dates = [args.date]
    else:
        parser.error("需要日期参数或 --all")
        return

    for d in dates:
        day = recompute_day(d, cache, cfg, data_dir, dry_run=args.dry_run)
        stocks = day["snapshots"][-1]["top10_stocks"] if day["snapshots"] else []
        print(f"{d} 消息{day['total_msgs']} 快照{len(day['snapshots'])} 股票{len(stocks)}"
              + ("（dry-run，未写盘）" if args.dry_run else ""))


if __name__ == "__main__":
    main()
