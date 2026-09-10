# Mind Palace 端到端验收清单

**日期：** 2026-09-11
**对应计划：** `docs/superpowers/plans/2026-09-11-mind-palace.md`
**对应规格：** `docs/superpowers/specs/2026-09-11-mind-palace-design.md`
**验证方式：** 真实 Chrome（kimi-webbridge v2.0.5，session `mind-palace-e2e`）+ 真实冷启动数据

---

## 1. 数据来源（必读）

本次验证**把真实数据与测试夹具分开**，下面每条断言都标注了用的是哪一种。

| 部分 | 来源 | 真实性 |
|---|---|---|
| 观点宫殿（`/kols`、`/kol/*`、`/stock/*` 的「大V 观点」区块） | 用户提供的离线导出 `data/export_2m/`（25 群 / 54,110 条 / 50 MB，窗口 2026-07-11 ~ 2026-09-11）经 `ingest_export.py` → `palace_build.py` 冷启动 | **真实** |
| 个股页外壳（`/stock/:code` 能否渲染出「大V 观点」区块） | 从主仓库 `/Users/wansheng/git/hot-dashboard/data/` 复制来的**既有** `latest.json` + `day_2026-07-09.json`（真实文件，只是窗口较早） | **真实文件** |
| 空态断言 D8 | 上述日线文件里加了 **1 条合成占位股** `999001 测试占位股`（该票不在宫殿索引内） | **合成** |

> 为什么需要快照夹具：本 worktree 的 `data/` 在本次工作前只有 `archive/` 与 `palace/`，**没有任何 dashboard 快照**；`/stock/:code` 的页面外壳依赖 `day_*.json` / `latest.json`，没有它页面会在找股票那一步就早退，「大V 观点」区块根本不挂载。这是**夹具缺口**，不是代码缺陷。
>
> 所有夹具文件都落在 `data/` 下，被 `data/.gitignore` 的 `*.json` 规则覆盖，`git status` 实测干净。

**冷启动实际结果：** 24 个群入库（不是 25）——`oc_fa0c016f11b1fa06a69517c77851e726`（080_K神会仅ls）因 `config/settings.yaml:58` 的 chat_id 与导出文件对不上被跳过（见 §4 R10）。`/api/palace/meta` 返回 `coverage: {from: 2026-07-11, to: 2026-09-11, groups: 24, missing_days: []}`。

---

## 2. 复现步骤

```bash
# 后端（仓库根目录）
python3 -m uvicorn backend.server:app --host 127.0.0.1 --port 8765

# 前端（仓库根目录）
npx vite --port 3000 --strictPort
```

- **必须用 `http://localhost:3000`，不能用 `http://127.0.0.1:3000`。** vite 只绑了 IPv6 `[::1]:3000`，走 127.0.0.1 会得到 000。
- 浏览器需先由用户打开并让 Kimi 扩展连上守护进程（`curl -s http://127.0.0.1:10086/status` 应显示 `extension_connected: true`）。
- 守护进程已启动时**不要**跑 stop / restart / uninstall。

冷启动管线（一次性）：

```bash
python3 scripts/ingest_export.py --src /Users/wansheng/git/hot-dashboard/data/export_2m
python3 scripts/build_palace.py
```

---

## 3. 断言清单与实测结果

### A. 冷启动管线

| # | 断言 | 结果 |
|---|---|---|
| A1 | 导出经 `ingest_export.py` 落入 `data/archive/*.jsonl` | ✅ 24 个文件 / 20 MB |
| A2 | `build_palace.py` 生成索引与观点 | ✅ `data/palace/kols.json`、`stock_index.json`、`opinions/`（24 个文件）/ 44 MB |
| A3 | `/api/palace/meta` 覆盖区间与导出窗口一致 | ✅ `2026-07-11 → 2026-09-11` |
| A4 | `missing_days` 不虚报 | ✅ `[]`（导出已逐日校验，确无缺日） |

### B. `/kols` 大V 列表

| # | 断言 | 结果 |
|---|---|---|
| B1 | 卡片数与索引一致 | ✅ 24 张 |
| B2 | 覆盖条显示真实区间 | ✅ `24 个群 · 覆盖 2026-07-11 → 2026-09-11` |
| B3 | 不出现假的「缺失日」横幅 | ✅ 无 |
| B4 | 索引为空时不显示「没有匹配「」的群」 | ✅ `emptyCopy:false`（数据非空，该分支未误触） |
| B5 | 点卡片 → URL **replace** 成 `/kol/<chatId>/<首只票>` | ✅ → `/kol/oc_8182…/300308` |

### C. `/kol/:chatId/:code` 大V 详情

| # | 断言 | 结果 |
|---|---|---|
| C1 | 直接访问 `/kol/<chatId>`（无 code）自动 replace 到首只票 | ✅ → `/kol/…/300308` |
| C2 | 画像条渲染多空倾向 / 操作风格 / 覆盖广度 | ✅ 三者均存在 |
| C3 | 左表行数、选中态唯一 | ✅ 465 行，`aria-current=true` 恰 1 个 |
| C4 | 表头点击切换升降序、`aria-sort` 同步、行重排 | ✅ `提及↓:descending` → `提及↑:ascending`，首三行随之改变 |
| C5 | 时间线区块渲染 | ✅ 「观点时间线」存在 |
| C6 | 未知群 → 空态卡片 + 返回链接，不白屏 | ✅ `/kol/oc_does_not_exist` → 「找不到这个大V」+ `/kols` 链接 |
| C7 | 窄屏（900px）隐藏「多空」「最近」两列且无横向滚动 | ✅ `display:none`，`overflow:false` |
| C8 | 「个股页 →」链到 `/stock/<code>?from=<chatId>` | ✅ `/stock/301165?from=oc_8182d0e3…` |

### D. `/stock/:code` 个股页「大V 观点」区块 ★ 本次打通

| # | 断言 | 结果 |
|---|---|---|
| D1 | 区块渲染，数据真实 | ✅ 13 个群讨论过 · 共 126 条 |
| D2 | 覆盖行取真实窗口 | ✅ `覆盖 2026-07-12 → 2026-09-08` |
| D3 | 每行链到 `/kol/<chat_id>/<code>` | ✅ 13 条，全部形如 `/kol/oc_…/301165` |
| D4 | 无 `?from=` 时不出现回程链接 | ✅ 回程链接数 0 |
| D5 | 带 `?from=<chatId>` 时出现回程链接 | ✅ `/kol/oc_530d…/301165`「回到该大V 的观点」 |
| D6 | 点区块某行 → 深链到该群该票且左表选中 | ✅ → `/kol/oc_8182…/301165`，选中行「锐捷网络 301165 · 23 · +7−0 · 08-31」，与个股页该行**同数** |
| D7 | 个股页与详情的数字互相印证（双向一致） | ✅ D6 的 23 / +7−0 与区块中 `006_帝凌枫` 一行完全一致 |
| D8 | 无人讨论的票 → 显示说明文字而非空白 | ✅ 「还没有大V 讨论过这只票。观点来自接入的 25 个付费群……」 |
| D9 | 窄屏（900px）隐藏「多空」「最近」且无横向滚动 | ✅ `display:none`，`overflow:false` |

### E. 导航

| # | 断言 | 结果 |
|---|---|---|
| E1 | `/kols` 上「大V」高亮 | ✅ |
| E2 | `/kol/…`（详情页前缀）上「大V」仍高亮 | ✅ 走 `EXTRA_PREFIXES` 别名（spec §9.4） |
| E3 | `/stock/…` 上「大V」不高亮 | ✅ |

---

## 4. 本次验证暴露的两个待用户决策项

| # | 事项 | 现状 |
|---|---|---|
| R10 | `config/settings.yaml:58` 的 080 群 chat_id（`oc_fa0c016f…`）与离线导出对不上，导致该群未入库（24/25） | **未改动**。该文件与云端采集器共用，等确认后再改并单独回补该群。 |
| R11 | 观点抽取覆盖率约 23.7% | 已裁定**本分支不改**：提召回的正确落点是只在 `palace_build.extract_opinions` 加宫殿专用名字匹配，不动实时快照管线。 |

---

## 5. 本次未覆盖（如实记录）

- **真实 lark-cli 回补**：需在云端 SSH 47.253.54.6 的 `/root/git/hot-dashboard` 上跑 `python3 scripts/backfill.py --group all --since 2026-06-01`，本机无法验证（本机用离线导出替代）。
- **每日调度**：`scripts/palace_daily.sh` 只做了脚本级验证（手工跑通 + 日志尾出现「完成」），**crontab 由运维手工添加**，未在本机装 cron。
- **`backend/server.py:765-771` 的既有 404 处理器**：它让所有既有 `/api/*` 路由在 `raise HTTPException(404)` 时静默返回 index.html + 200（本次改动之前就存在）。宫殿端点用 `_palace_404()` 绕开，其余路由不受本次改动影响，故未修。

**复现提示：** `?from=` 那条（D5）在 SPA 内只有 query 变化时，页面重渲染有一帧延迟；若在导航后立刻断言会读到空结果，**等约 1–2 秒再读即可**（不是产品缺陷，D4/D5 均已稳定复现）。
