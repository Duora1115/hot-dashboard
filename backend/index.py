"""
IndexRegistry — 股票/板块/时间的反查索引。
从压缩快照构建，支持按日期增量更新和删除。O(该日条目) 而非 O(全表)。
"""

import logging
from collections import defaultdict

logger = logging.getLogger(__name__)


class IndexRegistry:
    def __init__(self):
        self.stock_index: dict[str, list[tuple[str, int]]] = defaultdict(list)
        self.sector_index: dict[str, list[tuple[str, int]]] = defaultdict(list)
        self.time_index: dict[str, tuple[str, int]] = {}
        # Reverse maps for O(k) removal of a single day.
        self._date_stocks: dict[str, set[str]] = defaultdict(set)
        self._date_sectors: dict[str, set[str]] = defaultdict(set)
        self._date_times: dict[str, set[str]] = defaultdict(set)

    def build_for_day(self, date_str: str, day_data: dict):
        """Rebuild the day's slice of the index (idempotent)."""
        self.remove_date(date_str)

        stocks_for_day = self._date_stocks[date_str]
        sectors_for_day = self._date_sectors[date_str]
        times_for_day = self._date_times[date_str]

        for snap_idx, snap in enumerate(day_data.get("snapshots", [])):
            for stock in snap.get("stk", []):
                code = stock.get("c", "")
                if code:
                    self.stock_index[code].append((date_str, snap_idx))
                    stocks_for_day.add(code)

            for sector in snap.get("sec", []):
                name = sector.get("n", "")
                if name:
                    self.sector_index[name].append((date_str, snap_idx))
                    sectors_for_day.add(name)

            time_str = snap.get("t", "")
            if time_str:
                self.time_index[time_str] = (date_str, snap_idx)
                times_for_day.add(time_str)

    def remove_date(self, date_str: str):
        """Remove one day's entries in O(entries-for-day)."""
        for code in self._date_stocks.pop(date_str, ()):
            entries = self.stock_index.get(code)
            if not entries:
                continue
            filtered = [e for e in entries if e[0] != date_str]
            if filtered:
                self.stock_index[code] = filtered
            else:
                del self.stock_index[code]

        for name in self._date_sectors.pop(date_str, ()):
            entries = self.sector_index.get(name)
            if not entries:
                continue
            filtered = [e for e in entries if e[0] != date_str]
            if filtered:
                self.sector_index[name] = filtered
            else:
                del self.sector_index[name]

        for t in self._date_times.pop(date_str, ()):
            self.time_index.pop(t, None)

    def get_stock_locations(self, code: str) -> list[tuple[str, int]]:
        return list(self.stock_index.get(code, []))

    def get_sector_locations(self, name: str) -> list[tuple[str, int]]:
        return list(self.sector_index.get(name, []))
