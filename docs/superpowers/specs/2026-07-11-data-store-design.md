# 数据层优化 — 启动时全量预加载

**日期:** 2026-07-11
**目标:** 消除裸读 JSON + 按需缓存的性能瓶颈，实现 API 请求零磁盘 I/O

## 背景

当前数据层问题：
- 33 天数据文件，22KB 到 57MB 不等（典型 6-43MB）
- 每天约 95-120 个快照，每快照含完整群消息文本
- 首次请求某天数据：读整个 JSON（最大 57MB）→ 解析 → 压缩 ~100 个快照
- 缓存基于 `mtime` 的内存 dict，服务重启后清空
- 切换日期、冷启动、页面首次加载均存在明显延迟

## 设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 优化方案 | 启动时全量预加载 | 改造最小，零依赖，效果最好 |
| 增量更新 | Collector 写后自动更新 | 无需手动触发，实时性好 |
| 存储位置 | Python dict（内存） | 无需外部数据库，200MB 内存可接受 |

## 架构

```
backend/
├── data_store.py    ← 新增：DataStore 类
├── server.py        ← 改造：数据读取改为调用 DataStore
├── collector.py     ← 改造：写完数据后调用 store.update_day()
```

### DataStore 类

```python
class DataStore:
    def __init__(self, data_dir: Path):
        self.data_dir = data_dir
        self._days: dict[str, dict] = {}        # {date: compressed day data}
        self._raw: dict[str, dict] = {}          # {date: raw day data}
        self._latest: dict | None = None
        self._dates: list[str] = []
        self._dates_info: dict[str, int] = {}   # {date: size_kb}

    def startup(self):
        """启动时全量预加载所有 day 文件"""

    def _load_day(self, date: str, path: Path):
        """加载并压缩一天的数据到内存"""

    def update_day(self, date: str):
        """增量更新某天（collector 写完后调用）"""

    def get_day(self, date: str) -> dict | None:
        """返回完整的压缩日数据"""

    def get_snapshots(self, date: str, start=0, count=None) -> list:
        """返回快照切片"""

    def get_latest(self) -> dict | None:
        """返回最新快照"""

    def get_dates(self) -> list[str]:
        """返回可用日期列表"""

    def get_dates_info(self) -> list[dict]:
        """返回 DateInfo 列表 [{date, size_kb}]"""
```

### server.py 改造

全局 `_day_cache` + `_raw_cache` 替换为 `store = DataStore(data_dir)`。

| 端点 | 原来 | 改后 |
|------|------|------|
| `GET /api/status` | glob 文件系统 | `store.get_dates()` |
| `GET /api/dates` | glob + stat | `store.get_dates_info()` |
| `GET /api/latest` | 读 latest.json | `store.get_latest()` |
| `GET /api/day/{date}` | json.load + compress | `store.get_day(date)` |
| `GET /api/day/{date}/snapshots` | json.load + compress 部分 | `store.get_snapshots(date, start, count)` |
| `GET /api/report/{date}` | json.load + compress + 行情 | `store.get_day(date)` + 行情 |
| 其他端点 | 同上 | 同上 |

启动钩子：
```python
@app.on_event("startup")
def startup():
    store.startup()
```

### collector.py 改造

collector 写完 day 文件后加一行：
```python
store.update_day(date_str)
```

### 删除的代码

- `_day_cache` 全局 dict
- `_raw_cache` 全局 dict
- 各端点中的 `json.load` + `_compress_snapshot` 逻辑
- `ThreadPoolExecutor` 从 server.py 移到 data_store.py 的 startup 中使用一次

## 容错

- **启动时文件损坏：** 单天加载失败不影响其他天。记录 warning，跳过继续。
- **collector 写入中间态：** `update_day()` 内部 try/except 包裹 json.load，失败时保留旧内存数据。
- **DateInfo size_kb：** 启动时预计算，`update_day()` 时刷新。

## 内存占用

33 天 × 平均 5MB 压缩后 ≈ 150-200MB。随数据积累线性增长，100 天约 500MB。对内部工具完全可接受。未来如需控制，可加 LRU 淘汰（只保留最近 N 天）。

## 文件清单

| 操作 | 文件 | 说明 |
|------|------|------|
| 新建 | `backend/data_store.py` | DataStore 类（~120 行） |
| 改造 | `backend/server.py` | 替换缓存逻辑，所有端点改用 store |
| 改造 | `backend/collector.py` | 写完后调用 store.update_day() |

## 验证

1. 启动服务，确认日志显示预加载完成（天数 + 耗时）
2. `curl /api/day/2026-06-15`（最大文件 57MB）— 响应时间 < 50ms
3. 切换多个日期 — 每次均 < 50ms
4. 重启服务后首次请求 — 同样 < 50ms
5. Collector 写入新数据后 — `store.update_day()` 自动刷新，下次请求返回新数据
6. 所有现有 API 端点返回数据格式不变
