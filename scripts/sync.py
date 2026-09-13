#!/usr/bin/env python3
"""
云端同步脚本 - 手动推送本地数据到云端
用法:
  python3 scripts/sync.py                 # 推送 latest + 当天 day
  python3 scripts/sync.py --latest        # 仅推送 latest
  python3 scripts/sync.py --day 2026-06-05 # 仅推送指定 day
  python3 scripts/sync.py --all           # 推送所有本地 day 文件
  python3 scripts/sync.py --palace        # 推送观点宫殿档案层并触发云端重建
  python3 scripts/sync.py --palace --min-interval 1800  # 距上次成功不足 30 分钟则跳过
"""

import sys
import os
import json
import time
from pathlib import Path
from datetime import datetime, timezone, timedelta

CST = timezone(timedelta(hours=8))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import urllib.request, urllib.error
from backend.collector import load_config, push_to_cloud

# 上次「成功」推送档案的时间戳（epoch 秒）。放在 data/ 里随数据一起走。
STAMP_NAME = ".palace_sync_stamp"


def stamp_path(data_dir) -> Path:
    return Path(data_dir) / STAMP_NAME


def read_stamp(data_dir):
    """读上次成功同步时间。缺失 / 读不了 / 空 / 非数字一律当「从未同步」，返回 None。"""
    try:
        raw = stamp_path(data_dir).read_text(encoding="utf-8").strip()
        return float(raw)
    except (OSError, ValueError):
        return None


def write_stamp(data_dir, now=None):
    """记录本次成功同步时间。写失败不算同步失败——下次照常重推。"""
    value = time.time() if now is None else now
    try:
        stamp_path(data_dir).write_text(repr(value), encoding="utf-8")
    except OSError:
        pass


def should_skip_palace(data_dir, min_interval, now=None):
    """距上次成功推送不足 min_interval 秒则返回跳过原因，否则返回 None。

    min_interval <= 0 表示不限频，恒不跳过（与改造前行为一致）。
    """
    if min_interval <= 0:
        return None
    last = read_stamp(data_dir)
    if last is None:
        return None
    now = time.time() if now is None else now
    elapsed = now - last
    if elapsed < min_interval:
        return f"☁️ 距上次成功同步 {int(elapsed)}s < {int(min_interval)}s，跳过"
    return None


def main(argv=None) -> int:
    import argparse
    parser = argparse.ArgumentParser(description="推送热点数据到云端")
    parser.add_argument("--latest", action="store_true", help="仅推送 latest.json")
    parser.add_argument("--day", type=str, help="仅推送指定日期，如 2026-06-05")
    parser.add_argument("--all", action="store_true", help="推送所有本地 day 文件")
    parser.add_argument("--palace", action="store_true",
                        help="推送观点宫殿档案层（data/archive/*.jsonl）并触发云端重建索引")
    parser.add_argument("--min-interval", type=int, default=0,
                        help="距上次成功推送不足 N 秒则跳过（0 = 不限频，默认）")
    args = parser.parse_args(argv)

    cfg = load_config()
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    data_dir = Path(base) / cfg["server"]["data_dir"]

    # 确保 cloud 配置启用
    cfg.setdefault("cloud", {})
    cfg["cloud"]["enabled"] = True
    if "base_url" not in cfg["cloud"]:
        cfg["cloud"]["base_url"] = "http://47.253.54.6:8765"

    if args.palace:
        from backend.palace_sync import push_archive
        reason = should_skip_palace(data_dir, args.min_interval)
        if reason:
            print(reason, flush=True)
            return 0
        stats = push_archive(cfg, data_dir)
        # 只有真的推成功（至少一群）才盖时间戳：失败的 run 必须让下一轮重试，
        # 否则一次失败会被伪装成「刚同步过」，整整一个间隔都不会再试。
        if stats and stats.get("ok", 0) > 0:
            write_stamp(data_dir)
        return 0

    if args.all:
        for f in sorted(data_dir.glob("day_*.json")):
            date = f.stem.replace("day_", "")
            push_to_cloud(cfg, date, data_dir)
        return 0

    if args.day:
        push_to_cloud(cfg, args.day, data_dir)
        return 0

    if args.latest:
        date_str = datetime.now(CST).strftime("%Y-%m-%d")
        cfg["cloud"]["push_mode"] = "latest"
        push_to_cloud(cfg, date_str, data_dir)
        return 0

    # 默认: 推送 latest + 当天 day
    date_str = datetime.now(CST).strftime("%Y-%m-%d")
    push_to_cloud(cfg, date_str, data_dir)
    return 0

if __name__ == "__main__":
    sys.exit(main())
