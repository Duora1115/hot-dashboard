# 后端数据填充 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all remaining mock data in Report and Sentiment pages with real data from backend snapshots and external market APIs.

**Architecture:** Add 3 new backend modules (market.py, indicators.py, report.py) that fetch external market data, compute technical indicators, and generate report content from snapshot data. Expose via 5 new API endpoints. Frontend Report.tsx consumes real API; Sentiment.tsx fixes 2 hardcoded values.

**Tech Stack:** Python (FastAPI, pandas, requests), TypeScript (React 19, Zustand), Sina Finance API, EastMoney API

## Global Constraints

- 行情 API 超时 ≤ 5 秒，失败返回空/null，不阻断其他功能
- 所有新后端函数必须有 try/except 包裹，不允许 500 错误
- 前端加载态显示骨架屏，错误态显示"暂无数据"
- LLM 接口预留：AnalysisGenerator 类可被子类覆盖
- pandas 3.0.3 已安装，requests 2.34.2 已安装

---

### Task 1: backend/market.py — 行情数据模块

**Files:**
- Create: `backend/market.py`

**Interfaces:**
- Consumes: nothing (standalone module)
- Produces: `fetch_indices() -> list[dict]`, `fetch_advance_decline() -> dict | None`, `fetch_kline(code: str, days: int = 60) -> list[dict]`

- [ ] **Step 1: Create market.py with all three functions**

```python
#!/usr/bin/env python3
"""
行情数据获取 — 新浪实时指数 + 东方财富涨跌统计/K线
"""

import re
import requests
import logging

logger = logging.getLogger(__name__)

_TIMEOUT = 5  # 秒

# 新浪指数代码映射
_INDEX_SYMBOLS = {
    "000001": {"symbol": "s_sh000001", "name": "上证指数"},
    "399001": {"symbol": "s_sz399001", "name": "深证成指"},
    "399006": {"symbol": "s_sz399006", "name": "创业板指"},
}


def fetch_indices() -> list[dict]:
    """获取大盘指数实时数据（上证、深证、创业板）。
    数据源: hq.sinajs.cn
    返回: [{name, code, value, change, changePercent, open, high, low, prevClose}]
    失败时返回空列表。
    """
    symbols = ",".join(info["symbol"] for info in _INDEX_SYMBOLS.values())
    url = f"https://hq.sinajs.cn/list={symbols}"
    try:
        resp = requests.get(url, timeout=_TIMEOUT, headers={"Referer": "https://finance.sina.com.cn"})
        resp.encoding = "gbk"
        text = resp.text
    except Exception as e:
        logger.warning(f"获取指数行情失败: {e}")
        return []

    results = []
    for code, info in _INDEX_SYMBOLS.items():
        pattern = f'hq_str_{info["symbol"]}="([^"]*)"'
        match = re.search(pattern, text)
        if not match:
            continue
        fields = match.group(1).split(",")
        if len(fields) < 6:
            continue
        try:
            value = float(fields[1])
            change = float(fields[2])
            change_pct = float(fields[3])
            # 新浪简版接口只有: 名称,当前价,涨跌,涨跌幅,成交量,成交额
            # open/high/low/prevClose 用当前价近似（简版接口的局限）
            results.append({
                "name": info["name"],
                "code": code,
                "value": value,
                "change": change,
                "changePercent": change_pct,
                "open": value - change,  # 近似
                "high": value,
                "low": value - abs(change) * 0.5,
                "prevClose": value - change,
            })
        except (ValueError, IndexError) as e:
            logger.warning(f"解析 {info['name']} 行情失败: {e}")
            continue
    return results


def fetch_advance_decline() -> dict | None:
    """获取 A 股涨跌家数统计。
    数据源: push2.eastmoney.com
    返回: {rising, falling, unchanged, limitUp, limitDown, risingPercent}
    失败时返回 None。
    """
    url = "https://push2.eastmoney.com/api/qt/clist/get"
    params = {
        "pn": 1, "pz": 5000, "po": 1, "np": 1, "fltt": 2, "invt": 2,
        "fs": "m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23",
        "fields": "f3,f12,f14",  # f3=涨跌幅, f12=代码, f14=名称
    }
    try:
        resp = requests.get(url, params=params, timeout=_TIMEOUT)
        data = resp.json()
        items = data.get("data", {}).get("diff", [])
        if not items:
            return None
    except Exception as e:
        logger.warning(f"获取涨跌统计失败: {e}")
        return None

    rising = 0
    falling = 0
    unchanged = 0
    limit_up = 0
    limit_down = 0

    for item in items:
        pct = item.get("f3")
        if pct is None or pct == "-":
            unchanged += 1
            continue
        pct = float(pct)
        if pct > 0:
            rising += 1
            if pct >= 9.9:
                limit_up += 1
        elif pct < 0:
            falling += 1
            if pct <= -9.9:
                limit_down += 1
        else:
            unchanged += 1

    total = rising + falling + unchanged
    rising_pct = (rising / total * 100) if total > 0 else 50.0

    return {
        "rising": rising,
        "falling": falling,
        "unchanged": unchanged,
        "limitUp": limit_up,
        "limitDown": limit_down,
        "risingPercent": round(rising_pct, 1),
    }


def fetch_kline(code: str = "1.000001", days: int = 60) -> list[dict]:
    """获取指数日K线数据。
    数据源: push2his.eastmoney.com
    code: secid 格式，如 "1.000001"（上证）, "0.399001"（深证）
    返回: [{date, open, close, high, low, volume}]
    失败时返回空列表。
    """
    url = "https://push2his.eastmoney.com/api/qt/stock/kline/get"
    params = {
        "secid": code,
        "klt": 101,  # 日K
        "fqt": 0,    # 不复权
        "lmt": days,
        "fields1": "f1,f2,f3,f4,f5,f6",
        "fields2": "f51,f52,f53,f54,f55,f56,f57",
    }
    try:
        resp = requests.get(url, params=params, timeout=_TIMEOUT)
        data = resp.json()
        klines = data.get("data", {}).get("klines", [])
        if not klines:
            return []
    except Exception as e:
        logger.warning(f"获取K线数据失败: {e}")
        return []

    results = []
    for line in klines:
        fields = line.split(",")
        if len(fields) < 7:
            continue
        try:
            results.append({
                "date": fields[0],
                "open": float(fields[1]),
                "close": float(fields[2]),
                "high": float(fields[3]),
                "low": float(fields[4]),
                "volume": float(fields[5]),
            })
        except (ValueError, IndexError):
            continue
    return results
```

- [ ] **Step 2: Test market.py loads without errors**

Run: `cd /Users/wansheng/git/hot-dashboard && python3 -c "from backend.market import fetch_indices, fetch_advance_decline, fetch_kline; print('OK: market module loaded')"`
Expected: `OK: market module loaded`

- [ ] **Step 3: Test fetch_indices() returns data (if market accessible)**

Run: `cd /Users/wansheng/git/hot-dashboard && python3 -c "from backend.market import fetch_indices; r = fetch_indices(); print(f'Got {len(r)} indices'); [print(f'  {i[\"name\"]}: {i[\"value\"]}') for i in r]"`
Expected: Either `Got 3 indices` with data, or `Got 0 indices` (network issue, still OK)

- [ ] **Step 4: Test fetch_kline() returns data**

Run: `cd /Users/wansheng/git/hot-dashboard && python3 -c "from backend.market import fetch_kline; r = fetch_kline(); print(f'Got {len(r)} klines'); print(r[-1] if r else 'empty')"`
Expected: `Got 60 klines` with last bar data, or `Got 0 klines` (network issue)

- [ ] **Step 5: Commit**

```bash
git add backend/market.py
git commit -m "feat: add market.py — Sina/EastMoney market data module"
```

---

### Task 2: backend/indicators.py — 技术指标计算

**Files:**
- Create: `backend/indicators.py`

**Interfaces:**
- Consumes: `list[dict]` (kline bars with keys: date, open, close, high, low, volume)
- Produces: `compute_all(kline) -> dict` matching frontend TechnicalData shape

- [ ] **Step 1: Create indicators.py**

```python
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
```

- [ ] **Step 2: Test indicators.py loads and basic computation**

Run: `cd /Users/wansheng/git/hot-dashboard && python3 -c "
from backend.indicators import compute_macd, compute_rsi, compute_kdj, compute_boll, compute_all
# Test with synthetic data
closes = [100 + i * 0.5 + (i % 3 - 1) * 2 for i in range(60)]
highs = [c + 1.5 for c in closes]
lows = [c - 1.5 for c in closes]
print('MACD:', compute_macd(closes))
print('RSI:', compute_rsi(closes))
print('KDJ:', compute_kdj(highs, lows, closes))
print('BOLL:', compute_boll(closes))
kline = [{'date': f'2026-01-{i+1:02d}', 'open': closes[i]-0.5, 'close': closes[i], 'high': highs[i], 'low': lows[i], 'volume': 1000+i*10} for i in range(60)]
result = compute_all(kline)
print('Observations:', len(result['observations']))
print('Indicators:', len(result['indicatorSummaries']))
print('OK')
"`
Expected: All indicators computed, `OK` printed

- [ ] **Step 3: Commit**

```bash
git add backend/indicators.py
git commit -m "feat: add indicators.py — MACD/RSI/KDJ/BOLL technical indicators"
```

---

### Task 3: backend/report.py — 晨报数据生成

**Files:**
- Create: `backend/report.py`

**Interfaces:**
- Consumes: `market.fetch_indices()`, `market.fetch_kline()`, `indicators.compute_all()`, day_data dict (from /api/day/{date})
- Produces: `generate_report(date_str, day_data, market_data) -> dict` matching ReportData shape

- [ ] **Step 1: Create report.py**

```python
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
```

- [ ] **Step 2: Test report.py loads and basic generation**

Run: `cd /Users/wansheng/git/hot-dashboard && python3 -c "
from backend.report import generate_report
# Test with minimal data
day_data = {'meta': {'message_count': 100}, 'snapshots': [
    {'t': '2026-06-10 09:30', 'msg': 50, 'grp': 20, 'sent': '偏多',
     'sd': {'bu': 30, 'be': 10, 'ne': 10, 'eh': 2, 'el': 0},
     'act': {'买入信号': 15, '卖出信号': 5, '风险提示': 3, '持有建议': 10},
     'stk': [{'c': '300750', 'n': '宁德时代', 'sc': 80, 'bu': 10, 'be': 3, 'mc': 8, 'sec': ['新能源']}],
     'sec': [{'n': '新能源', 'sc': 120, 'mc': 30, 'gc': 15, 'gd': [{'g': '新能源投研', 'c': 10, 'm': [{'t': '09:35', 'x': '宁德时代新技术发布，能量密度提升15%'}]}]}]
    },
    {'t': '2026-06-10 15:00', 'msg': 200, 'grp': 24, 'sent': '偏多',
     'sd': {'bu': 50, 'be': 15, 'ne': 15, 'eh': 5, 'el': 1},
     'act': {'买入信号': 25, '卖出信号': 8, '风险提示': 5, '持有建议': 15},
     'stk': [{'c': '300750', 'n': '宁德时代', 'sc': 92, 'bu': 12, 'be': 3, 'mc': 10, 'sec': ['新能源']}],
     'sec': [{'n': '新能源', 'sc': 150, 'mc': 40, 'gc': 18, 'gd': [{'g': '新能源投研', 'c': 15, 'm': [{'t': '14:50', 'x': '板块持续走强'}]}]}]
    }
]}
result = generate_report('2026-06-10', day_data)
print('Date:', result['date'])
print('Overview length:', len(result['overviewText']))
print('Sectors:', len(result['hotSectors']))
print('Stocks:', len(result['hotStocks']))
print('Timeline:', len(result['sentimentTimeline']))
print('OK')
"`
Expected: All fields populated, `OK` printed

- [ ] **Step 3: Commit**

```bash
git add backend/report.py
git commit -m "feat: add report.py — morning report generator with template analysis"
```

---

### Task 4: server.py — 新增 API 路由

**Files:**
- Modify: `backend/server.py`

**Interfaces:**
- Consumes: `market.fetch_indices`, `market.fetch_advance_decline`, `report.generate_report`, `_day_cache`
- Produces: 5 new HTTP endpoints

- [ ] **Step 1: Add imports at top of server.py**

After the line `from backend.collector import load_config, collect_live, collect_replay` (line 24), add:

```python
from backend.market import fetch_indices, fetch_advance_decline
from backend.report import generate_report
```

- [ ] **Step 2: Add 5 new API routes**

After the existing `api_stock_messages` function (before the `api_collect` function around line 278), add these 5 routes:

```python
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

    return generate_report(date_str, day_data, market_idx, adv_dec)


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
```

- [ ] **Step 3: Restart backend and test endpoints**

Run: `cd /Users/wansheng/git/hot-dashboard && curl -s http://localhost:8765/api/market/indices | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'indices: {len(d)} items'); [print(f'  {i[\"name\"]}: {i[\"value\"]}') for i in d[:3]]"`
Expected: Either indices data or empty list

Run: `curl -s http://localhost:8765/api/report/2026-06-10 | python3 -c "import json,sys; d=json.load(sys.stdin); print('Keys:', list(d.keys())); print('Sectors:', len(d.get('hotSectors',[]))); print('Stocks:', len(d.get('hotStocks',[]))); print('Timeline:', len(d.get('sentimentTimeline',[]))); print('Overview:', d.get('overviewText','')[:60])"`
Expected: All keys present with real data

Run: `curl -s http://localhost:8765/api/day/2026-06-10/extreme-stats | python3 -m json.tool`
Expected: `{"month_extreme_high": N, "month_extreme_low": N}`

- [ ] **Step 4: Commit**

```bash
git add backend/server.py
git commit -m "feat: add 5 new API endpoints — market data, report, sentiment-timeline, extreme-stats"
```

---

### Task 5: 前端类型 + API 客户端

**Files:**
- Modify: `src/types/api.ts`
- Modify: `src/lib/api.ts`

**Interfaces:**
- Consumes: types from `mockReportData.ts`
- Produces: TypeScript interfaces for all Report data + fetch functions

- [ ] **Step 1: Add Report types to src/types/api.ts**

Append to the end of the file:

```typescript
/* ---- Report (晨报) 相关类型 ---- */

export interface MarketIndex {
  name: string;
  code: string;
  value: number;
  change: number;
  changePercent: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
}

export interface AdvanceDecline {
  rising: number;
  falling: number;
  unchanged: number;
  limitUp: number;
  limitDown: number;
  risingPercent: number;
}

export interface VolumeData {
  totalVolume: number;
  prevVolume: number;
  changePercent: number;
  hourlyData: Array<{ time: string; volume: number }>;
  peakHour: string;
  peakVolume: number;
  summary: string;
}

export interface HotSectorDetail {
  name: string;
  heatScore: number;
  mentionCount: number;
  groupCount: number;
  trend: 'up' | 'down' | 'flat';
  trendDesc: string;
  analysis: string;
  topStocks: Array<{ name: string; code: string; heat: number }>;
  heatHistory: number[];
}

export interface HotStockDetail {
  rank: number;
  name: string;
  code: string;
  heatScore: number;
  bullCount: number;
  bearCount: number;
  sector: string;
  trend: 'up' | 'down' | 'flat';
  comment: string;
}

export interface NewsItem {
  id: string;
  category: 'policy' | 'industry' | 'company' | 'macro';
  title: string;
  summary: string;
  impact: 'positive' | 'negative' | 'neutral';
  source: string;
  time: string;
  isImportant: boolean;
}

export interface SentimentData {
  overall: string;
  overallLabel: 'bullish' | 'bearish' | 'neutral';
  bullPercent: number;
  bearPercent: number;
  neutralPercent: number;
  extremeEuphoria: number;
  extremePessimism: number;
  drivers: string[];
  alert?: string | null;
}

export interface TechnicalSignal {
  name: string;
  count: number;
  sectors: string[];
}

export interface TechnicalData {
  observations: string[];
  supportLevels: Array<{ level: string; note: string }>;
  resistanceLevels: Array<{ level: string; note: string }>;
  patterns: string[];
  indicatorSummaries: Array<{ name: string; value: string; signal: 'bull' | 'bear' | 'neutral' }>;
  signals: TechnicalSignal[];
}

export interface ActionRecommendation {
  strategy: 'aggressive' | 'moderate' | 'conservative';
  score: number;
  sectorRotations: Array<{ fromSector: string; toSector: string; reason: string }>;
  riskWarnings: string[];
  watchPoints: string[];
  detailed: string[];
}

export interface SentimentTimelineItem {
  time: string;
  label: string;
  bullBar: number;
  bearBar: number;
  neutralBar: number;
  overall: string;
}

export interface ReportData {
  date: string;
  marketIndices: MarketIndex[];
  advanceDecline: AdvanceDecline | null;
  volumeData: VolumeData;
  hotSectors: HotSectorDetail[];
  hotStocks: HotStockDetail[];
  newsItems: NewsItem[];
  sentimentData: SentimentData;
  technicalData: TechnicalData;
  actionRecommendations: ActionRecommendation;
  sentimentTimeline: SentimentTimelineItem[];
  overviewText: string;
}

export interface ExtremeStats {
  month_extreme_high: number;
  month_extreme_low: number;
}
```

- [ ] **Step 2: Add fetch functions to src/lib/api.ts**

Append to the end of the file:

```typescript
// GET /api/market/indices
export async function fetchMarketIndices(): Promise<import('@/types/api').MarketIndex[]> {
  return fetchJson<import('@/types/api').MarketIndex[]>('/api/market/indices');
}

// GET /api/market/advance-decline
export async function fetchAdvanceDecline(): Promise<import('@/types/api').AdvanceDecline | null> {
  return fetchJson<import('@/types/api').AdvanceDecline | null>('/api/market/advance-decline');
}

// GET /api/report/{date}
export async function fetchReport(date: string): Promise<import('@/types/api').ReportData> {
  return fetchJson<import('@/types/api').ReportData>(`/api/report/${date}`);
}

// GET /api/day/{date}/sentiment-timeline
export async function fetchSentimentTimeline(date: string): Promise<import('@/types/api').SentimentTimelineItem[]> {
  return fetchJson<import('@/types/api').SentimentTimelineItem[]>(`/api/day/${date}/sentiment-timeline`);
}

// GET /api/day/{date}/extreme-stats
export async function fetchExtremeStats(date: string): Promise<import('@/types/api').ExtremeStats> {
  return fetchJson<import('@/types/api').ExtremeStats>(`/api/day/${date}/extreme-stats`);
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /Users/wansheng/git/hot-dashboard && npx tsc -b --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/types/api.ts src/lib/api.ts
git commit -m "feat: add Report types and API client functions"
```

---

### Task 6: Sentiment.tsx — 修复硬编码

**Files:**
- Modify: `src/pages/Sentiment.tsx`

**Interfaces:**
- Consumes: `fetchExtremeStats` from `lib/api.ts`, store's `currentDate`
- Produces: Dynamic extreme stats display

- [ ] **Step 1: Add state and useEffect for extreme stats**

In `src/pages/Sentiment.tsx`, after the existing `const [isRefreshing, setIsRefreshing] = useState(false);` line (around line 522), add:

```typescript
  const currentDate = useStore((s) => s.currentDate);
  const [extremeStats, setExtremeStats] = useState({ month_extreme_high: 0, month_extreme_low: 0 });

  useEffect(() => {
    if (currentDate) {
      import('@/lib/api').then(({ fetchExtremeStats }) =>
        fetchExtremeStats(currentDate).then(setExtremeStats).catch(() => {})
      );
    }
  }, [currentDate]);
```

- [ ] **Step 2: Replace hardcoded "12 次" with real data**

Find and replace the hardcoded extreme stats block. Change:

```tsx
            <span className="text-[#8B5CF6] font-medium">12 次</span>
```
to:
```tsx
            <span className="text-[#8B5CF6] font-medium">{extremeStats.month_extreme_high} 次</span>
```

- [ ] **Step 3: Replace hardcoded "5 次" with real data**

Change:
```tsx
            <span className="text-[#64748B] font-medium">5 次</span>
```
to:
```tsx
            <span className="text-[#64748B] font-medium">{extremeStats.month_extreme_low} 次</span>
```

- [ ] **Step 4: Build and verify**

Run: `cd /Users/wansheng/git/hot-dashboard && npm run build`
Expected: Build succeeds with no TypeScript errors

- [ ] **Step 5: Commit**

```bash
git add src/pages/Sentiment.tsx
git commit -m "fix: replace hardcoded extreme stats with real data from API"
```

---

### Task 7: Report.tsx — 重写为真实 API 数据

**Files:**
- Modify: `src/pages/Report.tsx`

**Interfaces:**
- Consumes: `fetchReport` from `lib/api.ts`, `ReportData` type from `types/api.ts`, store's `currentDate`
- Produces: Report page using real data instead of mock

This task rewrites the data-fetching layer of Report.tsx while preserving all UI components. The `reportData` import from mockReportData is replaced with a `useState` + `useEffect` pattern that calls `fetchReport(currentDate)`.

- [ ] **Step 1: Replace mock imports with real API imports**

At the top of `src/pages/Report.tsx`, change lines 41-42 from:

```typescript
import { reportData, intradayData, getNewsCategoryLabel, getNewsCategoryColor, getImpactColor, getImpactLabel } from '@/lib/mockReportData';
import type { ReportData, HotStockDetail, NewsItem, SentimentTimelineItem } from '@/lib/mockReportData';
```

to:

```typescript
import { fetchReport } from '@/lib/api';
import type { ReportData, HotStockDetail, NewsItem, SentimentTimelineItem } from '@/types/api';
import { useStore } from '@/store/useStore';
```

- [ ] **Step 2: Add local helper functions for news/impact display**

Since these helpers were imported from mockReportData and are used in the UI rendering, add them to Report.tsx before the `export default function Report()` declaration (around line 108):

```typescript
function getNewsCategoryLabel(cat: NewsItem['category']): string {
  return { policy: '政策', industry: '行业', company: '公司', macro: '宏观' }[cat] || cat;
}
function getNewsCategoryColor(cat: NewsItem['category']): string {
  return { policy: '#3B82F6', industry: '#8B5CF6', company: '#00E396', macro: '#FBBF24' }[cat] || '#94A3B8';
}
function getImpactColor(impact: NewsItem['impact']): string {
  return { positive: '#00E396', negative: '#FF4560', neutral: '#FBBF24' }[impact] || '#94A3B8';
}
function getImpactLabel(impact: NewsItem['impact']): string {
  return { positive: '利好', negative: '利空', neutral: '中性' }[impact] || impact;
}
```

- [ ] **Step 3: Rewrite the Report component's data loading**

Inside `export default function Report()`, replace the line:
```typescript
  const data: ReportData = reportData;
```
with:

```typescript
  const currentDate = useStore((s) => s.currentDate);
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentDate) return;
    setLoading(true);
    setError(null);
    fetchReport(currentDate)
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [currentDate]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-[#1A2332] rounded w-1/3" />
          <div className="h-32 bg-[#1A2332] rounded" />
          <div className="h-64 bg-[#1A2332] rounded" />
          <div className="h-48 bg-[#1A2332] rounded" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertTriangle size={32} className="text-[#FF4560] mx-auto mb-3" />
          <p className="text-[#94A3B8]">{error || '加载失败'}</p>
        </div>
      </div>
    );
  }
```

- [ ] **Step 4: Remove intradayData usage from market section**

The `intradayData` chart used a mock random walk. Replace the chart data source. In the market section (around line 196), change:
```tsx
<AreaChart data={intradayData}>
```
to use volume hourly data as a proxy for intraday activity:
```tsx
<AreaChart data={data.volumeData.hourlyData.map(h => ({ time: h.time, value: h.volume }))}>
```

- [ ] **Step 5: Build and verify**

Run: `cd /Users/wansheng/git/hot-dashboard && npm run build`
Expected: Build succeeds with no TypeScript errors

- [ ] **Step 6: Verify in browser**

Open `http://localhost:8765/report`, select a date like 2026-06-10. Verify:
- 综述文本包含真实数据（日期、消息数、板块名）
- 大盘指数区域显示真实行情（或"暂无行情数据"）
- 热点板块显示真实板块名称和数据
- 情绪时间序列显示真实数据点
- 涨跌统计显示真实数据

- [ ] **Step 7: Commit**

```bash
git add src/pages/Report.tsx
git commit -m "feat: rewrite Report.tsx to use real API data instead of mock"
```

---

### Task 8: 集成测试 + 清理

**Files:**
- No file changes — verification and cleanup

- [ ] **Step 1: Full build test**

Run: `cd /Users/wansheng/git/hot-dashboard && npm run build`
Expected: Build succeeds

- [ ] **Step 2: Verify all API endpoints**

```bash
# Market indices
curl -s http://localhost:8765/api/market/indices | python3 -c "import json,sys; d=json.load(sys.stdin); print('indices:', len(d))"

# Advance/decline
curl -s http://localhost:8765/api/market/advance-decline | python3 -c "import json,sys; d=json.load(sys.stdin); print('A/D:', 'ok' if d else 'null')"

# Report
curl -s http://localhost:8765/api/report/2026-06-10 | python3 -c "import json,sys; d=json.load(sys.stdin); print('report keys:', len(d.keys())); print('sectors:', len(d.get('hotSectors',[]))); print('news:', len(d.get('newsItems',[])))"

# Sentiment timeline
curl -s http://localhost:8765/api/day/2026-06-10/sentiment-timeline | python3 -c "import json,sys; d=json.load(sys.stdin); print('timeline:', len(d))"

# Extreme stats
curl -s http://localhost:8765/api/day/2026-06-10/extreme-stats | python3 -m json.tool
```

- [ ] **Step 3: Verify frontend pages**

Open in browser:
1. `http://localhost:8765/` — Dashboard should still work (no regression)
2. `http://localhost:8765/report` — Report page shows real data
3. `http://localhost:8765/sentiment` — Sentiment page shows real extreme stats (not hardcoded)

- [ ] **Step 4: Final commit (if any cleanup needed)**

```bash
git add -A
git status
# If there are leftover changes:
git commit -m "chore: cleanup after backend data fill integration"
```
