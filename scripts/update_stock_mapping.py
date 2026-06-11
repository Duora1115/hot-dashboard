#!/usr/bin/env python3
"""
更新股票代码→标准名称映射表
从新浪财经拉取全量A股列表，写入 data/stock_mapping.json
建议每周执行一次：python3 scripts/update_stock_mapping.py
"""

import subprocess
import json
import os
import time
from pathlib import Path


def update_mapping(data_dir=None):
    if data_dir is None:
        data_dir = Path(__file__).parent.parent / "data"

    mapping = {}
    page = 1
    max_pages = 80  # ~5500 stocks / 80 per page

    print("开始从新浪财经拉取A股列表...")

    while page <= max_pages:
        cmd = [
            'curl', '-s', '-k',
            f'http://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/'
            f'Market_Center.getHQNodeData?page={page}&num=80&sort=symbol&asc=1&node=hs_a',
            '-H', 'User-Agent: Mozilla/5.0'
        ]
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
        if not r.stdout.strip():
            break
        try:
            stocks = json.loads(r.stdout)
        except json.JSONDecodeError:
            break
        if not stocks:
            break

        for s in stocks:
            symbol = str(s.get('symbol', '')).strip()
            name = str(s.get('name', '')).strip()
            # 去除 sh/sz/bj 前缀
            if symbol.startswith(('sh', 'sz', 'bj')):
                symbol = symbol[2:]
            if symbol and name:
                mapping[symbol] = name

        if page % 10 == 0:
            print(f"  第 {page} 页 → 累计 {len(mapping)} 条")
        page += 1
        time.sleep(0.2)

    out_path = Path(data_dir) / "stock_mapping.json"
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(mapping, f, ensure_ascii=False)

    print(f"✅ 写入 {len(mapping)} 条映射 → {out_path}")
    return len(mapping)


if __name__ == "__main__":
    update_mapping()
