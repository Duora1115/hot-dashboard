#!/usr/bin/env python3
"""
定时采集脚本 - 被 cron 调用
采集当前时刻热点，写入 data/latest.json 和 data/day_YYYY-MM-DD.json
"""

import sys
import os
from pathlib import Path

# 确保项目根目录在 path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.collector import load_config, collect_live, push_to_cloud

def main():
    cfg = load_config()
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    data_dir = os.path.join(base, cfg["server"]["data_dir"])

    result = collect_live(cfg, data_dir)
    date_str = result["time"][:10]
    time_str = result["time"]
    total_msgs = result["total_messages"]
    active_grps = result["active_groups"]
    sentiment = result["overall_sentiment"]
    top = result.get("top10_stocks", [])
    sectors = result.get("top8_sectors", [])
    actions = result.get("action_summary", {})
    sd = result.get("sentiment_detail", {})

    # ===== 简明日志（终端用）=====
    print(f"[{time_str}] {sentiment} | 消息{total_msgs} 群{active_grps}")
    if top:
        print(f"  Top1: {top[0]['code']} {top[0]['name']} score={top[0]['score']}")

    # ===== 丰富通知（推送给用户）=====
    emoji = {"偏多": "🟢", "偏空": "🔴", "观望为主": "🟡", "分歧": "🟠"}.get(sentiment, "⚪")

    lines = []
    lines.append(f"📊 热点采集 | {time_str}")
    lines.append(f"")
    lines.append(f"{emoji} 情绪：{sentiment} | 💬 {total_msgs}条消息 / {active_grps}个群")

    # 情绪细分
    if sd:
        bu = sd.get("bu", 0); be = sd.get("be", 0); ne = sd.get("ne", 0)
        eh = sd.get("eh", 0); el = sd.get("el", 0)
        total_s = bu + be + ne + eh + el or 1
        lines.append(f"   看多{bu}({round(bu/total_s*100)}%) 看空{be}({round(be/total_s*100)}%) 观望{ne}({round(ne/total_s*100)}%) 亢奋{eh} 悲观{el}")
    lines.append("")

    # 股票热点 Top5
    if top:
        lines.append(f"🏆 股票热点 Top5")
        for i, stk in enumerate(top[:5], 1):
            badge = ""
            if stk.get("action_count", 0) > 3:
                badge = " 🔥含操作建议"
            elif stk.get("bull", 0) > stk.get("bear", 0) * 2:
                badge = " 📈看多"
            elif stk.get("bear", 0) > stk.get("bull", 0) * 2:
                badge = " 📉看空"
            lines.append(f"   {i}. {stk['code']} {stk['name']} 热度{stk['score']}"
                         f" | {stk['mention_count']}次/{stk['group_count']}群"
                         f" | 多{stk['bull']}空{stk['bear']}{badge}")
        if len(top) > 5:
            others = ", ".join(f"{s['code']} {s['name']}" for s in top[5:8])
            lines.append(f"   ... {others}")
        lines.append("")

    # 板块热度 Top5
    if sectors:
        lines.append(f"🏭 板块热度 Top5")
        for i, sec in enumerate(sectors[:5], 1):
            lines.append(f"   {i}. {sec['name']} 热度{sec['score']}"
                         f" | {sec['mention_count']}次/{sec['group_count']}群")
        lines.append("")

    # 操作信号
    if actions:
        buy = actions.get("买入信号", 0)
        sell = actions.get("卖出信号", 0)
        hold = actions.get("持有建议", 0)
        warn = actions.get("风险提示", 0)
        lines.append(f"⚡ 操作信号")
        if buy > 0: lines.append(f"   🟢 买入信号 {buy}次")
        if sell > 0: lines.append(f"   🔴 卖出信号 {sell}次")
        if hold > 0: lines.append(f"   🟡 持有建议 {hold}次")
        if warn > 0: lines.append(f"   ⚠️ 风险提示 {warn}次")
        if buy == 0 and sell == 0 and hold == 0 and warn == 0:
            lines.append(f"   无明显信号")
        lines.append("")

    lines.append(f"☁️ 已同步至云端 · http://47.253.54.6:8765")
    print("\n---NOTIFY_START---")
    print("\n".join(lines))
    print("---NOTIFY_END---")

    # 云端同步
    push_to_cloud(cfg, date_str, Path(data_dir))

if __name__ == "__main__":
    main()
