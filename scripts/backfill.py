#!/usr/bin/env python3
"""回补历史群消息到档案层（data/archive/）。

用法：
  python3 scripts/backfill.py --group all --since 2026-06-01
  python3 scripts/backfill.py --group 253 --since 2026-06-01
  python3 scripts/backfill.py --group 253 --since 2026-06-01 --force

注意：lark-cli 只在云端机器可用，本命令需在云端项目根目录执行。
"""
import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.collector import load_config
from backend.palace_backfill import run_backfill


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--group", default="all", help="all 或群名/chat_id 子串")
    parser.add_argument("--since", required=True, help="YYYY-MM-DD，翻到这个日期为止")
    parser.add_argument("--max-pages", type=int, default=200, help="单群最多翻多少页")
    parser.add_argument("--force", action="store_true", help="忽略断点，重新翻")
    args = parser.parse_args()

    cfg = load_config()
    data_dir = Path(cfg["server"]["data_dir"])

    summary = run_backfill(cfg, args.group, args.since, data_dir,
                           max_pages=args.max_pages, force=args.force)

    ok = sum(1 for v in summary.values() if not v.get("error") and not v.get("skipped"))
    failed = [k for k, v in summary.items() if v.get("error")]
    skipped = [k for k, v in summary.items() if v.get("skipped")]
    added = sum(v.get("added", 0) for v in summary.values())

    print(f"回补完成：{ok} 群成功，新增 {added} 条消息，跳过 {len(skipped)} 群")
    for name, v in summary.items():
        if v.get("error"):
            print(f"  ✗ {name}: {v['error']}")
        elif v.get("skipped"):
            print(f"  - {name}: 已覆盖到 {v['earliest']}")
        else:
            print(f"  ✓ {name}: 新增 {v['added']}，最早 {v['earliest'] or '—'}")

    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
