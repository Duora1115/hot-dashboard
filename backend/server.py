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
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi import Body
import yaml

# 确保项目根目录在 path 中
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from backend.collector import load_config, collect_live, collect_replay
from backend.market import fetch_indices, fetch_advance_decline
from backend.report import generate_report

CST = timezone(timedelta(hours=8))
cfg = load_config()
data_dir = PROJECT_ROOT / cfg["server"]["data_dir"]

app = FastAPI(title="Hot Dashboard API", version="1.0.0")

# CORS 支持（允许前端跨域访问 API）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---- 响应缓存（同日期不重复处理） ----
_day_cache = {}  # {date_str: {"mtime": float, "data": dict}} 压缩后缓存
_raw_cache = {}  # {date_str: {"mtime": float, "data": dict}} 原始数据缓存（用于快照范围查询）


def _compress_snapshot(s):
    """压缩单个快照（线程安全，无共享状态）"""
    top10 = []
    for t in s.get("top10_stocks", []):
        top10.append({
            "c": t["code"], "n": t.get("name", ""), "h": t["score"], "sc": t["score"],
            "mc": t["mention_count"], "gc": t["group_count"],
            "ac": t["action_count"], "bu": t["bull"], "be": t["bear"],
            "ft": t.get("first_time", "").split(" ")[1] if t.get("first_time") else "",
            "lt": t.get("last_time", "").split(" ")[1] if t.get("last_time") else "",
            "sec": t.get("sectors", []), "s": t.get("sectors", []),
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
            "n": t["name"], "h": t["score"], "sc": t["score"],
            "m": t["mention_count"], "mc": t["mention_count"],
            "g": t["group_count"], "gc": t["group_count"],
            "s": [st["name"] for st in s.get("top10_stocks", []) if t["name"] in st.get("sectors", [])],
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
    """服务状态 — 匹配前端 ApiStatus 类型"""
    dates = sorted([
        f.stem.replace("day_", "")
        for f in data_dir.glob("day_*.json")
    ]) if data_dir.exists() else []
    latest = data_dir / "latest.json"
    latest_time = None
    current_date = None
    if latest.exists():
        latest_time = datetime.fromtimestamp(latest.stat().st_mtime, tz=CST).strftime("%Y-%m-%d %H:%M")
        try:
            with open(latest, encoding="utf-8") as f:
                latest_data = json.load(f)
            current_date = latest_data.get("date") or latest_data.get("time", "")[:10]
        except Exception:
            pass
    if not current_date and dates:
        current_date = dates[-1]
    group_count = len(cfg.get("groups", []))
    return {
        "status": "ok",
        "current_date": current_date,
        "latest_time": latest_time,
        "group_count": group_count,
        "task_running": False,
    }


@app.get("/api/dates")
def api_dates():
    """列出所有可用日期 — 匹配前端 DateInfo 类型"""
    if not data_dir.exists():
        return []
    dates = []
    for f in data_dir.glob("day_*.json"):
        date_str = f.stem.replace("day_", "")
        size = f.stat().st_size
        dates.append({
            "date": date_str,
            "size_kb": round(size / 1024, 1),
        })
    dates.sort(key=lambda x: x["date"], reverse=True)
    return dates


@app.get("/api/latest")
def api_latest():
    """获取最新实时快照"""
    latest = data_dir / "latest.json"
    if not latest.exists():
        raise HTTPException(404, "暂无实时数据")
    with open(latest, encoding="utf-8") as f:
        raw = json.load(f)
    return _compress_snapshot(raw)


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

    # 构建 meta 信息
    meta = {
        "start": snapshots[0]["time"] if snapshots else "",
        "end": snapshots[-1]["time"] if snapshots else "",
        "count": len(snapshots),
        "message_count": total,
    }
    result = {"date": data["date"], "meta": meta, "snapshots": compressed_snaps}

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
def api_day_snapshots(date_str: str, start: int = 0, count: int = 0):
    """按需获取指定范围的快照数据（懒加载）。

    参数:
    - start: 起始快照索引（默认 0）
    - count: 获取数量（默认 0 = 全部，最大 100）
    """
    day_file = data_dir / f"day_{date_str}.json"
    if not day_file.exists():
        raise HTTPException(404, f"日期 {date_str} 数据不存在")

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

    if count <= 0:
        end = len(snapshots)
    else:
        count = min(count, 100)
        end = min(start + count, len(snapshots))
    batch = snapshots[start:end]

    compressed_snaps = [_compress_snapshot(s) for s in batch]
    return compressed_snaps


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


@app.get("/api/market/indices")
def api_market_indices():
    """获取大盘指数实时数据"""
    try:
        return fetch_indices()
    except Exception as e:
        return []


@app.get("/api/market/advance-decline")
def api_market_advance_decline():
    """获取涨跌家数统计"""
    try:
        result = fetch_advance_decline()
        return result
    except Exception:
        return None


@app.get("/api/report/{date_str}")
def api_report(date_str: str):
    """生成晨报数据"""
    day_file = data_dir / f"day_{date_str}.json"
    if not day_file.exists():
        raise HTTPException(404, f"日期 {date_str} 数据不存在")

    # 复用缓存加载 day_data
    mtime = day_file.stat().st_mtime
    cached = _day_cache.get(date_str)
    if cached and cached["mtime"] == mtime:
        day_data = cached["data"]
    else:
        with open(day_file, encoding="utf-8") as f:
            raw = json.load(f)
        total = raw.get("total_msgs", 0)
        if not total and raw.get("snapshots"):
            total = raw["snapshots"][-1].get("total_messages", 0)
        snapshots = raw["snapshots"]
        with ThreadPoolExecutor(max_workers=min(8, len(snapshots) or 1)) as pool:
            compressed_snaps = list(pool.map(_compress_snapshot, snapshots))
        meta = {
            "start": snapshots[0]["time"] if snapshots else "",
            "end": snapshots[-1]["time"] if snapshots else "",
            "count": len(snapshots),
            "message_count": total,
        }
        day_data = {"date": raw["date"], "meta": meta, "snapshots": compressed_snaps}
        _day_cache[date_str] = {"mtime": mtime, "data": day_data}

    # 获取行情数据（容错）
    try:
        market_idx = fetch_indices()
    except Exception:
        market_idx = []
    try:
        adv_dec = fetch_advance_decline()
    except Exception:
        adv_dec = None

    result = generate_report(date_str, day_data, market_idx, adv_dec)

    # 合并日报数据（若存在）
    daily_report_file = data_dir / f"daily_report_{date_str}.json"
    if daily_report_file.exists():
        try:
            with open(daily_report_file, encoding="utf-8") as f:
                result["dailyReport"] = json.load(f)
        except Exception:
            pass

    return result


@app.post("/api/daily-report/{date_str}")
def api_post_daily_report(date_str: str, body: dict = Body(...)):
    """提交社群观点大日报数据"""
    report_file = data_dir / f"daily_report_{date_str}.json"
    body["date"] = date_str
    with open(report_file, "w", encoding="utf-8") as f:
        json.dump(body, f, ensure_ascii=False, indent=2)
    return {"status": "ok", "date": date_str}


@app.get("/api/daily-report/{date_str}")
def api_get_daily_report(date_str: str):
    """获取社群观点大日报数据"""
    report_file = data_dir / f"daily_report_{date_str}.json"
    if not report_file.exists():
        raise HTTPException(404, f"日期 {date_str} 日报不存在")
    with open(report_file, encoding="utf-8") as f:
        return json.load(f)


@app.get("/api/day/{date_str}/sentiment-timeline")
def api_sentiment_timeline(date_str: str):
    """获取情绪时间序列"""
    day_file = data_dir / f"day_{date_str}.json"
    if not day_file.exists():
        raise HTTPException(404, f"日期 {date_str} 数据不存在")

    with open(day_file, encoding="utf-8") as f:
        data = json.load(f)

    snapshots = data.get("snapshots", [])
    key_times = ["09:30", "10:00", "10:30", "11:00", "11:30", "13:30", "14:00", "14:30", "15:00"]
    key_labels = ["开盘", "早盘升温", "盘中观察", "午前收盘", "午间收盘",
                  "午后开盘", "午后分化", "尾盘走势", "收盘"]
    result = []
    for i, kt in enumerate(key_times):
        best = None
        best_diff = float("inf")
        for snap in snapshots:
            t = snap.get("time", "")
            time_part = t.split(" ")[1] if " " in t else t
            try:
                snap_min = int(time_part.split(":")[0]) * 60 + int(time_part.split(":")[1])
                key_min = int(kt.split(":")[0]) * 60 + int(kt.split(":")[1])
                diff = abs(snap_min - key_min)
                if diff < best_diff:
                    best_diff = diff
                    best = snap
            except (ValueError, IndexError):
                continue
        if best:
            sd = best.get("sentiment_detail", {})
            bu = sd.get("bull", 0)
            be = sd.get("bear", 0)
            ne = sd.get("neutral", 0)
            total = bu + be + ne
            if total > 0:
                bull_bar = round(bu / total * 100)
                bear_bar = round(be / total * 100)
                neutral_bar = 100 - bull_bar - bear_bar
            else:
                bull_bar = bear_bar = neutral_bar = 33
            result.append({
                "time": kt, "label": key_labels[i],
                "bullBar": bull_bar, "bearBar": bear_bar, "neutralBar": neutral_bar,
                "overall": best.get("overall_sentiment", "观望为主"),
            })
    return result


@app.get("/api/day/{date_str}/extreme-stats")
def api_extreme_stats(date_str: str):
    """统计极值情绪次数（eh>3 和 el>3 的快照数）"""
    day_file = data_dir / f"day_{date_str}.json"
    if not day_file.exists():
        raise HTTPException(404, f"日期 {date_str} 数据不存在")

    with open(day_file, encoding="utf-8") as f:
        data = json.load(f)

    eh_count = 0
    el_count = 0
    for snap in data.get("snapshots", []):
        sd = snap.get("sentiment_detail", {})
        if sd.get("extreme_high", 0) > 3:
            eh_count += 1
        if sd.get("extreme_low", 0) > 3:
            el_count += 1
    return {"month_extreme_high": eh_count, "month_extreme_low": el_count}


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
dist_dir = PROJECT_ROOT / "frontend" / "dist"

# 托管 Vite 构建产物的静态资源
if dist_dir.exists():
    app.mount("/assets", StaticFiles(directory=str(dist_dir / "assets")), name="static-assets")


@app.exception_handler(404)
async def not_found_handler(request, exc):
    """React Router SPA catch-all: 任何未知路径返回 index.html"""
    index = dist_dir / "index.html"
    if index.exists():
        return FileResponse(str(index))
    return JSONResponse({"detail": "Not found"}, status_code=404)

@app.get("/")
def root():
    index = dist_dir / "index.html"
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
