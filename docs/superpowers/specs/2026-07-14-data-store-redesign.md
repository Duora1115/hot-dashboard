# 数据层重构 — 智能缓存 + 索引 + HTTP 缓存

**日期:** 2026-07-14
**目标:** 解决页面加载慢、数据拿不到、启动慢、切换卡顿四大痛点

## 背景

当前数据层（2026-07-11 版本）已实现启动时全量预加载，但仍有以下问题：

1. **启动加载全量数据**：33 天 / 558MB 原始 JSON 全部加载，耗时 ~2s+，随数据增长线性恶化
2. **4 个端点每次从磁盘重读原始数据**：`stock-messages`、`sentiment-timeline`、`extreme-stats`、`day/meta` 每次调用都 `json.load()` 44-91MB 文件
3. **无索引**：`stock-messages` 扫描全部快照查找一只股票，O(N×M) 复杂度
4. **无 HTTP 缓存**：前端每次刷新/切换都重新请求全部数据，无 ETag / Cache-Control
5. **派生数据重复计算**：`sentiment-timeline`、`extreme-stats`、`report` 每次请求都重新计算

### 约束

- 云端部署，内存 2-4GB
- 只保留最近 7-14 天数据
- 纯 Python 方案，不引入 Redis / SQLite 等外部依赖
- 不改变数据文件格式（`day_*.json`, `latest.json`）

## 架构

```
┌─────────────────────────────────────────────────┐
│                  FastAPI Endpoints                │
│          (加 HTTP 缓存头: ETag / Cache-Control)    │
├─────────────────────────────────────────────────┤
│              派生数据缓存层 (DerivedCache)          │
│   sentiment-timeline, extreme-stats, report       │
│   首次计算后缓存，数据更新时失效                      │
├─────────────────────────────────────────────────┤
│              索引层 (IndexRegistry)                 │
│   stock_code → [(date, snap_idx)]                 │
│   sector_name → [(date, snap_idx)]                │
│   time → (date, snap_idx)                         │
│   启动时构建，数据更新时增量维护                       │
├─────────────────────────────────────────────────┤
│              数据存储层 (DataStore)                  │
│   压缩快照 (全量内存) + 原始数据 (LRU 缓存)          │
│   启动: 只加载最近 7 天，其余懒加载                    │
│   淘汰: 超过 14 天的数据从内存卸载                     │
├─────────────────────────────────────────────────┤
│              磁盘 (JSON 文件)                       │
│   day_YYYY-MM-DD.json + latest.json               │
│   不变，保持现有格式                                 │
└─────────────────────────────────────────────────┘
```

**核心原则**：
- 压缩快照常驻内存（~200-400MB for 14 天），因为 API 响应直接用
- 原始数据按需加载 + LRU 淘汰（默认缓存 3 天原始数据），因为只有 4 个端点需要
- 索引在启动时从压缩数据构建，零额外磁盘 I/O
- 派生数据缓存跟随数据更新自动失效

### 内存预算（14 天数据，云端 2-4GB）

| 组件 | 预估内存 |
|------|---------|
| 压缩快照 (14天) | ~200-400 MB |
| 原始数据 LRU (3天) | ~150-300 MB |
| 索引 | ~20-50 MB |
| 派生缓存 | ~10-30 MB |
| **合计** | **~380-780 MB** |

## 索引策略

### 索引结构

```python
class IndexRegistry:
    # 股票反查: stock_code → [(date, snap_idx), ...]
    stock_index: dict[str, list[tuple[str, int]]]

    # 板块反查: sector_name → [(date, snap_idx), ...]
    sector_index: dict[str, list[tuple[str, int]]]

    # 时间索引: "2026-07-09 10:30" → (date, snap_idx)
    time_index: dict[str, tuple[str, int]]
```

### 构建时机

- **启动时**：遍历已加载的压缩快照，一次性构建全部索引
- **`update_day(date)` 时**：先删除该日期的旧索引条目，再重新扫描该日快照追加新条目
- **`update_latest()` 时**：不需要重建索引

### 索引规模

```
14 天 × 平均 70 快照/天 × 10 股票/快照 = ~10,000 条 stock 索引项
14 天 × 70 快照 × 8 板块 = ~8,000 条 sector 索引项
14 天 × 70 快照 = ~1,000 条 time 索引项
```

构建时间 < 100ms，内存 ~20-50MB。

### 查询优化示例

**改造前** — `stock-messages`：
```python
raw_snaps = store.get_raw_snapshots(date_str)  # 读磁盘 44MB
for snap in raw_snaps:                          # 线性扫描 70 个快照
    for t in snap["top10_stocks"]:
        if t["code"] == code: ...
```

**改造后**：
```python
locations = index.stock_index.get(code, [])     # O(1)
date_snaps = [(d, i) for d, i in locations if d == date_str]
for date, snap_idx in date_snaps:
    snap = store.get_snapshot(date, snap_idx)   # 从内存取
```

## 缓存层

### 1. 原始数据 LRU 缓存

```python
class RawDataLRU:
    max_days: int = 3
    _cache: OrderedDict[str, dict]

    def get(self, date_str) -> dict | None: ...
    def touch(self, date_str): ...
    def evict_oldest(self): ...
```

内存占用：3 天原始数据 ≈ 150-300MB。

### 2. 派生数据缓存

```python
class DerivedCache:
    _cache: dict[str, tuple[Any, float]]
    _versions: dict[str, int]

    def get(self, key, date_str) -> Any | None: ...
    def invalidate(self, date_str): ...
    def set(self, key, date_str, result): ...
```

**失效时机**：
- `update_day(date)` → `derived_cache.invalidate(date)`
- `update_latest()` → `derived_cache.invalidate(today)`

**缓存项**：

| 端点 | 缓存键 | 失效条件 |
|------|--------|---------|
| `/api/day/{date}/sentiment-timeline` | `("sentiment_tl", date)` | update_day(date) |
| `/api/day/{date}/extreme-stats` | `("extreme", date)` | update_day(date) |
| `/api/report/{date}` | `("report", date)` | update_day(date) + 行情 30s TTL |
| `/api/day/{date}/meta` | `("meta", date)` | update_day(date) |

### 3. 压缩快照（已有，优化）

当前 `self._days` 全内存，保持不变。优化：超过 14 天的日期从 `_days` 中卸载，按需懒加载。

## 启动优化 + 数据生命周期

### 启动流程

```
启动
 ├─ Step 1: 扫描 data_dir，获取日期列表 + 文件大小（<10ms）
 ├─ Step 2: 加载最近 7 天的 day 文件 → 压缩 → 存入 _days（~1s）
 ├─ Step 3: 从已加载的压缩数据构建索引（<100ms）
 ├─ Step 4: 加载 latest.json → 压缩（<10ms）
 └─ Step 5: 预热派生缓存（可选）
```

总启动时间：~1s，不随总数据量增长。

### 懒加载

```python
def get_day(self, date_str):
    if date_str in self._days:
        return self._days[date_str]
    path = self.data_dir / f"day_{date_str}.json"
    if not path.exists():
        return None
    self._load_day(date_str, path)
    self._rebuild_index_for_date(date_str)
    return self._days[date_str]
```

### 数据淘汰

**内存淘汰**：

```python
MAX_HOT_DAYS = 14

def _evict_if_needed(self):
    while len(self._days) > MAX_HOT_DAYS:
        oldest = min(self._days.keys())
        del self._days[oldest]
        self._index.remove_date(oldest)
        self._derived.invalidate(oldest)
        self._raw_cache.evict(oldest)
```

**磁盘淘汰**（collector 写入后执行）：

```python
RETENTION_DAYS = 14

def cleanup_old_files(data_dir):
    cutoff = (now - timedelta(days=RETENTION_DAYS)).strftime("%Y-%m-%d")
    for f in data_dir.glob("day_*.json"):
        date_str = f.stem.replace("day_", "")
        if date_str < cutoff:
            f.unlink()
```

## HTTP 缓存策略

| 端点 | Cache-Control | ETag | 说明 |
|------|--------------|------|------|
| `/api/status` | `no-cache` | ✅ | 始终验证，可用 304 |
| `/api/dates` | `max-age=60` | ✅ | 1 分钟内不重复请求 |
| `/api/latest` | `no-cache` | ✅ | 实时数据，每次验证 |
| `/api/day/{date}` | `max-age=300` | ✅ | 历史数据 5 分钟缓存 |
| `/api/day/{date}/meta` | `max-age=300` | ✅ | 同上 |
| `/api/day/{date}/snapshots` | `max-age=300` | ✅ | 同上 |
| `/api/day/{date}/sentiment-timeline` | `max-age=60` | ✅ | 派生数据 1 分钟 |
| `/api/day/{date}/extreme-stats` | `max-age=60` | ✅ | 同上 |
| `/api/report/{date}` | `max-age=30` | ✅ | 含行情数据 30 秒 |
| `/api/market/indices` | `max-age=30` | ✅ | 行情数据 30 秒 |
| `/api/market/advance-decline` | `max-age=30` | ✅ | 同上 |
| `/api/stock-messages/{date}` | `max-age=300` | ✅ | 历史数据 5 分钟 |

**ETag 实现**：

```python
def _etag_for(date_str: str) -> str:
    version = store.get_version(date_str)
    return f'"{date_str}-v{version}"'

@app.get("/api/day/{date_str}")
def api_day(date_str: str, request: Request):
    etag = _etag_for(date_str)
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304)
    data = store.get_day(date_str)
    return JSONResponse(data, headers={"ETag": etag})
```

## API 变更

不新增端点，全部在现有接口上优化。

**`/api/day/{date}/meta` 优化**：当前调用 `store.get_day()` 加载完整数据，改造后只返回元信息，不触发完整数据加载。

**`/api/stock-messages/{date}` 优化**：用索引替代全量扫描。

## 错误处理

- **索引构建失败**：跳过损坏日期，记 warning；不一致时下次访问自动重建
- **缓存未命中**：原始 LRU 未命中 → 磁盘读取；派生缓存未命中 → 重新计算；压缩数据未命中 → 懒加载
- **内存不足**：超过 `MAX_HOT_DAYS` 淘汰最老日期；极端情况返回 503
- **数据一致性**：collector 写入 → `update_day()` 原子更新内存 + 索引 + 失效缓存；中途失败保留旧数据

## 文件改动清单

| 文件 | 改动 | 复杂度 |
|------|------|--------|
| `backend/data_store.py` | 重构：分 4 层（存储 / 索引 / 原始 LRU / 派生缓存） | 高 |
| `backend/server.py` | 加 HTTP 缓存头（ETag / Cache-Control），优化 meta / stock-messages 端点 | 中 |
| `backend/collector.py` | 末尾加磁盘清理逻辑 | 低 |
| `backend/config/settings.yaml` | 新增配置项 | 低 |
| `src/lib/api.ts` | 前端 fetch 加 `cache: 'default'` | 低 |

**不改动**：数据文件格式、前端页面组件、采集逻辑。

## 实施顺序

```
Phase 1: DataStore 重构（核心）
  → 分 4 层结构
  → 索引构建
  → LRU + 派生缓存
  → 启动优化 + 懒加载

Phase 2: Server API 优化
  → HTTP 缓存头
  → ETag 304 支持
  → meta / stock-messages 端点优化

Phase 3: Collector 清理
  → 磁盘淘汰旧文件
  → 配置项

Phase 4: 前端适配
  → fetch cache 策略
```

## 预期效果

| 指标 | 改造前 | 改造后 |
|------|--------|--------|
| 启动时间 | ~2s+ | ~1s |
| `/api/stock-messages` 延迟 | 1-3s（读 44MB 磁盘） | <100ms（索引命中） |
| `/api/sentiment-timeline` 延迟 | 500ms+（扫描全部快照） | <50ms（缓存命中） |
| 页面切换数据传输 | 每次全量 | 304 或增量 |
| 内存占用 | 500MB+（全量加载） | 380-780MB（可控） |
| 数据不可用概率 | 高（磁盘 I/O 超时） | 低（内存为主） |

## 验证

1. 启动服务，确认日志显示预加载完成（天数 + 耗时 < 1.5s）
2. `curl /api/stock-messages/2026-07-07?code=002396` — 响应时间 < 100ms
3. `curl /api/day/2026-07-07/sentiment-timeline` — 首次 < 100ms，后续 < 10ms
4. 连续两次 `curl -H "If-None-Match: ..."` — 第二次返回 304
5. 切换多个日期 — 每次均 < 100ms
6. Collector 写入新数据后 — 缓存自动失效，下次请求返回新数据
7. 所有现有 API 端点返回数据格式不变
8. 内存占用稳定在 400-800MB 范围内
