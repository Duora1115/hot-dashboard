"""把本地档案层推送到云端，并触发云端重建索引。

本地冷启动（scripts/ingest_export.py）产出 data/archive/*.jsonl，但那批文件
是付费群原文派生出来的，被 data/.gitignore 挡在仓库之外——云端 git pull 拿不
到，所以索引一直是空的。这条通道补上这一环。

推的是**档案**（真相源）而不是**索引**（派生）：让云端用它自己那份代码重算，
两边版本天然一致，而且档案比索引小得多。去重按 message_id，重复推送安全。
"""
from __future__ import annotations

from pathlib import Path

from backend.collector import post_to_cloud
from backend.palace_archive import archive_dir, iter_jsonl


def push_archive(cfg, data_dir: Path) -> dict:
    """逐群推送档案层，全部推完再触发一次云端重建。返回统计。"""
    files = sorted(archive_dir(data_dir).glob("*.jsonl"))
    if not files:
        print(f"  ☁️ 档案层为空：{archive_dir(data_dir)}", flush=True)
        return {"groups": 0, "ok": 0, "rows": 0}

    ok = 0
    rows_total = 0
    for f in files:
        rows = list(iter_jsonl(f))
        if not rows:
            print(f"  ☁️ {f.stem[:14]}… 档案为空，跳过", flush=True)
            continue

        rows_total += len(rows)
        if post_to_cloud(cfg, "/api/palace/archive",
                         {"chat_id": f.stem, "rows": rows},
                         f"档案 {f.stem[:14]}…"):
            ok += 1

    print(f"  ☁️ 档案推送完成：{ok}/{len(files)} 群成功，共 {rows_total} 条", flush=True)

    if ok:
        # 重建是同步执行的（本地实测 54k 条约 9.5 秒），别用默认 30 秒超时卡自己。
        post_to_cloud(cfg, "/api/palace/rebuild", {}, "重建索引",
                      timeout=cfg.get("cloud", {}).get("rebuild_timeout", 180))
    else:
        print("  ☁️ 没有一群推送成功，跳过重建", flush=True)

    return {"groups": len(files), "ok": ok, "rows": rows_total}
