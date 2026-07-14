#!/usr/bin/env python3
"""
FastAPI 服务端：提供数据 API + 托管前端页面
"""

import json
import os
import sys
from pathlib import Path
from datetime import datetime, timezone, timedelta, date

from fastapi import FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi import Body
import yaml

# 确保项目根目录在 path 中
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from backend.collector import load_config, collect_live, collect_replay
from backend.market import fetch_indices, fetch_advance_decline
from backend.report import generate_report
from backend.data_store import DataStore

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

cache_cfg = cfg.get("cache", {})
store = DataStore(
    data_dir,
    max_hot_days=cache_cfg.get("max_hot_days", 14),
    raw_lru_days=cache_cfg.get("raw_lru_days", 3),
)


def _etag_for(date_str: str) -> str:
    version = store.get_version(date_str)
    return f'"{date_str}-v{version}"'


def _check_etag(request: Request, date_str: str) -> Response | None:
    """If client's If-None-Match matches, return 304. Otherwise None."""
    etag = _etag_for(date_str)
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers={"ETag": etag})
    return None


# Cache-Control policies per endpoint type
_CACHE_POLICIES = {
    "status": "no-cache",
    "dates": "max-age=60",
    "latest": "no-cache",
    "day": "max-age=300",
    "meta": "max-age=300",
    "snapshots": "max-age=300",
    "sentiment_tl": "max-age=60",
    "extreme": "max-age=60",
    "report": "max-age=30",
    "market": "max-age=30",
    "stock_messages": "max-age=300",
    "daily_report": "max-age=300",
}


@app.on_event("startup")
def startup_event():
    store.startup()


# ---- API 路由 ----

@app.get("/api/status")
def api_status(request: Request):
    """服务状态 — 匹配前端 ApiStatus 类型"""
    dates = store.get_dates()
    latest_raw = store.get_latest_raw()
    latest_time = None
    current_date = None

    latest_path = data_dir / "latest.json"
    if latest_path.exists():
        latest_time = datetime.fromtimestamp(latest_path.stat().st_mtime, tz=CST).strftime("%Y-%m-%d %H:%M")
        if latest_raw:
            current_date = latest_raw.get("date") or latest_raw.get("time", "")[:10]

    if not current_date and dates:
        current_date = dates[-1]

    group_count = len(cfg.get("groups", []))
    today = date.today().isoformat()
    etag = f'"status-v{store.get_version(today)}"'
    headers = {"ETag": etag, "Cache-Control": _CACHE_POLICIES["status"]}
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers=headers)
    return JSONResponse({
        "status": "ok",
        "current_date": current_date,
        "latest_time": latest_time,
        "group_count": group_count,
        "task_running": False,
    }, headers=headers)


@app.get("/api/dates")
def api_dates(request: Request):
    """列出所有可用日期 — 匹配前端 DateInfo 类型"""
    result = store.get_dates_info()
    total_kb = sum(d.get("size_kb", 0) for d in result)
    etag = f'"dates-{len(result)}-{int(total_kb)}"'
    headers = {"ETag": etag, "Cache-Control": _CACHE_POLICIES["dates"]}
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers=headers)
    return JSONResponse(result, headers=headers)


@app.get("/api/latest")
def api_latest(request: Request):
    """获取最新实时快照"""
    result = store.get_latest()
    if result is None:
        raise HTTPException(404, "暂无实时数据")
    etag = f'"latest-v{store.get_version("latest")}"'
    headers = {"ETag": etag, "Cache-Control": _CACHE_POLICIES["latest"]}
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers=headers)
    return JSONResponse(result, headers=headers)


@app.get("/api/day/{date_str}")
def api_day(date_str: str, request: Request):
    """获取指定日期的完整回放数据"""
    not_modified = _check_etag(request, date_str)
    if not_modified:
        return not_modified
    result = store.get_day(date_str)
    if result is None:
        raise HTTPException(404, f"日期 {date_str} 数据不存在")
    return JSONResponse(result, headers={
        "ETag": _etag_for(date_str),
        "Cache-Control": _CACHE_POLICIES["day"],
    })


@app.get("/api/day/{date_str}/meta")
def api_day_meta(date_str: str, request: Request):
    """获取日期的元信息，不加载完整数据。"""
    # 先检查文件是否存在（不触发完整加载）
    path = data_dir / f"day_{date_str}.json"
    if not path.exists():
        raise HTTPException(404, f"日期 {date_str} 数据不存在")

    # 如果已加载，直接用内存数据
    day = store.get_day(date_str)
    if day is None:
        raise HTTPException(404, f"日期 {date_str} 数据不存在")

    # 时间列表从索引获取（不读原始数据）
    times = []
    for time_key, (d, idx) in sorted(store.index.time_index.items()):
        if d == date_str:
            times.append(time_key.split(" ")[1] if " " in time_key else time_key)

    return JSONResponse({
        "date": day["date"],
        "total": day["meta"]["message_count"],
        "count": day["meta"]["count"],
        "times": times,
    }, headers={
        "ETag": _etag_for(date_str),
        "Cache-Control": _CACHE_POLICIES["meta"],
    })


@app.get("/api/day/{date_str}/snapshots")
def api_day_snapshots(date_str: str, request: Request, start: int = 0, count: int = 0):
    """按需获取指定范围的快照数据（懒加载）。

    参数:
    - start: 起始快照索引（默认 0）
    - count: 获取数量（默认 0 = 全部，最大 100）
    """
    not_modified = _check_etag(request, date_str)
    if not_modified:
        return not_modified
    if store.get_day(date_str) is None:
        raise HTTPException(404, f"日期 {date_str} 数据不存在")
    result = store.get_snapshots(date_str, start, count if count > 0 else None)
    return JSONResponse(result, headers={
        "ETag": _etag_for(date_str),
        "Cache-Control": _CACHE_POLICIES["snapshots"],
    })


@app.get("/api/stock-messages/{date_str}")
def api_stock_messages(date_str: str, request: Request, code: str, time: str = ""):
    """按需获取指定股票的消息原文（用索引定位，不扫描全部快照）。"""
    not_modified = _check_etag(request, date_str)
    if not_modified:
        return not_modified
    # 用索引定位包含该股票的快照
    locations = store.index.get_stock_locations(code)
    date_locs = [(d, i) for d, i in locations if d == date_str]

    if not date_locs:
        # 索引未命中，回退到原始数据扫描
        raw_snaps = store.get_raw_snapshots(date_str)
        if not raw_snaps:
            raise HTTPException(404, f"日期 {date_str} 数据不存在")

        target_time = time or ""
        snap = None
        for s in raw_snaps:
            if target_time and s["time"] == target_time:
                snap = s
                break
        if snap is None:
            snap = raw_snaps[-1]

        for t in snap.get("top10_stocks", []):
            if t["code"] == code:
                result = []
                for g in t.get("group_details", []):
                    result.append({
                        "group": g["group"],
                        "messages": [{"time": m["time"].split(" ")[1], "text": m["text"]} for m in g["messages"]]
                    })
                return JSONResponse(result, headers={
                    "ETag": _etag_for(date_str),
                    "Cache-Control": _CACHE_POLICIES["stock_messages"],
                })
        return JSONResponse([], headers={
            "ETag": _etag_for(date_str),
            "Cache-Control": _CACHE_POLICIES["stock_messages"],
        })

    # 索引命中 — 从 raw cache 获取需要的快照
    raw_snaps = store.get_raw_snapshots(date_str)
    if not raw_snaps:
        raise HTTPException(404, f"日期 {date_str} 数据不存在")

    target_time = time or ""
    result = []
    for _, snap_idx in date_locs:
        if snap_idx >= len(raw_snaps):
            continue
        snap = raw_snaps[snap_idx]
        if target_time and snap.get("time", "") != target_time:
            continue
        for t in snap.get("top10_stocks", []):
            if t["code"] == code:
                for g in t.get("group_details", []):
                    result.append({
                        "group": g["group"],
                        "messages": [{"time": m["time"].split(" ")[1], "text": m["text"]} for m in g["messages"]]
                    })
                    return JSONResponse(result, headers={
                        "ETag": _etag_for(date_str),
                        "Cache-Control": _CACHE_POLICIES["stock_messages"],
                    })

    # 如果指定时间没匹配到，返回最后一个命中的
    if target_time and not result:
        last_idx = date_locs[-1][1]
        if last_idx < len(raw_snaps):
            snap = raw_snaps[last_idx]
            for t in snap.get("top10_stocks", []):
                if t["code"] == code:
                    for g in t.get("group_details", []):
                        result.append({
                            "group": g["group"],
                            "messages": [{"time": m["time"].split(" ")[1], "text": m["text"]} for m in g["messages"]]
                        })
                    return JSONResponse(result, headers={
                        "ETag": _etag_for(date_str),
                        "Cache-Control": _CACHE_POLICIES["stock_messages"],
                    })
    return JSONResponse([], headers={
        "ETag": _etag_for(date_str),
        "Cache-Control": _CACHE_POLICIES["stock_messages"],
    })


@app.get("/api/market/indices")
def api_market_indices(request: Request):
    """获取大盘指数实时数据"""
    try:
        result = fetch_indices()
    except Exception:
        result = []
    return JSONResponse(result, headers={"Cache-Control": _CACHE_POLICIES["market"]})


@app.get("/api/market/advance-decline")
def api_market_advance_decline(request: Request):
    """获取涨跌家数统计"""
    try:
        result = fetch_advance_decline()
    except Exception:
        result = None
    return JSONResponse(result, headers={"Cache-Control": _CACHE_POLICIES["market"]})


@app.get("/api/report/{date_str}")
def api_report(date_str: str, request: Request):
    """生成晨报数据（带派生缓存，TTL 30s 因为包含行情数据）。"""
    cached = store.derived_cache.get("report", date_str)
    if cached is not None:
        return JSONResponse(cached, headers={
            "ETag": _etag_for(date_str),
            "Cache-Control": _CACHE_POLICIES["report"],
        })

    day_data = store.get_day(date_str)
    if day_data is None:
        raise HTTPException(404, f"日期 {date_str} 数据不存在")

    from concurrent.futures import ThreadPoolExecutor, as_completed

    market_idx = []
    adv_dec = None

    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = {
            executor.submit(fetch_indices): "indices",
            executor.submit(fetch_advance_decline): "advance_decline",
        }
        for future in as_completed(futures):
            try:
                result = future.result(timeout=3)
                if futures[future] == "indices":
                    market_idx = result
                else:
                    adv_dec = result
            except Exception:
                pass

    result = generate_report(date_str, day_data, market_idx, adv_dec)

    daily_report_file = data_dir / f"daily_report_{date_str}.json"
    if daily_report_file.exists():
        try:
            with open(daily_report_file, encoding="utf-8") as f:
                result["dailyReport"] = json.load(f)
        except Exception:
            pass

    # 缓存 30 秒（因为行情数据 30 秒刷新）
    store.derived_cache.set("report", date_str, result, ttl=30)
    return JSONResponse(result, headers={
        "ETag": _etag_for(date_str),
        "Cache-Control": _CACHE_POLICIES["report"],
    })


@app.post("/api/daily-report/{date_str}")
def api_post_daily_report(date_str: str, body: dict = Body(...)):
    """提交社群观点大日报数据"""
    report_file = data_dir / f"daily_report_{date_str}.json"
    body["date"] = date_str
    with open(report_file, "w", encoding="utf-8") as f:
        json.dump(body, f, ensure_ascii=False, indent=2)
    store.derived_cache.invalidate(date_str)
    return {"status": "ok", "date": date_str}


@app.get("/api/daily-report/{date_str}")
def api_get_daily_report(date_str: str, request: Request):
    """获取社群观点大日报数据"""
    not_modified = _check_etag(request, date_str)
    if not_modified:
        return not_modified
    report_file = data_dir / f"daily_report_{date_str}.json"
    if not report_file.exists():
        raise HTTPException(404, f"日期 {date_str} 日报不存在")
    with open(report_file, encoding="utf-8") as f:
        result = json.load(f)
    return JSONResponse(result, headers={
        "ETag": _etag_for(date_str),
        "Cache-Control": _CACHE_POLICIES["daily_report"],
    })


@app.get("/api/day/{date_str}/sentiment-timeline")
def api_sentiment_timeline(date_str: str, request: Request):
    """获取情绪时间序列（带派生缓存）。"""
    # 检查缓存
    cached = store.derived_cache.get("sentiment_tl", date_str)
    if cached is not None:
        return JSONResponse(cached, headers={
            "ETag": _etag_for(date_str),
            "Cache-Control": _CACHE_POLICIES["sentiment_tl"],
        })

    raw_snaps = store.get_raw_snapshots(date_str)
    if not raw_snaps:
        raise HTTPException(404, f"日期 {date_str} 数据不存在")

    key_times = ["09:30", "10:00", "10:30", "11:00", "11:30", "13:30", "14:00", "14:30", "15:00"]
    key_labels = ["开盘", "早盘升温", "盘中观察", "午前收盘", "午间收盘",
                  "午后开盘", "午后分化", "尾盘走势", "收盘"]
    result = []
    for i, kt in enumerate(key_times):
        best = None
        best_diff = float("inf")
        for snap in raw_snaps:
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

    store.derived_cache.set("sentiment_tl", date_str, result)
    return JSONResponse(result, headers={
        "ETag": _etag_for(date_str),
        "Cache-Control": _CACHE_POLICIES["sentiment_tl"],
    })


@app.get("/api/day/{date_str}/extreme-stats")
def api_extreme_stats(date_str: str, request: Request):
    """统计极值情绪次数（带派生缓存）。"""
    cached = store.derived_cache.get("extreme", date_str)
    if cached is not None:
        return JSONResponse(cached, headers={
            "ETag": _etag_for(date_str),
            "Cache-Control": _CACHE_POLICIES["extreme"],
        })

    raw_snaps = store.get_raw_snapshots(date_str)
    if not raw_snaps:
        raise HTTPException(404, f"日期 {date_str} 数据不存在")

    eh_count = 0
    el_count = 0
    for snap in raw_snaps:
        sd = snap.get("sentiment_detail", {})
        if sd.get("extreme_high", 0) > 3:
            eh_count += 1
        if sd.get("extreme_low", 0) > 3:
            el_count += 1

    result = {"month_extreme_high": eh_count, "month_extreme_low": el_count}
    store.derived_cache.set("extreme", date_str, result)
    return JSONResponse(result, headers={
        "ETag": _etag_for(date_str),
        "Cache-Control": _CACHE_POLICIES["extreme"],
    })


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

    # 更新 store
    if filename == "latest.json":
        store.update_latest()
    elif filename.startswith("day_"):
        date_str = filename.replace("day_", "").replace(".json", "")
        store.update_day(date_str)

    return {"status": "ok", "filename": filename, "size_kb": round(target.stat().st_size / 1024, 1)}


@app.post("/api/upload/latest")
def api_upload_latest(data: dict = Body(...)):
    """快捷上传 latest.json。直接把请求体作为 latest.json 内容保存。"""
    target = data_dir / "latest.json"
    with open(target, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    store.update_latest()
    return {"status": "ok", "filename": "latest.json", "size_kb": round(target.stat().st_size / 1024, 1)}


@app.post("/api/upload/day/{date_str}")
def api_upload_day(date_str: str, data: dict = Body(...)):
    """快捷上传 day_YYYY-MM-DD.json。直接把请求体作为当天数据保存。"""
    if not __import__("re").match(r"^\d{4}-\d{2}-\d{2}$", date_str):
        raise HTTPException(400, "日期格式必须为 YYYY-MM-DD")
    target = data_dir / f"day_{date_str}.json"
    with open(target, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    store.update_day(date_str)
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
