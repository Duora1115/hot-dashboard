#!/usr/bin/env python3
"""
晨报数据生成 — 从快照数据 + 行情数据组装完整 ReportData
分析文本使用模板生成，预留 LLM 接口。
"""

from backend.indicators import compute_all


class AnalysisGenerator:
    """分析文本生成器。当前用模板，未来可子类化为 LLM 调用。"""

    def generate_sector_analysis(self, sector: dict, snapshots: list[dict]) -> str:
        """板块深度分析文本"""
        name = sector.get("n", "")
        mc = sector.get("mc", 0)
        gc = sector.get("gc", 0)
        sc = sector.get("sc", 0)
        gd = sector.get("gd", [])

        # 统计各群提及次数
        group_mentions = sorted(gd, key=lambda g: g.get("c", 0), reverse=True)
        top_groups = "、".join(f"{g['g']}({g['c']}条)" for g in group_mentions[:3])

        # 从群消息提取讨论要点
        discussion_points = []
        for g in gd[:3]:
            for m in g.get("m", [])[:2]:
                text = m.get("x", "")
                if text and len(text) > 5:
                    discussion_points.append(text[:30])

        analysis = f"{name}板块热度{sc}，提及{mc}次，覆盖{gc}个群。"
        if top_groups:
            analysis += f"主要讨论来自{top_groups}。"
        if discussion_points:
            analysis += f"群内关注焦点：{'；'.join(discussion_points[:3])}。"
        return analysis

    def generate_stock_comment(self, stock: dict, snapshots: list[dict]) -> str:
        """个股点评文本"""
        name = stock.get("n", "")
        sc = stock.get("sc", 0)
        bu = stock.get("bu", 0)
        be = stock.get("be", 0)
        mc = stock.get("mc", 0)
        secs = stock.get("sec", [])

        comment = f"{name}热度{sc}，被提及{mc}次。"
        if bu > be * 1.5:
            comment += "群内看多情绪明显占优。"
        elif be > bu * 1.2:
            comment += "群内看空声音较多，注意风险。"
        elif bu > 0 or be > 0:
            comment += "多空分歧较大。"
        if secs:
            comment += f"关联板块：{'、'.join(secs[:2])}。"
        return comment

    def generate_overview(self, stats: dict) -> str:
        """市场综述文本"""
        date = stats.get("date", "")
        total_msgs = stats.get("total_messages", 0)
        active_groups = stats.get("active_groups", 0)
        sentiment = stats.get("sentiment", "")
        bull_pct = stats.get("bull_pct", 0)
        top_sectors = stats.get("top_sectors", [])
        act = stats.get("act", {})

        sector_str = "、".join(f"{s['n']}（热度{s['sc']}）" for s in top_sectors[:3])
        buy_count = act.get("买入信号", 0)
        sell_count = act.get("卖出信号", 0)
        risk_count = act.get("风险提示", 0)

        overview = (
            f"{date}，A股市场整体呈现{sentiment}态势。"
            f"根据对25个飞书投资群的实时监测，今日共采集{total_msgs:,}条消息，"
            f"涉及{active_groups}个活跃群。"
            f"市场情绪整体{sentiment}（看多{bull_pct}%），"
            f"热点板块集中在{sector_str if sector_str else '多个方向'}。"
            f"操作信号方面，买入信号（{buy_count}次）"
        )
        if buy_count > sell_count:
            overview += f"明显多于卖出信号（{sell_count}次），显示市场参与者的积极情绪。"
        elif sell_count > buy_count:
            overview += f"少于卖出信号（{sell_count}次），市场趋于谨慎。"
        else:
            overview += f"与卖出信号（{sell_count}次）持平。"
        if risk_count > 10:
            overview += f"风险提示信号（{risk_count}次）值得关注。"
        return overview

    def generate_recommendations(self, early_sectors: list[dict], late_sectors: list[dict], act: dict, sentiment: str) -> dict:
        """操作建议"""
        # 板块轮动：对比早/晚板块排名变化
        early_names = [s["n"] for s in early_sectors]
        late_names = [s["n"] for s in late_sectors]

        rotations = []
        for name in late_names[:5]:
            if name in early_names:
                early_rank = early_names.index(name)
                late_rank = late_names.index(name)
                if early_rank - late_rank >= 2:
                    rotations.append({"fromSector": "低位板块", "toSector": name,
                                      "reason": f"排名从第{early_rank+1}升至第{late_rank+1}，资金流入明显"})

        # 找出排名下降的板块
        declining = []
        for name in early_names[:5]:
            if name in late_names:
                early_rank = early_names.index(name)
                late_rank = late_names.index(name)
                if late_rank - early_rank >= 2:
                    declining.append(name)

        buy_count = act.get("买入信号", 0)
        sell_count = act.get("卖出信号", 0)
        risk_count = act.get("风险提示", 0)

        # 策略判定
        if buy_count > sell_count * 1.5:
            strategy, score = "aggressive", 75
        elif buy_count > sell_count:
            strategy, score = "moderate", 60
        else:
            strategy, score = "conservative", 40

        risk_warnings = []
        if risk_count > 15:
            risk_warnings.append(f"风险提示信号较多（{risk_count}次），追高需谨慎")
        if declining:
            risk_warnings.append(f"{'、'.join(declining)}等板块热度下降，注意资金流出")
        risk_warnings.append("关注量能持续性，缩量回调时需控制仓位")

        watch_points = [f"{s['n']}板块龙头持续性" for s in late_sectors[:3]]
        watch_points.append("成交量能否维持活跃水平")

        detailed = []
        for s in late_sectors[:3]:
            detailed.append(f"{s['n']}板块热度{s['sc']}，{'保持关注' if s.get('sc', 0) > 80 else '可逢低关注'}")
        if sentiment == "偏多":
            detailed.append("整体情绪偏多，可适当提高仓位")
        elif sentiment == "偏空":
            detailed.append("整体情绪偏空，建议控制仓位，等待企稳信号")
        else:
            detailed.append("情绪分歧，建议观望为主，精选个股操作")

        if not rotations:
            rotations = [{"fromSector": late_sectors[-1]["n"] if late_sectors else "",
                          "toSector": late_sectors[0]["n"] if late_sectors else "",
                          "reason": "板块间热度差异明显，关注资金流向"}]

        return {
            "strategy": strategy,
            "score": score,
            "sectorRotations": rotations[:3],
            "riskWarnings": risk_warnings,
            "watchPoints": watch_points,
            "detailed": detailed,
        }


# 全局实例
_generator = AnalysisGenerator()


def _get_key_time_snapshots(snapshots: list[dict], key_times: list[str]) -> list[dict]:
    """在快照序列中找最接近关键时间点的快照"""
    if not snapshots:
        return []
    result = []
    for kt in key_times:
        best = None
        best_diff = float("inf")
        for snap in snapshots:
            t = snap.get("t", "")
            time_part = t.split(" ")[1] if " " in t else t
            # 计算时间差（分钟）
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
            result.append(best)
    return result


def _extract_news(snapshots: list[dict]) -> list[dict]:
    """从群消息摘要中提取新闻条目"""
    news = []
    seen_texts = set()
    keywords = {
        "policy": ["政策", "监管", "央行", "证监会", "国务院", "发改委"],
        "macro": ["GDP", "PMI", "经济", "通胀", "利率", "汇率", "数据"],
        "company": ["公告", "业绩", "分红", "增发", "回购", "重组", "中标"],
    }

    for snap in snapshots:
        time_part = snap.get("t", "").split(" ")[1] if " " in snap.get("t", "") else ""
        sentiment = snap.get("sent", "观望为主")
        for sec in snap.get("sec", []):
            for gd in sec.get("gd", []):
                for m in gd.get("m", []):
                    text = m.get("x", "")
                    if not text or len(text) < 8:
                        continue
                    # 去重
                    short = text[:20]
                    if short in seen_texts:
                        continue
                    seen_texts.add(short)

                    # 分类
                    category = "industry"
                    for cat, kws in keywords.items():
                        if any(kw in text for kw in kws):
                            category = cat
                            break

                    # 影响判定
                    if sentiment == "偏多":
                        impact = "positive"
                    elif sentiment == "偏空":
                        impact = "negative"
                    else:
                        impact = "neutral"

                    news.append({
                        "id": f"n{len(news)+1}",
                        "category": category,
                        "title": text[:40],
                        "summary": text[:80],
                        "impact": impact,
                        "source": gd.get("g", ""),
                        "time": m.get("t", time_part),
                        "isImportant": len(text) > 30,
                    })
                    if len(news) >= 10:
                        break
                if len(news) >= 10:
                    break
            if len(news) >= 10:
                break
        if len(news) >= 10:
            break
    return news


def generate_report(date_str: str, day_data: dict, market_indices: list[dict] | None = None,
                    advance_decline: dict | None = None) -> dict:
    """生成完整晨报数据。
    date_str: 日期字符串
    day_data: /api/day/{date} 的原始返回（含 meta + snapshots）
    market_indices: fetch_indices() 的返回值（可为 None）
    advance_decline: fetch_advance_decline() 的返回值（可为 None）
    """
    snapshots = day_data.get("snapshots", [])
    if not snapshots:
        return _empty_report(date_str)

    first_snap = snapshots[0]
    last_snap = snapshots[-1]
    meta = day_data.get("meta", {})

    # --- overviewText ---
    sd = last_snap.get("sd", {})
    total_sent = sd.get("bu", 0) + sd.get("be", 0) + sd.get("ne", 0)
    bull_pct = round(sd.get("bu", 0) / total_sent * 100) if total_sent > 0 else 0
    overview = _generator.generate_overview({
        "date": date_str,
        "total_messages": meta.get("message_count", 0),
        "active_groups": last_snap.get("grp", 0),
        "sentiment": last_snap.get("sent", "观望为主"),
        "bull_pct": bull_pct,
        "top_sectors": last_snap.get("sec", [])[:5],
        "act": last_snap.get("act", {}),
    })

    # --- marketIndices ---
    market_indices = market_indices or []

    # --- advanceDecline ---
    if advance_decline:
        ad = advance_decline
    else:
        # 从 stk 数据估算
        bu_total = sum(s.get("bu", 0) for s in last_snap.get("stk", []))
        be_total = sum(s.get("be", 0) for s in last_snap.get("stk", []))
        est_total = bu_total + be_total
        est_rising_pct = (bu_total / est_total * 100) if est_total > 0 else 50
        ad = {
            "rising": int(bu_total * 30), "falling": int(be_total * 30),
            "unchanged": max(0, 5100 - int((bu_total + be_total) * 30)),
            "limitUp": max(0, bu_total // 3), "limitDown": max(0, be_total // 5),
            "risingPercent": round(est_rising_pct, 1),
        }

    # --- volumeData ---
    hourly: dict[str, int] = {}
    for snap in snapshots:
        t = snap.get("t", "")
        hour = t.split(" ")[1][:2] + ":00" if " " in t else "00:00"
        hourly[hour] = hourly.get(hour, 0) + snap.get("msg", 0)
    hourly_data = [{"time": k, "volume": v} for k, v in sorted(hourly.items())]
    peak = max(hourly_data, key=lambda x: x["volume"]) if hourly_data else {"time": "-", "volume": 0}
    total_vol = sum(s.get("msg", 0) for s in snapshots)
    volume_data = {
        "totalVolume": total_vol,
        "prevVolume": 0,
        "changePercent": 0,
        "hourlyData": hourly_data,
        "peakHour": peak["time"],
        "peakVolume": peak["volume"],
        "summary": f"今日消息总量{total_vol:,}条，高峰时段{peak['time']}（{peak['volume']:,}条/小时）。",
    }

    # --- hotSectors ---
    hot_sectors = []
    for sector in last_snap.get("sec", []):
        name = sector["n"]
        # trend
        first_sec = next((s for s in first_snap.get("sec", []) if s["n"] == name), None)
        first_sc = first_sec["sc"] if first_sec else 0
        last_sc = sector["sc"]
        if first_sc > 0:
            trend = "up" if last_sc > first_sc * 1.1 else "down" if last_sc < first_sc * 0.9 else "flat"
        else:
            trend = "up"
        trend_desc = {"up": "热度上升", "down": "热度下降", "flat": "热度持平"}[trend]
        # heatHistory
        heat_history = []
        for snap in snapshots:
            sec = next((s for s in snap.get("sec", []) if s["n"] == name), None)
            heat_history.append(sec["sc"] if sec else 0)
        # topStocks
        top_stocks = []
        for stock in last_snap.get("stk", []):
            if name in stock.get("sec", []):
                top_stocks.append({"name": stock["n"], "code": stock["c"], "heat": stock["sc"]})
        analysis = _generator.generate_sector_analysis(sector, snapshots)
        hot_sectors.append({
            "name": name, "heatScore": last_sc, "mentionCount": sector.get("mc", 0),
            "groupCount": sector.get("gc", 0), "trend": trend, "trendDesc": trend_desc,
            "analysis": analysis, "topStocks": top_stocks[:5], "heatHistory": heat_history,
        })

    # --- hotStocks ---
    hot_stocks = []
    for rank, stock in enumerate(last_snap.get("stk", []), 1):
        first_stk = next((s for s in first_snap.get("stk", []) if s["c"] == stock["c"]), None)
        first_sc = first_stk["sc"] if first_stk else 0
        last_sc = stock["sc"]
        if first_sc > 0:
            trend = "up" if last_sc > first_sc * 1.1 else "down" if last_sc < first_sc * 0.9 else "flat"
        else:
            trend = "up"
        secs = stock.get("sec", [])
        comment = _generator.generate_stock_comment(stock, snapshots)
        hot_stocks.append({
            "rank": rank, "name": stock["n"], "code": stock["c"],
            "heatScore": last_sc, "bullCount": stock.get("bu", 0),
            "bearCount": stock.get("be", 0), "sector": secs[0] if secs else "",
            "trend": trend, "comment": comment,
        })

    # --- sentimentData ---
    bear_pct = round(sd.get("be", 0) / total_sent * 100) if total_sent > 0 else 0
    neutral_pct = round(sd.get("ne", 0) / total_sent * 100) if total_sent > 0 else 0
    overall = last_snap.get("sent", "观望为主")
    label_map = {"偏多": "bullish", "偏空": "bearish", "观望为主": "neutral", "分歧": "neutral"}
    drivers = [f"{s['n']}板块持续活跃" for s in last_snap.get("sec", [])[:3]]
    sentiment_data = {
        "overall": overall, "overallLabel": label_map.get(overall, "neutral"),
        "bullPercent": bull_pct, "bearPercent": bear_pct, "neutralPercent": neutral_pct,
        "extremeEuphoria": sd.get("eh", 0), "extremePessimism": sd.get("el", 0),
        "drivers": drivers,
        "alert": "午后出现分歧迹象，需关注看空比例变化" if overall == "分歧" else None,
    }

    # --- technicalData (from market K-line, or fallback) ---
    try:
        from backend.market import fetch_kline
        kline = fetch_kline("1.000001", 60)
        technical_data = compute_all(kline) if kline else _fallback_technical(last_snap)
    except Exception:
        technical_data = _fallback_technical(last_snap)

    # --- actionRecommendations ---
    early_idx = max(0, len(snapshots) // 4)
    early_sectors = snapshots[early_idx].get("sec", [])
    action_recs = _generator.generate_recommendations(
        early_sectors, last_snap.get("sec", []),
        last_snap.get("act", {}), last_snap.get("sent", ""))

    # --- sentimentTimeline ---
    key_times = ["09:30", "10:00", "10:30", "11:00", "11:30", "13:30", "14:00", "14:30", "15:00"]
    key_labels = ["开盘", "早盘升温", "盘中观察", "午前收盘", "午间收盘",
                  "午后开盘", "午后分化", "尾盘走势", "收盘"]
    key_snaps = _get_key_time_snapshots(snapshots, key_times)
    timeline = []
    for i, snap in enumerate(key_snaps):
        s = snap.get("sd", {})
        t_total = s.get("bu", 0) + s.get("be", 0) + s.get("ne", 0)
        if t_total > 0:
            bull_bar = round(s.get("bu", 0) / t_total * 100)
            bear_bar = round(s.get("be", 0) / t_total * 100)
            neutral_bar = 100 - bull_bar - bear_bar
        else:
            bull_bar = bear_bar = neutral_bar = 33
        timeline.append({
            "time": key_times[i] if i < len(key_times) else snap.get("t", "").split(" ")[1],
            "label": key_labels[i] if i < len(key_labels) else "",
            "bullBar": bull_bar, "bearBar": bear_bar, "neutralBar": neutral_bar,
            "overall": snap.get("sent", "观望为主"),
        })

    # --- newsItems ---
    news_items = _extract_news(snapshots)

    return {
        "date": date_str,
        "marketIndices": market_indices,
        "advanceDecline": ad,
        "volumeData": volume_data,
        "hotSectors": hot_sectors,
        "hotStocks": hot_stocks,
        "newsItems": news_items,
        "sentimentData": sentiment_data,
        "technicalData": technical_data,
        "actionRecommendations": action_recs,
        "sentimentTimeline": timeline,
        "overviewText": overview,
    }


def _fallback_technical(snap: dict) -> dict:
    """无行情数据时的简化技术分析"""
    sent = snap.get("sent", "观望为主")
    signal = "bull" if sent == "偏多" else "bear" if sent == "偏空" else "neutral"
    return {
        "observations": [f"市场情绪{sent}，群消息活跃度{'较高' if snap.get('msg', 0) > 100 else '一般'}"],
        "supportLevels": [], "resistanceLevels": [],
        "patterns": [],
        "indicatorSummaries": [
            {"name": "情绪指标", "value": f"群消息情绪{sent}", "signal": signal},
        ],
        "signals": [{"name": "群消息信号", "count": 1, "sectors": []}],
    }


def _empty_report(date_str: str) -> dict:
    """空数据时的默认报告"""
    return {
        "date": date_str, "marketIndices": [], "advanceDecline": None,
        "volumeData": {"totalVolume": 0, "prevVolume": 0, "changePercent": 0,
                       "hourlyData": [], "peakHour": "-", "peakVolume": 0, "summary": "暂无数据"},
        "hotSectors": [], "hotStocks": [], "newsItems": [],
        "sentimentData": {"overall": "暂无数据", "overallLabel": "neutral",
                          "bullPercent": 0, "bearPercent": 0, "neutralPercent": 0,
                          "extremeEuphoria": 0, "extremePessimism": 0, "drivers": [], "alert": None},
        "technicalData": _fallback_technical({}),
        "actionRecommendations": {"strategy": "moderate", "score": 50, "sectorRotations": [],
                                  "riskWarnings": ["数据不足，建议观望"], "watchPoints": [], "detailed": []},
        "sentimentTimeline": [],
        "overviewText": f"{date_str}暂无监测数据。",
    }
