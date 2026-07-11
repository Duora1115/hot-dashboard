# backend/data_store.py
"""
DataStore — 启动时全量预加载，API 请求零磁盘 I/O
"""

import json
import logging
import time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

logger = logging.getLogger(__name__)


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


class DataStore:
    def __init__(self, data_dir: Path):
        self.data_dir = data_dir
        self._days: dict[str, dict] = {}        # {date: compressed day data}
        self._raw: dict[str, dict] = {}          # {date: raw day data}
        self._latest: dict | None = None          # compressed latest snapshot
        self._latest_raw: dict | None = None      # raw latest data
        self._dates: list[str] = []               # sorted date list
        self._dates_info: dict[str, int] = {}     # {date: size_kb}

    def startup(self):
        """启动时全量预加载所有 day 文件 + latest.json"""
        t0 = time.time()
        day_files = sorted(self.data_dir.glob("day_*.json")) if self.data_dir.exists() else []

        # 并行加载所有 day 文件
        def _load_one(path: Path):
            date_str = path.stem.replace("day_", "")
            try:
                self._load_day(date_str, path)
            except Exception as e:
                logger.warning(f"预加载 {date_str} 失败: {e}")

        with ThreadPoolExecutor(max_workers=min(8, len(day_files) or 1)) as pool:
            pool.map(_load_one, day_files)

        # 加载 latest.json
        try:
            self.update_latest()
        except Exception as e:
            logger.warning(f"预加载 latest.json 失败: {e}")

        # 构建日期列表和 size 信息
        self._dates = sorted(self._days.keys())
        for date_str in self._dates:
            path = self.data_dir / f"day_{date_str}.json"
            if path.exists():
                self._dates_info[date_str] = round(path.stat().st_size / 1024, 1)

        elapsed = time.time() - t0
        logger.info(f"✅ 预加载完成: {len(self._days)} 天数据, 耗时 {elapsed:.1f}s")

    def _load_day(self, date_str: str, path: Path):
        """加载并压缩一天的数据到内存"""
        with open(path, encoding="utf-8") as f:
            raw = json.load(f)
        self._raw[date_str] = raw

        total = raw.get("total_msgs", 0)
        snapshots = raw.get("snapshots", [])
        if not total and snapshots:
            total = snapshots[-1].get("total_messages", 0)

        # 压缩所有快照
        compressed_snaps = [_compress_snapshot(s) for s in snapshots]

        meta = {
            "start": snapshots[0]["time"] if snapshots else "",
            "end": snapshots[-1]["time"] if snapshots else "",
            "count": len(snapshots),
            "message_count": total,
        }
        self._days[date_str] = {"date": raw.get("date", date_str), "meta": meta, "snapshots": compressed_snaps}

    def update_day(self, date_str: str):
        """增量更新某天（collector/upload 写完后调用）"""
        path = self.data_dir / f"day_{date_str}.json"
        if not path.exists():
            return
        try:
            self._load_day(date_str, path)
            if date_str not in self._dates:
                self._dates = sorted(self._days.keys())
            self._dates_info[date_str] = round(path.stat().st_size / 1024, 1)
        except Exception as e:
            logger.warning(f"更新 {date_str} 失败: {e}")

    def update_latest(self):
        """重新加载 latest.json"""
        latest_path = self.data_dir / "latest.json"
        if not latest_path.exists():
            self._latest = None
            self._latest_raw = None
            return
        with open(latest_path, encoding="utf-8") as f:
            raw = json.load(f)
        self._latest_raw = raw
        self._latest = _compress_snapshot(raw)

    def get_latest_raw(self) -> dict | None:
        return self._latest_raw

    def get_dates(self) -> list[str]:
        return list(self._dates)

    def get_dates_info(self) -> list[dict]:
        result = []
        for date_str in reversed(self._dates):
            result.append({"date": date_str, "size_kb": self._dates_info.get(date_str, 0)})
        return result

    def get_latest(self) -> dict | None:
        return self._latest

    def get_day(self, date_str: str) -> dict | None:
        return self._days.get(date_str)

    def get_snapshots(self, date_str: str, start: int = 0, count: int | None = None) -> list[dict]:
        day = self._days.get(date_str)
        if not day:
            return []
        snaps = day["snapshots"]
        if count is None or count <= 0:
            return snaps[start:]
        count = min(count, 100)
        return snaps[start:start + count]

    def get_raw_day(self, date_str: str) -> dict | None:
        return self._raw.get(date_str)

    def get_raw_snapshots(self, date_str: str) -> list[dict]:
        raw = self._raw.get(date_str)
        if not raw:
            return []
        return raw.get("snapshots", [])
