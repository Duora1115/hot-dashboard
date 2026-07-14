"""
IndexRegistry — 股票/板块/时间的反查索引。
从压缩快照构建，支持按日期增量更新和删除。
"""

import logging
from collections import defaultdict

logger = logging.getLogger(__name__)


class IndexRegistry:
    def __init__(self):
        self.stock_index: dict[str, list[tuple[str, int]]] = defaultdict(list)
        self.sector_index: dict[str, list[tuple[str, int]]] = defaultdict(list)
        self.time_index: dict[str, tuple[str, int]] = {}

    def build_for_day(self, date_str: str, day_data: dict):
        """构建某天的索引（先清除旧条目，再重新扫描）。"""
        self.remove_date(date_str)

        for snap_idx, snap in enumerate(day_data.get("snapshots", [])):
            # 股票索引
            for stock in snap.get("stk", []):
                code = stock.get("c", "")
                if code:
                    self.stock_index[code].append((date_str, snap_idx))

            # 板块索引
            for sector in snap.get("sec", []):
                name = sector.get("n", "")
                if name:
                    self.sector_index[name].append((date_str, snap_idx))

            # 时间索引
            time_str = snap.get("t", "")
            if time_str:
                self.time_index[time_str] = (date_str, snap_idx)

    def remove_date(self, date_str: str):
        """删除某天的所有索引条目。"""
        for code in list(self.stock_index.keys()):
            self.stock_index[code] = [
                (d, i) for d, i in self.stock_index[code] if d != date_str
            ]
            if not self.stock_index[code]:
                del self.stock_index[code]

        for name in list(self.sector_index.keys()):
            self.sector_index[name] = [
                (d, i) for d, i in self.sector_index[name] if d != date_str
            ]
            if not self.sector_index[name]:
                del self.sector_index[name]

        times_to_remove = [
            t for t, (d, _) in self.time_index.items() if d == date_str
        ]
        for t in times_to_remove:
            del self.time_index[t]

    def get_stock_locations(self, code: str) -> list[tuple[str, int]]:
        """获取某只股票出现的所有 (date, snap_idx)。"""
        return list(self.stock_index.get(code, []))

    def get_sector_locations(self, name: str) -> list[tuple[str, int]]:
        """获取某板块出现的所有 (date, snap_idx)。"""
        return list(self.sector_index.get(name, []))
