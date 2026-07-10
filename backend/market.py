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
        items = ((data.get("data") or {}).get("diff") or [])
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
        klines = ((data.get("data") or {}).get("klines") or [])
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
