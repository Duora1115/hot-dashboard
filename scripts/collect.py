#!/usr/bin/env python3
"""
定时采集脚本 - 被 cron 调用
采集当前时刻热点，写入 data/latest.json 和 data/day_YYYY-MM-DD.json
"""

import sys
import os

# 确保项目根目录在 path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.collector import load_config, collect_live

def main():
    cfg = load_config()
    data_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), cfg["server"]["data_dir"])

    result = collect_live(cfg, data_dir)
    s = result["overall_sentiment"]
    top = result.get("top10_stocks", [])
    print(f"[{result['time']}] {s} | 消息{result['total_messages']} 群{result['active_groups']}")
    if top:
        print(f"  Top1: {top[0]['code']} {top[0]['name']} score={top[0]['score']} bu={top[0]['bull']} be={top[0]['bear']}")
    if result.get("top8_sectors"):
        secs = [f"{s['name']}({s['score']})" for s in result["top8_sectors"][:5]]
        print(f"  板块: {', '.join(secs)}")

if __name__ == "__main__":
    main()
