"""大V 观点宫殿 —— 读路径。

索引（kols.json / stock_index.json）不带正文，体积小，启动时全量进内存；
单群观点文件按需懒加载，用 LRU 限制常驻数量（仿 DataStore 的思路）。
"""

from __future__ import annotations

import logging
import threading
from collections import OrderedDict
from pathlib import Path

from backend.jsonio import load_path
from backend.palace_build import iter_opinions, kols_index_path, stock_index_path

logger = logging.getLogger(__name__)

RECENT_OPINIONS = 3


class PalaceStore:
    """观点宫殿查询层。索引常驻内存，单群观点按 LRU 懒加载。"""

    def __init__(self, data_dir, lru_groups: int = 8):
        self.data_dir = Path(data_dir)
        self.lru_groups = max(1, lru_groups)
        self._kols: dict = {}
        self._stock_index: dict = {}
        self._coverage: dict = {}
        self._generated_at: str = ""
        self._opinions: OrderedDict[str, list] = OrderedDict()
        self._ready = False
        self._index_mtime: float = 0.0
        self._lock = threading.Lock()

    # ---- 启动与热重载 ----

    def startup(self) -> None:
        """读索引进内存。索引不存在不算错误——前端拿到空结果自行降级。"""
        self._reload(force=True)

    def _reload(self, force: bool = False) -> None:
        """索引文件 mtime 变了就重读——每日 cron 重建后无需重启服务。

        索引不存在时静默返回并保持未就绪；文件之后出现会被下一次调用发现。
        重载会清空观点 LRU，避免正文停留在旧索引对应的内容上。
        """
        kols_file = kols_index_path(self.data_dir)
        try:
            mtime = kols_file.stat().st_mtime
        except OSError:
            mtime = 0.0
        if not force and mtime == self._index_mtime:
            return

        with self._lock:
            if not force and mtime == self._index_mtime:
                return
            if not kols_file.exists():
                logger.warning("palace 索引不存在，先跑 scripts/build_palace.py")
                return
            try:
                doc = load_path(kols_file)
                stock_file = stock_index_path(self.data_dir)
                stock_index = load_path(stock_file) if stock_file.exists() else {}
            except Exception as e:
                logger.warning(f"palace 索引读取失败: {e}")
                return

            self._coverage = doc.get("coverage") or {}
            self._generated_at = doc.get("generated_at", "")
            self._kols = doc.get("kols") or {}
            self._stock_index = stock_index
            self._index_mtime = mtime
            self._opinions.clear()
            self._ready = True
            logger.info(f"✅ palace 索引已加载: {len(self._kols)} 个大V, "
                        f"{len(self._stock_index)} 只票")

    def is_ready(self) -> bool:
        return self._ready

    def get_meta(self) -> dict:
        """覆盖范围与生成时间。未就绪时返回空结构，调用方据此提示降级。"""
        self._reload()
        return {"generated_at": self._generated_at, "coverage": self._coverage}

    # ---- 查询 ----

    def list_kols(self) -> list[dict]:
        self._reload()
        return sorted(self._kols.values(),
                      key=lambda k: (-k.get("opinion_count", 0), k.get("name", "")))

    def get_kol(self, chat_id: str) -> dict | None:
        """画像 + 该群讨论过的股票（按提及数降序，每票带最近 3 条观点）。"""
        self._reload()
        kol = self._kols.get(chat_id)
        if kol is None:
            return None

        opinions = self._load_opinions(chat_id)
        stocks: dict = {}
        for o in opinions:
            code = o.get("code", "")
            if not code:
                continue
            ts = o.get("ts", "")
            s = stocks.setdefault(code, {
                "code": code, "name": o.get("name", ""), "count": 0,
                "bull": 0, "bear": 0, "actions": [], "sectors": [],
                "first_ts": "", "last_ts": "", "recent": [],
            })
            s["count"] += 1
            s["bull"] += 1 if o.get("bull") else 0
            s["bear"] += 1 if o.get("bear") else 0
            for a in o.get("actions") or []:
                if a not in s["actions"]:
                    s["actions"].append(a)
            for sec in o.get("sectors") or []:
                if sec not in s["sectors"]:
                    s["sectors"].append(sec)
            if ts:
                if not s["first_ts"] or ts < s["first_ts"]:
                    s["first_ts"] = ts
                if ts > s["last_ts"]:
                    s["last_ts"] = ts

        for o in sorted(opinions, key=lambda x: x.get("ts", ""), reverse=True):
            code = o.get("code", "")
            if code in stocks and len(stocks[code]["recent"]) < RECENT_OPINIONS:
                stocks[code]["recent"].append(o)

        return {**kol, "stocks": sorted(stocks.values(),
                                        key=lambda s: (-s["count"], s["code"]))}

    def get_kol_stock(self, chat_id: str, code: str) -> list[dict] | None:
        """该群对该票的完整观点时间线（含正文），时间倒序。未知群返回 None。"""
        self._reload()
        if chat_id not in self._kols:
            return None
        ops = [o for o in self._load_opinions(chat_id) if o.get("code") == code]
        ops.sort(key=lambda o: o.get("ts", ""), reverse=True)
        return ops

    def get_stock_kols(self, code: str) -> dict | None:
        """该票的跨群汇总。未收录返回 None。"""
        self._reload()
        entry = self._stock_index.get(code)
        if entry is None:
            return None
        groups = [{"chat_id": cid, **g} for cid, g in (entry.get("groups") or {}).items()]
        groups.sort(key=lambda g: (-g.get("count", 0), g.get("name", "")))
        return {**entry, "groups": groups}

    # ---- 懒加载 ----

    def _load_opinions(self, chat_id: str) -> list[dict]:
        """单群观点 LRU 缓存。超上限时淘汰最久未用的群。"""
        if chat_id in self._opinions:
            self._opinions.move_to_end(chat_id)
            return self._opinions[chat_id]

        ops = list(iter_opinions(self.data_dir, chat_id))
        self._opinions[chat_id] = ops
        while len(self._opinions) > self.lru_groups:
            evicted, _ = self._opinions.popitem(last=False)
            logger.debug(f"palace 观点 LRU 淘汰: {evicted}")
        return ops
