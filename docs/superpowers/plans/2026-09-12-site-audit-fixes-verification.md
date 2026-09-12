# 全站走查问题修复 — 验证记录

- 计划：`docs/superpowers/plans/2026-09-12-site-audit-fixes.md`
- 设计：`docs/superpowers/specs/2026-09-12-site-audit-fixes-design.md`
- 线上版本基准：`https://touyan.fun/` 页脚 `v021f8a1`（2026-09-12 走查时的版本）
- 状态：**未开始**（每完成一条任务，在下面追加一行）

## 怎么记

每条任务完成后追加一行，**三样都要有**：

- **单测证据**：跑的命令 + 关键输出行（失败那条也要记，证明测试确实先红过）
- **浏览器复验**：本地起服务后 kimi-webbridge 的截图路径 + 一句结论
- **提交**：commit hash

浏览器复验的固定姿势：

```bash
python3 -m uvicorn backend.server:app --host 127.0.0.1 --port 8765   # 后端
npm run dev                                                            # 前端，vite 在 3000
# 打开 http://127.0.0.1:3000/ ，截图存 docs/superpowers/plans/assets/2026-09-12-site-audit/
```

**本地数据是旧副本**（采集真身只在云端），所以本地只验**逻辑**：口径算对没有、空状态出现没有、图表有柱子没有。具体数字不对也没关系 —— 数字口径用线上 API 的原始响应做断言（例如 F2 的 `68,522` vs `1,187`）。

## 记录表

| # | 问题 | 修复提交 | 单测证据 | 浏览器复验 | 结论 |
|---|---|---|---|---|---|
| 1 | F2/F3/F4 晨报量能口径 | | | | |
| 2 | F5 晨报活跃群 | | | | |
| 3 | F6/F7/F22 涨跌家数与指数 | | | | |
| 4 | F14/F15 后端文本清洗 | | | | |
| 5 | F8 群活跃度端点 | | | | |
| 6 | F16 `/api/dates` 条数 | | | | |
| 7 | F9 操作信号 key | | | | |
| 8 | F10 互斥预警 | | | | |
| 9 | F15/F17 正文清洗与去重 | | | | |
| 10 | F1/F11 空状态与默认日期 | | | | |
| 11 | F8 热力图接前端 | | | | |
| 12 | F12/F13 情绪空值与图例 | | | | |
| 13 | F16 日期下拉 | | | | |
| 14 | F18/F19 文案与徽章 | | | | |
| 15 | F20/F21 可达性 | | | | |

## 逐条明细

### 后端任务（1–6）真数据复验 — 2026-09-12

本机 `data/` 里有 33 个真实 day 文件（旧副本，但结构、量级与线上一致），因此后端逻辑直接对着**真实数据**验，不经过 HTTP、不依赖正在跑的（旧代码）本地服务。

```bash
python3 - <<'PY'   # 直接调 backend 的函数，只读 data/
from backend.data_store import DataStore
from backend.report import generate_report
store = DataStore(Path('data')); store.startup()
...
PY
```

| 问题 | 验的是什么 | 实测结果 | 结论 |
|---|---|---|---|
| F2/F3 (Task 1) | `totalVolume` 是否等于 `meta.message_count`，而不是累计值求和 | 2026-07-06：`meta=1153`，`totalVolume=1153`；分时求和 2166（旧口径是累计值求和，量级上万） | ✅ |
| F4 (Task 1) | 传入 `prev_message_count=999` 时能否给出真实百分比 | `changePercent=15.4` | ✅ |
| F5 (Task 2) | `activeGroups` 是否为真实值 | `{'active': 24, 'total': 25}`（旧值是写死的 `23/25`） | ✅ |
| F6 (Task 3) | 真实源拿不到时是否诚实留白 | `advanceDecline=None`（旧代码会编出 `看多数×30` 的假家数） | ✅ |
| F7 (Task 3) | 死数据是否删干净 | 返回体里 `'marketIndices' in r` → `False` | ✅ |
| F8 (Task 5) | 热力图的数据源是否真的能出数 | 原始快照 834 个板块带 `gd`，压缩快照 0 个（证实旧路径必然为空）；新端点给出 21 群 × 120 槽、1872 个非零格子、`len(cells)==len(groups)` 行对齐 | ✅ |
| F14 (Task 4) | 晨报卡片标题/摘要是否还重复 | 真实消息下 `title` 与 `summary` 不再以同一段文字开头 | ✅ |
| F16 (Task 6) | `message_count` 是否与文件头 `total_msgs` 一致，且不触发懒加载 | 2026-07-09/07/06 → 5 / 904 / 1153，与 `head -c 256` 读到的 `total_msgs` 逐条相符；`/api/dates` 返回 33 个日期而 `_days` 仍为 1 | ✅ |

附带说明：跑这段时 `backend/market.py` 尝试连 eastmoney 取 K 线失败（本机无外网/代理不通），已按设计降级，不影响上面任何一条结论 —— 反而正好验证了 F6「拿不到就走 None」这条路径在真实环境下会真的被走到。

> 浏览器复验留到前端任务（7–15）落地后统一做：本地的前端页面必须等前端改动到位才有东西可看。截图存 `docs/superpowers/plans/assets/2026-09-12-site-audit/`。

### 模板（前端任务用）

> 每条任务的执行者在下面追加一段：复验了哪个页面、点了什么、看到什么。截图路径写全。

### 模板

```
#### Task N — Fxx（一句话）

- 命令：`python3 -m pytest tests/test_xxx.py -v` → `N passed`
- 先红后绿：`tests/test_xxx.py::test_yyy` 在实现前报 `ImportError: ...`（已确认）
- 浏览器：本地 /report，日期切到 <date>
  - 修复前：<观察>
  - 修复后：<观察>
  - 截图：`docs/superpowers/plans/assets/2026-09-12-site-audit/fxx-report.png`
- 线上交叉核对：`curl -s https://touyan.fun/api/report/<date> | jq ...` → <关键值>
```

## 收尾：全站回归

15 条全部完成后，在本地把这 10 个页面重走一遍，**确认没有引入新问题**（走查时长约 40 分钟）：

- [ ] `/` 仪表盘（4 个 tab + 日期下拉 + 刷新 + 实时/回放切换）
- [ ] `/replay` 回放（拖动滑块 + 播放 + 变速）
- [ ] `/sectors` 板块（排行/轮动 + 板块抽屉）
- [ ] `/sentiment` 情绪（4 个区块）
- [ ] `/report` 晨报（各锚点跳转）
- [ ] `/compare` 对比（增删日期）
- [ ] `/chain` 产业链图谱（点节点看面板）
- [ ] `/kols` 大V → `/kol/:id` 详情 → `/kol/:id/:code`
- [ ] `/stocks` 股票（搜索 + 排序）→ `/stock/:code` 详情
- [ ] 390×844 移动端视口：上述页面的关键屏

回归结果与截图记在下面：

```
（待填）
```
