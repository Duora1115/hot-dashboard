#!/usr/bin/env python3
"""
历史回放脚本 - 按日期抓取全天消息，生成完整时间轴快照
用法：python3 scripts/replay.py 2026-06-05
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.collector import load_config, collect_replay
from datetime import datetime, timezone, timedelta

CST = timezone(timedelta(hours=8))

def main():
    date_str = sys.argv[1] if len(sys.argv) > 1 else datetime.now(CST).strftime("%Y-%m-%d")
    cfg = load_config()
    data_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), cfg["server"]["data_dir"])
    collect_replay(date_str, cfg, data_dir)

if __name__ == "__main__":
    main()
