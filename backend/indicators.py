#!/usr/bin/env python3
"""
技术指标计算 — MACD, RSI, KDJ, 布林带
纯计算模块，无网络请求。
"""

import math


def _ema(data: list[float], period: int) -> list[float]:
    """指数移动平均"""
    if not data:
        return []
    multiplier = 2 / (period + 1)
    result = [data[0]]
    for i in range(1, len(data)):
        result.append((data[i] - result[-1]) * multiplier + result[-1])
    return result


def compute_macd(closes: list[float], fast: int = 12, slow: int = 26, signal: int = 9) -> dict:
    """MACD 指标。返回 {dif, dea, macd_hist, signal, description}"""
    if len(closes) < slow:
        return {"dif": 0, "dea": 0, "macd_hist": 0, "signal": "neutral",
                "description": "数据不足，无法计算MACD"}
    ema_fast = _ema(closes, fast)
    ema_slow = _ema(closes, slow)
    dif = [f - s for f, s in zip(ema_fast, ema_slow)]
    dea = _ema(dif, signal)
    hist = [(d - e) * 2 for d, e in zip(dif, dea)]

    cur_dif, cur_dea, cur_hist = dif[-1], dea[-1], hist[-1]
    prev_hist = hist[-2] if len(hist) >= 2 else 0

    # 信号判定
    if cur_dif > cur_dea and prev_hist <= 0:
        sig, desc = "bull", "MACD金叉，短线看多"
    elif cur_dif < cur_dea and prev_hist >= 0:
        sig, desc = "bear", "MACD死叉，短线看空"
    elif cur_hist > 0:
        sig, desc = "bull", f"MACD红柱扩大（DIF:{cur_dif:.2f}）"
    else:
        sig, desc = "bear", f"MACD绿柱扩大（DIF:{cur_dif:.2f}）"

    return {"dif": round(cur_dif, 2), "dea": round(cur_dea, 2),
            "macd_hist": round(cur_hist, 2), "signal": sig, "description": desc}


def compute_rsi(closes: list[float], period: int = 14) -> dict:
    """RSI 指标。返回 {value, signal, description}"""
    if len(closes) < period + 1:
        return {"value": 50, "signal": "neutral", "description": "数据不足"}
    gains, losses = [], []
    for i in range(1, len(closes)):
        diff = closes[i] - closes[i - 1]
        gains.append(max(0, diff))
        losses.append(max(0, -diff))

    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period
    for i in range(period, len(gains)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period

    if avg_loss == 0:
        rsi = 100.0
    else:
        rs = avg_gain / avg_loss
        rsi = 100 - (100 / (1 + rs))

    if rsi > 70:
        sig, desc = "bear", f"RSI={rsi:.1f}，超买区域，注意回调风险"
    elif rsi < 30:
        sig, desc = "bull", f"RSI={rsi:.1f}，超卖区域，关注反弹机会"
    else:
        sig, desc = "neutral", f"RSI={rsi:.1f}，处于中性区域"

    return {"value": round(rsi, 1), "signal": sig, "description": desc}


def compute_kdj(highs: list[float], lows: list[float], closes: list[float], n: int = 9) -> dict:
    """KDJ 指标。返回 {k, d, j, signal, description}"""
    if len(closes) < n:
        return {"k": 50, "d": 50, "j": 50, "signal": "neutral", "description": "数据不足"}
    k_val, d_val = 50.0, 50.0
    for i in range(n - 1, len(closes)):
        h_max = max(highs[i - n + 1:i + 1])
        l_min = min(lows[i - n + 1:i + 1])
        if h_max == l_min:
            rsv = 50.0
        else:
            rsv = (closes[i] - l_min) / (h_max - l_min) * 100
        k_val = 2 / 3 * k_val + 1 / 3 * rsv
        d_val = 2 / 3 * d_val + 1 / 3 * k_val
    j_val = 3 * k_val - 2 * d_val

    if j_val > 100:
        sig, desc = "bear", f"KDJ J值={j_val:.1f}，超买区域"
    elif j_val < 0:
        sig, desc = "bull", f"KDJ J值={j_val:.1f}，超卖区域"
    else:
        sig, desc = "neutral", f"KDJ K={k_val:.1f} D={d_val:.1f} J={j_val:.1f}"

    return {"k": round(k_val, 1), "d": round(d_val, 1), "j": round(j_val, 1),
            "signal": sig, "description": desc}


def compute_boll(closes: list[float], period: int = 20) -> dict:
    """布林带。返回 {upper, mid, lower, position, signal, description}"""
    if len(closes) < period:
        return {"upper": 0, "mid": 0, "lower": 0, "position": "mid",
                "signal": "neutral", "description": "数据不足"}
    recent = closes[-period:]
    mid = sum(recent) / period
    std = math.sqrt(sum((x - mid) ** 2 for x in recent) / period)
    upper = mid + 2 * std
    lower = mid - 2 * std
    cur = closes[-1]

    if cur > upper:
        pos, sig, desc = "above_upper", "bear", f"价格突破布林上轨（{upper:.2f}），短期偏强但注意回调"
    elif cur < lower:
        pos, sig, desc = "below_lower", "bull", f"价格跌破布林下轨（{lower:.2f}），短期偏弱但关注反弹"
    elif cur > mid:
        pos, sig, desc = "above_mid", "neutral", "价格运行在布林中轨上方"
    else:
        pos, sig, desc = "below_mid", "neutral", "价格运行在布林中轨下方"

    return {"upper": round(upper, 2), "mid": round(mid, 2), "lower": round(lower, 2),
            "position": pos, "signal": sig, "description": desc}


def _find_support_resistance(kline: list[dict], window: int = 5) -> tuple[list[dict], list[dict]]:
    """从K线中识别支撑位和阻力位（局部极值）"""
    if len(kline) < window * 2 + 1:
        return [], []
    highs = [k["high"] for k in kline]
    lows = [k["low"] for k in kline]
    cur_price = kline[-1]["close"]

    support_levels = []
    resistance_levels = []

    for i in range(window, len(kline) - window):
        # 局部低点 → 支撑
        if lows[i] == min(lows[i - window:i + window + 1]):
            level = lows[i]
            if level < cur_price:
                support_levels.append({"level": f"{level:.2f}", "note": f"近期低点支撑"})
        # 局部高点 → 阻力
        if highs[i] == max(highs[i - window:i + window + 1]):
            level = highs[i]
            if level > cur_price:
                resistance_levels.append({"level": f"{level:.2f}", "note": f"近期高点阻力"})

    # 去重并排序，各取前3
    seen_s, seen_r = set(), set()
    unique_s, unique_r = [], []
    for s in sorted(support_levels, key=lambda x: float(x["level"]), reverse=True):
        if s["level"] not in seen_s:
            seen_s.add(s["level"])
            unique_s.append(s)
    for r in sorted(resistance_levels, key=lambda x: float(x["level"])):
        if r["level"] not in seen_r:
            seen_r.add(r["level"])
            unique_r.append(r)
    return unique_s[:3], unique_r[:3]


def _detect_patterns(kline: list[dict]) -> list[str]:
    """简化版K线形态识别"""
    if len(kline) < 5:
        return []
    patterns = []
    closes = [k["close"] for k in kline]
    volumes = [k["volume"] for k in kline]

    # 连阳上攻
    up_days = 0
    for i in range(len(closes) - 1, -1, -1):
        if closes[i] > closes[i - 1] if i > 0 else False:
            up_days += 1
        else:
            break
    if up_days >= 3:
        patterns.append(f"近{up_days}日连阳上攻")

    # 放量突破前高
    recent_high = max(k["high"] for k in kline[-10:-1]) if len(kline) >= 10 else 0
    if closes[-1] > recent_high and volumes[-1] > sum(volumes[-6:-1]) / 5 * 1.3:
        patterns.append("放量突破近期高点")

    # V型反转
    if len(closes) >= 10:
        mid = len(closes) // 2
        first_half = closes[:mid]
        second_half = closes[mid:]
        min_idx = first_half.index(min(first_half))
        if min_idx > len(first_half) * 0.5:
            if second_half[-1] > first_half[0]:
                patterns.append("V型反转形态")

    return patterns


def compute_all(kline: list[dict]) -> dict:
    """一次性计算所有技术指标，生成完整 TechnicalData。
    kline: [{date, open, close, high, low, volume}]
    返回格式匹配前端 TechnicalData 接口。
    """
    if not kline or len(kline) < 5:
        return {
            "observations": ["K线数据不足，暂无法进行技术分析"],
            "supportLevels": [], "resistanceLevels": [],
            "patterns": [], "indicatorSummaries": [],
            "signals": [],
        }

    closes = [k["close"] for k in kline]
    highs = [k["high"] for k in kline]
    lows = [k["low"] for k in kline]

    macd = compute_macd(closes)
    rsi = compute_rsi(closes)
    kdj = compute_kdj(highs, lows, closes)
    boll = compute_boll(closes)
    support, resistance = _find_support_resistance(kline)
    patterns = _detect_patterns(kline)

    cur_price = closes[-1]
    observations = []
    if macd["signal"] == "bull":
        observations.append(f"MACD显示多头信号：{macd['description']}")
    elif macd["signal"] == "bear":
        observations.append(f"MACD显示空头信号：{macd['description']}")
    observations.append(f"当前价格 {cur_price:.2f}，{boll['description']}")
    if patterns:
        observations.extend(patterns)

    indicator_summaries = [
        {"name": "MACD", "value": macd["description"], "signal": macd["signal"]},
        {"name": "RSI", "value": rsi["description"], "signal": rsi["signal"]},
        {"name": "KDJ", "value": kdj["description"], "signal": kdj["signal"]},
        {"name": "布林带", "value": boll["description"], "signal": boll["signal"]},
    ]

    # 均线系统
    if len(closes) >= 20:
        ma5 = sum(closes[-5:]) / 5
        ma10 = sum(closes[-10:]) / 10
        ma20 = sum(closes[-20:]) / 20
        if ma5 > ma10 > ma20:
            indicator_summaries.append({"name": "均线系统", "value": "5日>10日>20日，多头排列", "signal": "bull"})
        elif ma5 < ma10 < ma20:
            indicator_summaries.append({"name": "均线系统", "value": "5日<10日<20日，空头排列", "signal": "bear"})
        else:
            indicator_summaries.append({"name": "均线系统", "value": "均线交织，方向不明", "signal": "neutral"})

    # 技术信号统计
    bull_count = sum(1 for ind in indicator_summaries if ind["signal"] == "bull")
    bear_count = sum(1 for ind in indicator_summaries if ind["signal"] == "bear")
    signals = []
    if bull_count >= 3:
        signals.append({"name": "多头信号", "count": bull_count, "sectors": []})
    if bear_count >= 3:
        signals.append({"name": "空头信号", "count": bear_count, "sectors": []})
    if patterns:
        signals.append({"name": "形态信号", "count": len(patterns), "sectors": []})

    return {
        "observations": observations,
        "supportLevels": support,
        "resistanceLevels": resistance,
        "patterns": patterns,
        "indicatorSummaries": indicator_summaries,
        "signals": signals,
    }
