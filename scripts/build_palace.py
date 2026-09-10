#!/usr/bin/env python3
"""从档案层重建观点宫殿索引。

用法：
  python3 scripts/build_palace.py

产出：
  data/palace/opinions/<chat_id>.jsonl   派生观点（可幂等重建）
  data/palace/kols.json                  每群画像
  data/palace/stock_index.json           每票跨群汇总
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.collector import load_config
from backend.palace_build import build_all


def main():
    cfg = load_config()
    data_dir = Path(cfg["server"]["data_dir"])

    doc = build_all(data_dir, cfg)
    cov = doc["coverage"]
    print(f"完成：{len(doc['kols'])} 群")
    print(f"覆盖：{cov['from'] or '—'} → {cov['to'] or '—'}，缺口 {len(cov['missing_days'])} 个交易日")
    for k in sorted(doc["kols"].values(), key=lambda x: -x["opinion_count"]):
        print(f"  {k['name']}: 消息 {k['msg_count']}，观点 {k['opinion_count']}，"
              f"票 {k['stock_count']}，活跃 {k['active_days']} 天")


if __name__ == "__main__":
    main()
