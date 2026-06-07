#!/usr/bin/env python3
"""
热点数据采集引擎
从飞书群抓取消息 → 多维度分析（股票/板块/情绪/操作） → 输出结构化数据
"""

import subprocess
import json
import time
import re
import os
import yaml
from datetime import datetime, timezone, timedelta
from collections import defaultdict
from pathlib import Path

CST = timezone(timedelta(hours=8))

# ---- 配置加载 ----
def load_config(config_path=None):
    if config_path is None:
        config_path = Path(__file__).parent.parent / "config" / "settings.yaml"
    with open(config_path, encoding="utf-8") as f:
        return yaml.safe_load(f)

# ---- 飞书消息抓取 ----
def fetch_messages(chat_id, max_pages=8):
    """抓取单个群的消息，返回列表"""
    msgs = []
    cmd_base = [
        "lark-cli", "im", "+chat-messages-list",
        "--chat-id", chat_id, "--page-size", "50",
        "--sort", "desc", "--format", "json"
    ]
    page_token = None
    for _ in range(max_pages):
        cmd = cmd_base[:]
        if page_token:
            cmd.extend(["--page-token", page_token])
        try:
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            d = json.loads(r.stdout)
            batch = d.get("data", {}).get("messages", [])
            if not batch:
                break
            msgs.extend(batch)
            pt = d.get("data", {}).get("page_token")
            if not d.get("data", {}).get("has_more") or not pt:
                break
            page_token = pt
            time.sleep(0.2)
        except Exception:
            break
    return msgs

# ---- 文本分析 ----
def analyze_text(text, cfg):
    """对单条消息做多维度分析"""
    result = {
        "codes": [], "name": "",
        "sectors": [], "sentiments": {}, "actions": []
    }

    # 股票代码
    result["codes"] = re.findall(r'\b([36890]\d{5})\b', text)

    # 股票名称
    names = re.findall(r'\[([^\]]+)\]\(https://wap\.eastmoney\.com/quote/stock/', text)
    if names:
        result["name"] = names[0]

    # 板块识别
    for sector, keywords in cfg["sectors"].items():
        if any(kw in text.lower() for kw in keywords):
            result["sectors"].append(sector)

    # 情绪分析
    for sent, keywords in cfg["sentiments"].items():
        matches = [kw for kw in keywords if kw in text]
        if matches:
            result["sentiments"][sent] = len(matches)

    # 操作意图
    for action, keywords in cfg["actions"].items():
        if any(kw in text for kw in keywords):
            result["actions"].append(action)

    return result

# ---- 快照计算 ----
def compute_snapshot(all_analyzed, cutoff, cfg):
    """
    计算截止到 cutoff 时间的多维度快照。
    all_analyzed: {grp_name: [msg_with__analysis]}
    """
    stock_data = defaultdict(list)
    sector_data = defaultdict(list)
    all_sentiments = defaultdict(int)
    all_actions = defaultdict(int)
    msg_count = 0
    active_groups = set()

    for grp_name, msgs in all_analyzed.items():
        for m in msgs:
            ct = m.get("create_time", "")
            if not ct or ct > cutoff:
                continue
            analysis = m.get("_analysis", {})
            msg_count += 1
            active_groups.add(grp_name)

            # 情绪聚合
            for s, cnt in analysis.get("sentiments", {}).items():
                all_sentiments[s] += cnt

            # 操作聚合
            for a in analysis.get("actions", []):
                all_actions[a] += 1

            # 板块聚合
            for sec in analysis.get("sectors", []):
                sector_data[sec].append({
                    "group": grp_name, "time": ct,
                    "text": m.get("content", "")[:80]
                })

            # 股票聚合
            for code in analysis.get("codes", []):
                stock_data[code].append({
                    "group": grp_name, "time": ct,
                    "name": analysis.get("name", ""),
                    "has_action": bool(analysis.get("actions")),
                    "bull": any(s in analysis.get("sentiments", {}) for s in ["看多", "情绪高涨"]),
                    "bear": any(s in analysis.get("sentiments", {}) for s in ["看空", "情绪低迷"]),
                    "text": m.get("content", "")[:120]
                })

    # 股票热度排行
    hot_stocks = []
    for code, details in stock_data.items():
        groups = set(d["group"] for d in details)
        action_count = sum(1 for d in details if d["has_action"])
        name = next((d["name"] for d in details if d["name"]), "")
        bull = sum(1 for d in details if d["bull"])
        bear = sum(1 for d in details if d["bear"])

        # 综合热度
        score = len(groups) * 3 + len(details) * 2 + action_count * 5 + (bull - bear) * 2
        if score < 5 and len(groups) < 2:
            continue

        # 关联板块
        involved_sectors = set()
        for d in details:
            txt = d["text"]
            for sec, kws in cfg["sectors"].items():
                if any(kw in txt.lower() for kw in kws):
                    involved_sectors.add(sec)

        hot_stocks.append({
            "code": code, "name": name, "score": score,
            "mention_count": len(details), "group_count": len(groups),
            "groups": sorted(groups), "action_count": action_count,
            "bull": bull, "bear": bear,
            "sectors": sorted(involved_sectors),
            "first_time": min(d["time"] for d in details),
            "last_time": max(d["time"] for d in details),
        })
    hot_stocks.sort(key=lambda x: (-x["score"], -x["group_count"], -x["mention_count"]))

    # 板块热度排行
    hot_sectors = []
    for sec, details in sector_data.items():
        groups = set(d["group"] for d in details)
        if len(groups) < 2 and len(details) < 3:
            continue
        score = len(groups) * 4 + len(details) * 2
        # 按群聚合消息明细
        group_msgs = defaultdict(list)
        for d in details:
            group_msgs[d["group"]].append({"time": d["time"], "text": d["text"]})
        group_details = []
        for gn in sorted(group_msgs.keys()):
            group_details.append({
                "group": gn,
                "count": len(group_msgs[gn]),
                "messages": [{"time": m["time"], "text": m["text"]} for m in group_msgs[gn][:5]]  # 每群最多5条
            })
        hot_sectors.append({
            "name": sec, "score": score,
            "mention_count": len(details), "group_count": len(groups),
            "groups": sorted(groups),
            "group_details": group_details,
            "sample_text": details[0]["text"] if details else ""
        })
    hot_sectors.sort(key=lambda x: (-x["score"], -x["group_count"]))

    # 市场情绪判定
    bull_total = all_sentiments.get("看多", 0) + all_sentiments.get("情绪高涨", 0)
    bear_total = all_sentiments.get("看空", 0) + all_sentiments.get("情绪低迷", 0)
    neutral_total = all_sentiments.get("观望", 0)
    if bull_total > bear_total * 1.5:
        overall = "偏多"
    elif bear_total > bull_total * 1.5:
        overall = "偏空"
    elif neutral_total > bull_total and neutral_total > bear_total:
        overall = "观望为主"
    else:
        overall = "分歧"

    return {
        "time": cutoff,
        "total_messages": msg_count,
        "active_groups": len(active_groups),
        "overall_sentiment": overall,
        "sentiment_detail": {
            "bull": bull_total, "bear": bear_total, "neutral": neutral_total,
            "extreme_high": all_sentiments.get("情绪高涨", 0),
            "extreme_low": all_sentiments.get("情绪低迷", 0)
        },
        "action_summary": dict(all_actions),
        "top10_stocks": hot_stocks[:10],
        "top8_sectors": hot_sectors[:8]
    }

# ---- 主流程 ----
def collect_live(cfg=None, data_dir=None):
    """
    实时采集当前时刻热点，写入 latest.json
    返回 snapshot 字典
    """
    if cfg is None:
        cfg = load_config()
    if data_dir is None:
        data_dir = Path(cfg["server"]["data_dir"])
    elif isinstance(data_dir, str):
        data_dir = Path(data_dir)

    now = datetime.now(CST)
    date_str = now.strftime("%Y-%m-%d")
    time_str = now.strftime("%Y-%m-%d %H:%M")
    max_pages = cfg["collector"]["max_pages"]

    # 抓取所有群消息
    all_analyzed = {}
    total = 0
    active = 0

    for g in cfg["groups"]:
        try:
            msgs = fetch_messages(g["chat_id"], max_pages)
            day_msgs = [
                m for m in msgs
                if m.get("create_time", "").startswith(date_str)
                and m.get("create_time", "") <= time_str
            ]
            # 预处理分析
            for m in day_msgs:
                text = m.get("content", "")
                if text:
                    m["_analysis"] = analyze_text(text, cfg)
            all_analyzed[g["name"]] = day_msgs
            if day_msgs:
                active += 1
                total += len(day_msgs)
        except Exception as e:
            print(f"  跳过 {g['name']}: {e}")

    # 计算快照
    snapshot = compute_snapshot(all_analyzed, time_str, cfg)

    # 输出
    output = {
        "date": date_str,
        "time": time_str,
        "total_messages": total,
        "active_groups": active,
        **{k: snapshot[k] for k in [
            "overall_sentiment", "sentiment_detail",
            "action_summary", "top10_stocks", "top8_sectors"
        ]}
    }

    data_dir.mkdir(parents=True, exist_ok=True)
    with open(data_dir / "latest.json", "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2, default=str)

    # 同时追加到日期累积文件
    day_file = data_dir / f"day_{date_str}.json"
    if day_file.exists():
        with open(day_file, encoding="utf-8") as f:
            day_data = json.load(f)
        day_data["snapshots"].append(snapshot)
    else:
        day_data = {"date": date_str, "total_msgs": total, "snapshots": [snapshot]}
    with open(day_file, "w", encoding="utf-8") as f:
        json.dump(day_data, f, ensure_ascii=False, indent=2, default=str)

    return output


def collect_replay(date_str, cfg=None, data_dir=None):
    """
    历史回放：按全天时间窗口生成累积快照
    返回完整的 day_data 字典
    """
    if cfg is None:
        cfg = load_config()
    if data_dir is None:
        data_dir = Path(cfg["server"]["data_dir"])
    elif isinstance(data_dir, str):
        data_dir = Path(data_dir)

    max_pages = cfg["collector"]["max_pages"]
    windows = _build_windows(date_str)
    print(f"📅 {date_str} | {len(windows)} 个时间窗口", flush=True)

    # Step 1: 抓取全天消息（只抓一次）
    all_analyzed = {}
    total = 0
    t0 = time.time()
    for g in cfg["groups"]:
        print(f"  抓取 {g['name']}...", flush=True)
        msgs = fetch_messages(g["chat_id"], max_pages)
        day_msgs = [m for m in msgs if m.get("create_time", "").startswith(date_str)]
        for m in day_msgs:
            text = m.get("content", "")
            if text:
                m["_analysis"] = analyze_text(text, cfg)
        all_analyzed[g["name"]] = day_msgs
        total += len(day_msgs)
    elapsed = time.time() - t0
    print(f"\n✅ 抓取完成：{total}条消息，耗时{elapsed:.0f}s", flush=True)

    # Step 2: 每个窗口计算快照
    snapshots = []
    for i, cutoff in enumerate(windows):
        snap = compute_snapshot(all_analyzed, cutoff, cfg)
        snapshots.append(snap)
        s = snap["overall_sentiment"]
        emoji = {"偏多": "🟢", "偏空": "🔴", "观望为主": "🟡", "分歧": "🟠"}.get(s, "⚪")
        print(
            f"  [{cutoff.split(' ')[1]}] {emoji}{s} | "
            f"消息:{snap['total_messages']} 群:{snap['active_groups']} | "
            f"股票热点{len(snap['top10_stocks'])} 板块热点{len(snap['top8_sectors'])}",
            flush=True
        )

    # 输出
    day_data = {"date": date_str, "total_msgs": total, "snapshots": snapshots}
    data_dir.mkdir(parents=True, exist_ok=True)
    out_path = data_dir / f"day_{date_str}.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(day_data, f, ensure_ascii=False, indent=2, default=str)
    print(f"\n💾 回放数据: {out_path}", flush=True)
    return day_data


def _build_windows(date_str):
    """构建全天时间窗口：交易时段5分钟，其余30分钟"""
    windows = []
    # 09:00 - 11:30
    h, m = 9, 0
    while h < 11 or (h == 11 and m <= 30):
        windows.append(f"{date_str} {h:02d}:{m:02d}")
        m += 5
        if m >= 60:
            h += 1
            m = 0
    # 11:30 - 13:00 (午休30分钟)
    h, m = 11, 30
    while h < 13:
        windows.append(f"{date_str} {h:02d}:{m:02d}")
        m += 30
        if m >= 60:
            h += 1
            m = 0
    # 13:00 - 15:00
    h, m = 13, 0
    while h < 15:
        windows.append(f"{date_str} {h:02d}:{m:02d}")
        m += 5
        if m >= 60:
            h += 1
            m = 0
    windows.append(f"{date_str} 15:00")
    # 15:00 - 16:00
    h, m = 15, 0
    while h < 16:
        m += 30
        if m >= 60:
            h += 1
            m = 0
        if h < 16:
            windows.append(f"{date_str} {h:02d}:{m:02d}")
    windows.append(f"{date_str} 16:00")
    return windows


def push_to_cloud(cfg, date_str, data_dir=None):
    """推送数据到云端（latest + day）"""
    if data_dir is None:
        data_dir = Path(cfg["server"]["data_dir"])

    cloud_cfg = cfg.get("cloud", {})
    if not cloud_cfg.get("enabled", False):
        print("  ☁️ 云端同步未启用", flush=True)
        return

    base_url = cloud_cfg.get("base_url", "").rstrip("/")
    if not base_url:
        print("  ☁️ 云端地址未配置", flush=True)
        return

    timeout = cloud_cfg.get("timeout", 30)
    push_mode = cloud_cfg.get("push_mode", "both")
    import urllib.request, urllib.error

    def _push(url, payload, label):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST")
        try:
            resp = urllib.request.urlopen(req, timeout=timeout)
            print(f"  ☁️ {label} → 成功 ({resp.status}, {len(data)//1024}KB)", flush=True)
            return True
        except urllib.error.HTTPError as e:
            print(f"  ☁️ {label} → HTTP {e.code}: {e.read().decode('utf-8','replace')[:200]}", flush=True)
            return False
        except Exception as e:
            print(f"  ☁️ {label} → 失败: {e}", flush=True)
            return False

    # 推送 latest
    if push_mode in ("both", "latest"):
        latest_file = data_dir / "latest.json"
        if latest_file.exists():
            with open(latest_file, encoding="utf-8") as f:
                latest_data = json.load(f)
            _push(f"{base_url}/api/upload/latest", latest_data, "latest")
        else:
            print(f"  ☁️ latest.json 不存在，跳过", flush=True)

    # 推送 day
    if push_mode in ("both", "day"):
        day_file = data_dir / f"day_{date_str}.json"
        if day_file.exists():
            with open(day_file, encoding="utf-8") as f:
                day_data = json.load(f)
            _push(f"{base_url}/api/upload/day/{date_str}", day_data, f"day_{date_str}")
        else:
            print(f"  ☁️ day_{date_str}.json 不存在，跳过", flush=True)


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "replay":
        date = sys.argv[2] if len(sys.argv) > 2 else datetime.now(CST).strftime("%Y-%m-%d")
        collect_replay(date)
    else:
        result = collect_live()
        s = result["overall_sentiment"]
        top = result.get("top10_stocks", [])
        print(f"[{result['time']}] {s} | 消息{result['total_messages']} 群{result['active_groups']}")
        if top:
            print(f"  Top1: {top[0]['code']} {top[0]['name']} score={top[0]['score']}")
