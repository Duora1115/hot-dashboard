#!/usr/bin/env python3
"""档案层体检：一条命令回答「档案还活着吗？」

只读，不改任何文件。云端箱子上排查 palace 覆盖冻结时先跑这个：

    python3 scripts/archive_stats.py
    python3 scripts/archive_stats.py --max-age-hours 6   # 过期则非零退出，可挂 cron

输出档案目录是否存在、群文件数、总行数、最新行时间，以及每个群的最新时间。
``--max-age-hours`` 下，最新行超过 N 小时（或目录缺失 / 无可用时间戳）退出码非零。
"""

import argparse
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.collector import CST  # noqa: E402
from backend.palace_archive import archive_dir, iter_jsonl  # noqa: E402

_TS_FORMATS = (
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%d %H:%M",
    "%Y-%m-%dT%H:%M:%S",
    "%Y-%m-%dT%H:%M",
    "%Y-%m-%d",
)


def _parse_ts(raw):
    """把档案行的 ts 解析成 naive CST datetime；解析不了返回 None。"""
    if not isinstance(raw, str) or not raw.strip():
        return None
    text = raw.strip()
    for fmt in _TS_FORMATS:
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue
    try:  # 带时区的 ISO 串
        dt = datetime.fromisoformat(text)
    except ValueError:
        return None
    if dt.tzinfo is not None:
        dt = dt.astimezone(CST).replace(tzinfo=None)
    return dt


def _fmt(dt):
    return dt.strftime("%Y-%m-%d %H:%M") if dt else None


def default_data_dir():
    """优先读 config/settings.yaml 的 server.data_dir，读不到退回 ./data。"""
    root = Path(__file__).resolve().parent.parent
    try:
        from backend.collector import load_config
        cfg = load_config()
        return root / str(cfg["server"]["data_dir"])
    except Exception:
        return root / "data"


def summarize(data_dir) -> dict:
    """扫描 ``data_dir/archive/*.jsonl``，返回只读统计（不抛异常）。"""
    adir = archive_dir(data_dir)
    info = {
        "dir": str(adir),
        "exists": adir.is_dir(),
        "group_count": 0,
        "total_rows": 0,
        "newest_ts": None,
        "newest_dt": None,
        "groups": [],
    }
    if not info["exists"]:
        return info

    newest_dt = None
    for path in sorted(adir.glob("*.jsonl")):
        rows = 0
        group_newest = None
        for row in iter_jsonl(path):
            rows += 1
            if not isinstance(row, dict):
                continue  # 合法 JSON 但不是对象（如 [1,2,3]）——计行数但不解析
            ts = _parse_ts(row.get("ts"))
            if ts is not None and (group_newest is None or ts > group_newest):
                group_newest = ts
        info["groups"].append({
            "chat_id": path.stem,
            "rows": rows,
            "newest_ts": _fmt(group_newest),
            "newest_dt": group_newest,
        })
        info["total_rows"] += rows
        if group_newest is not None and (newest_dt is None or group_newest > newest_dt):
            newest_dt = group_newest

    info["group_count"] = len(info["groups"])
    info["newest_dt"] = newest_dt
    info["newest_ts"] = _fmt(newest_dt)
    return info


def format_report(info: dict) -> str:
    lines = []
    state = "存在" if info["exists"] else "不存在"
    lines.append(f"档案目录: {info['dir']} ({state})")
    if not info["exists"]:
        lines.append("❌ 归档目录不存在——采集从未写入档案，或 data_dir 配置错误。"
                     "先确认 collect.py 的 server.data_dir 与运行用户一致。")
        return "\n".join(lines)

    lines.append(f"群文件: {info['group_count']} | 总行数: {info['total_rows']}")
    lines.append(f"最新行时间: {info['newest_ts'] or '（无可用时间戳）'}")
    if info["groups"]:
        lines.append("各组最新时间（旧→新，最上面即最 stale）:")
        for g in sorted(info["groups"], key=lambda x: x["newest_ts"] or ""):
            lines.append(f"  {g['chat_id']}  {g['rows']} 行  {g['newest_ts'] or '无时间戳'}")
    return "\n".join(lines)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="档案层（data/archive）体检")
    parser.add_argument("--data-dir", default=None,
                        help="数据目录（默认取 config 的 server.data_dir）")
    parser.add_argument("--max-age-hours", type=float, default=None,
                        help="最新行超过 N 小时即视为不健康，非零退出（可作 cron 健康检查）")
    args = parser.parse_args(argv)

    data_dir = Path(args.data_dir) if args.data_dir else default_data_dir()
    info = summarize(data_dir)
    print(format_report(info))

    if args.max_age_hours is None:
        return 0

    newest = info["newest_dt"]
    if newest is None:
        print(f"❌ 档案无可用最新时间戳，视为过期（阈值 {args.max_age_hours}h）")
        return 1

    age_hours = (datetime.now(CST).replace(tzinfo=None) - newest).total_seconds() / 3600
    if age_hours > args.max_age_hours:
        print(f"❌ 档案过期：最新 {info['newest_ts']}，已 {age_hours:.1f}h "
              f"> {args.max_age_hours}h")
        return 1

    print(f"✅ 档案新鲜：最新 {info['newest_ts']}，{age_hours:.1f}h "
          f"≤ {args.max_age_hours}h")
    return 0


if __name__ == "__main__":
    sys.exit(main())
