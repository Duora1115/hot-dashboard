#!/usr/bin/env python3
"""
FastAPI 服务端：提供数据 API + 托管前端页面
"""

import json
import os
import sys
from pathlib import Path
from datetime import datetime, timezone, timedelta
from concurrent.futures import ThreadPoolExecutor

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi import Body
import yaml

# 确保项目根目录在 path 中
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from backend.collector import load_config, collect_live, collect_replay

CST = timezone(timedelta(hours=8))
cfg = load_config()
data_dir = PROJECT_ROOT / cfg["server"]["data_dir"]
frontend_dir = PROJECT_ROOT / "frontend"

app = FastAPI(title="Hot Dashboard API", version="1.0.0")

# ---- 响应缓存（同日期不重复处理） ----
_day_cache = {}  # {date_str: {"mtime": float, "data": dict}} 压缩后缓存
_raw_cache = {}  # {date_str: {"mtime": float, "data": dict}} 原始数据缓存（用于快照范围查询）


def _compress_snapshot(s):
    """压缩单个快照（线程安全，无共享状态）"""
    top10 = []
    for t in s.get("top10_stocks", []):
        top10.append({
            "c": t["code"], "n": t.get("name", ""), "sc": t["score"],
            "mc": t["mention_count"], "gc": t["group_count"],
            "ac": t["action_count"], "bu": t["bull"], "be": t["bear"],
            "ft": t.get("first_time", "").split(" ")[1] if t.get("first_time") else "",
            "lt": t.get("last_time", "").split(" ")[1] if t.get("last_time") else "",
            "sec": t.get("sectors", []),
        })
    top8 = []
    for t in s.get("top8_sectors", []):
        gd = []
        for g in t.get("group_details", []):
            gd.append({
                "g": g["group"], "c": g["count"],
                "m": [{"t": m["time"].split(" ")[1], "x": m["text"]} for m in g["messages"]]
            })
        top8.append({
            "n": t["name"], "sc": t["score"],
            "mc": t["mention_count"], "gc": t["group_count"],
            "txt": (t.get("sample_text", ""))[:60],
            "gd": gd
        })
    sd = s.get("sentiment_detail", {})
    return {
        "t": s["time"], "msg": s["total_messages"], "grp": s["active_groups"],
        "sent": s.get("overall_sentiment", ""),
        "sd": {"bu": sd.get("bull", 0), "be": sd.get("bear", 0), "ne": sd.get("neutral", 0),
               "eh": sd.get("extreme_high", 0), "el": sd.get("extreme_low", 0)},
        "act": s.get("action_summary", {}),
        "stk": top10, "sec": top8
    }


# ---- API 路由 ----

@app.get("/api/status")
def api_status():
    """服务状态"""
    dates = sorted([
        f.stem.replace("day_", "")
        for f in data_dir.glob("day_*.json")
    ]) if data_dir.exists() else []
    latest = data_dir / "latest.json"
    last_update = None
    if latest.exists():
        last_update = datetime.fromtimestamp(latest.stat().st_mtime, tz=CST).strftime("%Y-%m-%d %H:%M")
    return {
        "status": "ok",
        "data_dir": str(data_dir),
        "available_dates": dates,
        "last_update": last_update,
        "server_time": datetime.now(CST).strftime("%Y-%m-%d %H:%M:%S")
    }


@app.get("/api/dates")
def api_dates():
    """列出所有可用日期"""
    if not data_dir.exists():
        return []
    dates = sorted([
        {"date": f.stem.replace("day_", ""), "size_kb": round(f.stat().st_size / 1024, 1)}
        for f in data_dir.glob("day_*.json")
    ], key=lambda x: x["date"], reverse=True)
    return dates


@app.get("/api/latest")
def api_latest():
    """获取最新实时快照"""
    latest = data_dir / "latest.json"
    if not latest.exists():
        raise HTTPException(404, "暂无实时数据")
    with open(latest, encoding="utf-8") as f:
        return json.load(f)


@app.get("/api/day/{date_str}")
def api_day(date_str: str):
    """获取指定日期的完整回放数据（多线程并行 + 缓存）"""
    day_file = data_dir / f"day_{date_str}.json"
    if not day_file.exists():
        raise HTTPException(404, f"日期 {date_str} 数据不存在")

    # 检查缓存（文件修改时间一致则命中）
    mtime = day_file.stat().st_mtime
    cached = _day_cache.get(date_str)
    if cached and cached["mtime"] == mtime:
        return cached["data"]

    with open(day_file, encoding="utf-8") as f:
        data = json.load(f)

    # total_msgs 可能为 0（云端推送/采集异常），用最后一个快照兜底
    total = data.get("total_msgs", 0)
    if not total and data.get("snapshots"):
        total = data["snapshots"][-1].get("total_messages", 0)

    # 多线程并行处理所有快照
    snapshots = data["snapshots"]
    with ThreadPoolExecutor(max_workers=min(8, len(snapshots) or 1)) as pool:
        compressed_snaps = list(pool.map(_compress_snapshot, snapshots))

    result = {"date": data["date"], "total": total, "snapshots": compressed_snaps}

    # 写入缓存
    _day_cache[date_str] = {"mtime": mtime, "data": result}
    return result


@app.get("/api/day/{date_str}/meta")
def api_day_meta(date_str: str):
    """获取日期的元信息（快照数量 + 时间列表），不加载完整数据。用于懒加载初始化。"""
    day_file = data_dir / f"day_{date_str}.json"
    if not day_file.exists():
        raise HTTPException(404, f"日期 {date_str} 数据不存在")

    with open(day_file, encoding="utf-8") as f:
        data = json.load(f)

    snapshots = data.get("snapshots", [])
    total = data.get("total_msgs", 0)
    if not total and snapshots:
        total = snapshots[-1].get("total_messages", 0)

    return {
        "date": data["date"],
        "total": total,
        "count": len(snapshots),
        "times": [s["time"] for s in snapshots],
    }


@app.get("/api/day/{date_str}/snapshots")
def api_day_snapshots(date_str: str, start: int = 0, count: int = 20):
    """按需获取指定范围的快照数据（懒加载）。

    参数:
    - start: 起始快照索引（默认 0）
    - count: 获取数量（默认 20，最大 100）
    """
    day_file = data_dir / f"day_{date_str}.json"
    if not day_file.exists():
        raise HTTPException(404, f"日期 {date_str} 数据不存在")

    count = min(count, 100)  # 限制单次最大加载量

    # 尝试从缓存获取原始数据
    mtime = day_file.stat().st_mtime
    cached_raw = _raw_cache.get(date_str)
    if cached_raw and cached_raw["mtime"] == mtime:
        raw_data = cached_raw["data"]
    else:
        with open(day_file, encoding="utf-8") as f:
            raw_data = json.load(f)
        _raw_cache[date_str] = {"mtime": mtime, "data": raw_data}

    snapshots = raw_data.get("snapshots", [])
    total = raw_data.get("total_msgs", 0)
    if not total and snapshots:
        total = snapshots[-1].get("total_messages", 0)

    # 取指定范围
    end = min(start + count, len(snapshots))
    batch = snapshots[start:end]

    # 压缩这批快照
    compressed_snaps = [_compress_snapshot(s) for s in batch]

    return {
        "date": raw_data["date"],
        "total": total,
        "count": len(snapshots),
        "start": start,
        "end": end,
        "snapshots": compressed_snaps,
    }


@app.get("/api/stock-messages/{date_str}")
def api_stock_messages(date_str: str, code: str, time: str = ""):
    """按需获取指定股票的消息原文（延迟加载）"""
    day_file = data_dir / f"day_{date_str}.json"
    if not day_file.exists():
        raise HTTPException(404, f"日期 {date_str} 数据不存在")

    target_time = time or ""
    with open(day_file, encoding="utf-8") as f:
        data = json.load(f)

    # 找到目标快照（默认最后一个）
    snap = None
    for s in data.get("snapshots", []):
        if target_time and s["time"] == target_time:
            snap = s
            break
    if snap is None and data.get("snapshots"):
        snap = data["snapshots"][-1]
    if snap is None:
        return []

    # 查找该股票的 group_details
    for t in snap.get("top10_stocks", []):
        if t["code"] == code:
            result = []
            for g in t.get("group_details", []):
                result.append({
                    "group": g["group"],
                    "messages": [{"time": m["time"].split(" ")[1], "text": m["text"]} for m in g["messages"]]
                })
            return result
    return []


@app.post("/api/collect")
def api_collect():
    """手动触发一次实时采集"""
    try:
        result = collect_live(cfg, data_dir)
        return {"status": "ok", "result": result}
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/api/replay/{date_str}")
def api_replay(date_str: str):
    """触发历史回放数据采集（后台执行，返回后不等待）"""
    try:
        result = collect_replay(date_str, cfg, data_dir)
        return {"status": "ok", "date": date_str, "windows": result.get("windows", len(result.get("snapshots", [])))}
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/api/upload")
def api_upload(data: dict = Body(...)):
    """上传数据文件到本地 data/ 目录。云端可用此接口推送数据。

    请求体:
    {
        "filename": "day_2026-06-07.json" | "latest.json",
        "data": { ... JSON内容 ... }
    }
    """
    filename = data.get("filename")
    if not filename or "/" in filename or "\\" in filename:
        raise HTTPException(400, "filename 必须为文件名（不含路径），如 day_2026-06-07.json 或 latest.json")
    if not filename.endswith(".json"):
        raise HTTPException(400, "filename 必须以 .json 结尾")

    content = data.get("data")
    if content is None:
        raise HTTPException(400, "缺少 data 字段")

    target = data_dir / filename
    with open(target, "w", encoding="utf-8") as f:
        json.dump(content, f, ensure_ascii=False)

    return {"status": "ok", "filename": filename, "size_kb": round(target.stat().st_size / 1024, 1)}


@app.post("/api/upload/latest")
def api_upload_latest(data: dict = Body(...)):
    """快捷上传 latest.json。直接把请求体作为 latest.json 内容保存。"""
    target = data_dir / "latest.json"
    with open(target, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    return {"status": "ok", "filename": "latest.json", "size_kb": round(target.stat().st_size / 1024, 1)}


@app.post("/api/upload/day/{date_str}")
def api_upload_day(date_str: str, data: dict = Body(...)):
    """快捷上传 day_YYYY-MM-DD.json。直接把请求体作为当天数据保存。"""
    if not __import__("re").match(r"^\d{4}-\d{2}-\d{2}$", date_str):
        raise HTTPException(400, "日期格式必须为 YYYY-MM-DD")
    target = data_dir / f"day_{date_str}.json"
    with open(target, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    return {"status": "ok", "filename": f"day_{date_str}.json", "size_kb": round(target.stat().st_size / 1024, 1)}


# ---- 前端托管 ----

# 如果 frontend 目录存在，托管静态文件
if frontend_dir.exists():
    app.mount("/static", StaticFiles(directory=str(frontend_dir)), name="static")

# Tailwind CSS 编译输出
dist_dir = PROJECT_ROOT / "frontend" / "dist"
if dist_dir.exists():
    app.mount("/static/dist", StaticFiles(directory=str(dist_dir)), name="static-dist")


@app.get("/")
def root():
    index = frontend_dir / "index.html"
    if index.exists():
        return FileResponse(str(index))
    return JSONResponse({"message": "Hot Dashboard API", "docs": "/docs"})


# ---- 启动 ----
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "backend.server:app",
        host=cfg["server"]["host"],
        port=cfg["server"]["port"],
        reload=True,
    )
