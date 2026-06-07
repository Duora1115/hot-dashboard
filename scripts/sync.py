#!/usr/bin/env python3
"""
云端同步脚本 - 手动推送本地数据到云端
用法:
  python3 scripts/sync.py                 # 推送 latest + 当天 day
  python3 scripts/sync.py --latest        # 仅推送 latest
  python3 scripts/sync.py --day 2026-06-05 # 仅推送指定 day
  python3 scripts/sync.py --all           # 推送所有本地 day 文件
"""

import sys
import os
import json
from pathlib import Path
from datetime import datetime, timezone, timedelta

CST = timezone(timedelta(hours=8))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import urllib.request, urllib.error
from backend.collector import load_config, push_to_cloud

def main():
    import argparse
    parser = argparse.ArgumentParser(description="推送热点数据到云端")
    parser.add_argument("--latest", action="store_true", help="仅推送 latest.json")
    parser.add_argument("--day", type=str, help="仅推送指定日期，如 2026-06-05")
    parser.add_argument("--all", action="store_true", help="推送所有本地 day 文件")
    args = parser.parse_args()

    cfg = load_config()
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    data_dir = Path(base) / cfg["server"]["data_dir"]

    # 确保 cloud 配置启用
    cfg.setdefault("cloud", {})
    cfg["cloud"]["enabled"] = True
    if "base_url" not in cfg["cloud"]:
        cfg["cloud"]["base_url"] = "http://47.253.54.6:8765"

    if args.all:
        for f in sorted(data_dir.glob("day_*.json")):
            date = f.stem.replace("day_", "")
            push_to_cloud(cfg, date, data_dir)
        return

    if args.day:
        push_to_cloud(cfg, args.day, data_dir)
        return

    if args.latest:
        date_str = datetime.now(CST).strftime("%Y-%m-%d")
        cfg["cloud"]["push_mode"] = "latest"
        push_to_cloud(cfg, date_str, data_dir)
        return

    # 默认: 推送 latest + 当天 day
    date_str = datetime.now(CST).strftime("%Y-%m-%d")
    push_to_cloud(cfg, date_str, data_dir)

if __name__ == "__main__":
    main()
