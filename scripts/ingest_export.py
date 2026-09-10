#!/usr/bin/env python3
"""把离线导出的群聊 JSON 目录灌进档案层（data/archive/）。

用法：
  python3 scripts/ingest_export.py --src ~/export_2m
  python3 scripts/ingest_export.py --src ~/export_2m --data-dir data

与 scripts/backfill.py 的分工：回补走 lark-cli 在线翻页（仅云端可用），本命令
吃离线导出文件，用于冷启动与本地复现。幂等，重复跑只补新增消息。

灌完接着跑 python3 scripts/build_palace.py 重建观点与索引。
"""
import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.collector import load_config
from backend.palace_ingest import ingest_dir


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--src", required=True, help="导出目录（每群一个 JSON）")
    parser.add_argument("--data-dir", default=None, help="默认取 settings.yaml 的 server.data_dir")
    args = parser.parse_args()

    cfg = load_config()
    data_dir = Path(args.data_dir or cfg["server"]["data_dir"])
    chat_to_name = {g["chat_id"]: g["name"] for g in (cfg.get("groups") or [])}

    src = Path(args.src).expanduser()
    if not src.is_dir():
        print(f"✗ 导出目录不存在：{src}")
        sys.exit(1)

    result = ingest_dir(src, data_dir, chat_to_name)
    groups = result["groups"]
    skipped = result["skipped"]

    added = sum(v["added"] for v in groups.values())
    print(f"导入完成：{len(groups)} 群，新增 {added} 条消息，跳过 {len(skipped)} 个文件")
    for chat_id, v in sorted(groups.items(), key=lambda kv: kv[1]["name"]):
        print(f"  ✓ {v['name']}: 新增 {v['added']}，文件内 {v['messages']} 条")
    for s in skipped:
        print(f"  ✗ {s['file']}: {s['reason']}")

    if not groups:
        print("✗ 一个群都没导入，检查 --src 与 settings.yaml 的 groups")
        sys.exit(1)


if __name__ == "__main__":
    main()
