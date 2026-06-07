#!/usr/bin/env python3
"""
FastAPI 服务端：提供数据 API + 托管前端页面
"""

import json
import os
import sys
from pathlib import Path
from datetime import datetime, timezone, timedelta

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
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
    """获取指定日期的完整回放数据"""
    day_file = data_dir / f"day_{date_str}.json"
    if not day_file.exists():
        raise HTTPException(404, f"日期 {date_str} 数据不存在")
    with open(day_file, encoding="utf-8") as f:
        data = json.load(f)

    # 压缩返回（前端需要）
    compressed = {"date": data["date"], "total": data["total_msgs"], "snapshots": []}
    for s in data["snapshots"]:
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
            top8.append({
                "n": t["name"], "sc": t["score"],
                "mc": t["mention_count"], "gc": t["group_count"],
                "txt": (t.get("sample_text", ""))[:60]
            })
        sd = s.get("sentiment_detail", {})
        compressed["snapshots"].append({
            "t": s["time"], "msg": s["total_messages"], "grp": s["active_groups"],
            "sent": s.get("overall_sentiment", ""),
            "sd": {"bu": sd.get("bull", 0), "be": sd.get("bear", 0), "ne": sd.get("neutral", 0),
                   "eh": sd.get("extreme_high", 0), "el": sd.get("extreme_low", 0)},
            "act": s.get("action_summary", {}),
            "stk": top10, "sec": top8
        })
    return compressed


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
    # 同步执行（回放耗时较长，前端需等待）
    try:
        result = collect_replay(date_str, cfg, data_dir)
        return {"status": "ok", "date": date_str, "windows": result.get("windows", len(result.get("snapshots", [])))}
    except Exception as e:
        raise HTTPException(500, str(e))


# ---- 前端托管 ----

# 如果 frontend 目录存在，托管静态文件
if frontend_dir.exists():
    app.mount("/static", StaticFiles(directory=str(frontend_dir)), name="static")


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
