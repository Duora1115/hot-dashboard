# AI 产业链关系图谱 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 `/chain` 页，把 AI 产业链上市公司按「同业 / 上下游 / 阵营」三类关系画成一张力导向图谱，叠加当日热度，支持从今日热票顺链找同链未上榜的补涨候选。

**Architecture:** 一份手工维护的静态 JSON（`src/data/ai_chain.json`）描述环节与个股，`src/lib/chain.ts` 的纯函数把它和当日快照派生成节点/边/弧线，`src/pages/Chain.tsx` 用 `react-force-graph-2d` 渲染。桌面 = 画布 + 右栏详情；窄屏（<768px）= 同款画布 + 底部卡片/抽屉，另有「图谱 / 列表」切换。无后端改动。

**Tech Stack:** React 19 + TypeScript + Vite 7 + Tailwind；`react-force-graph-2d`（canvas + d3-force）；`vitest`（新增，只测 `chain.ts` 纯函数）；pytest（校验 JSON）。

**Spec:** `docs/superpowers/specs/2026-09-09-ai-chain-graph-design.md`

## Global Constraints

- **无后端改动**：只新增静态 JSON 与前端文件；不动 `backend/`、不动 API。
- **`react-force-graph-2d` 只允许 `src/pages/Chain.tsx` / `src/components/chain/*` import**，不得被其它页面引入（保证只进 `/chain` 分包）。
- **`code` 必须存在于 `backend/stock_mapping.json`**；未上市公司排除；歧义名宁漏不猜，漏掉的写进任务报告。
- **`tier` ∈ {`直接铲子`, `间接铲子`, `铲子的铲子`}**；`stocks[].tier` 可缺省，缺省继承所属环节。
- **`ecosystems` 推荐词表**：`英伟达链` / `华为链` / `北美CSP链` / `国产算力链`；允许为空数组，允许按需扩展。
- **热榜口径**：快照 `stk` 只有 Top10，所以「上榜」= 今日进过 Top10，**不等于**被群提到过。所有文案写「上榜 / 未上榜」，**不得写「提及 / 未提及」**。
- **窄屏阈值 768px**，统一用现成的 `useIsMobile()`（`src/hooks/use-mobile.ts`）。
- **命令约定**：本机无 `python`，Python 一律 `python3 -m pytest`；前端构建 `npm run build`；单测 `npm run test`。
- **`stock_mapping.json` 的名称不可靠**：5526 条里有 286 条带 `XD/DR/XR/N/*ST` 前缀，且名称被截断到 ≤4 字（`688313 → "XD仕佳光"`、`688200 → "DR华峰测"`、`300308 → "中际旭创"`）。名称→代码匹配必须**先剥前缀、再按前缀匹配**；JSON 里存干净全名，不要照抄 mapping 的脏名。

---

## File Structure

| 文件 | 职责 |
|---|---|
| `src/data/ai_chain.json` | 手维护的环节 + 个股关系数据（唯一数据源） |
| `src/lib/chain.ts` | 类型 + 纯函数：调色板、热度聚合、节点/边/弧线派生 |
| `src/lib/chain.test.ts` | vitest 单测（只测纯函数） |
| `src/components/chain/GraphCanvas.tsx` | 力导向画布：自定义节点/边绘制、上下游弧线、点击选中 |
| `src/components/chain/DetailPanel.tsx` | 详情内容（桌面右栏与移动端抽屉共用） |
| `src/components/chain/ChainList.tsx` | 窄屏「列表」视图：按环节分组的行 |
| `src/pages/Chain.tsx` | 页面壳：数据加载、过滤状态、桌面/窄屏布局切换 |
| `tests/test_chain_data.py` | pytest 校验 `ai_chain.json` |
| `vitest.config.ts` | vitest 配置（`@` 别名 + node 环境） |

---

### Task 1: 工具链与 React 19 兼容性闸门

**Files:**
- Modify: `package.json`
- Modify: `tsconfig.app.json`
- Create: `vitest.config.ts`
- Create: `src/pages/Chain.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/Navbar.tsx`

**Interfaces:**
- Consumes: 无
- Produces: 路由 `/chain` 可用、导航项「产业链图谱」、`npm run test` 脚本可用；`Chain.tsx` 的默认导出（后续任务原地替换其内容）

- [ ] **Step 1: 安装依赖**

```bash
npm install react-force-graph-2d@^1.29.1
npm install -D vitest@^5.0.0
```

- [ ] **Step 2: 加 test 脚本**

在 `package.json` 的 `"scripts"` 里，`"lint"` 之后加一行：

```json
"test": "vitest run --passWithNoTests",
```

- [ ] **Step 3: 写 vitest 配置**

创建 `vitest.config.ts`：

```ts
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: 打开 JSON 模块导入**

`tsconfig.app.json` 的 `compilerOptions` 里，在 `"moduleResolution": "bundler",` 下一行插入：

```json
"resolveJsonModule": true,
```

- [ ] **Step 5: 写最小验证页**

创建 `src/pages/Chain.tsx`（这一版只有 3 个硬编码节点，用来验证 `react-force-graph-2d` 在 React 19 下能渲染；Task 4 会整文件替换）：

```tsx
import ForceGraph2D from 'react-force-graph-2d';

const DEMO_GRAPH = {
  nodes: [
    { id: '300308', name: '中际旭创' },
    { id: '688256', name: '寒武纪' },
    { id: '601138', name: '工业富联' },
  ],
  links: [
    { source: '300308', target: '601138' },
    { source: '688256', target: '601138' },
  ],
};

export default function Chain() {
  return (
    <div className="h-[70vh] rounded-[14px] border border-border-subtle bg-bg-secondary overflow-hidden">
      <ForceGraph2D
        graphData={DEMO_GRAPH}
        backgroundColor="#141416"
        nodeColor="#0A84FF"
        nodeLabel="name"
        linkColor={() => '#3A3A42'}
      />
    </div>
  );
}
```

- [ ] **Step 6: 接路由**

`src/App.tsx`：在 `const Compare = lazy(...)` 下一行加

```tsx
const Chain = lazy(() => import('@/pages/Chain'));
```

在 `<Route path="compare" .../>` 之后加

```tsx
        <Route
          path="chain"
          element={
            <Suspense fallback={<RouteFallback />}>
              <Chain />
            </Suspense>
          }
        />
```

- [ ] **Step 7: 加导航项**

`src/components/Navbar.tsx`：从 `lucide-react` 的 import 里加 `Network`，然后在 `navItems` 的 `compare` 之后加一行：

```tsx
  { path: '/chain', label: '产业链图谱', icon: Network },
```

- [ ] **Step 8: 类型检查 + 构建**

Run: `npm run build`
Expected: 退出码 0。若 `react-force-graph-2d` 的类型报错，把 `ForceGraph2D` 的 props 收敛到本步用到的这几个（`graphData/backgroundColor/nodeColor/nodeLabel/linkColor`），不要用 `as any` 绕过整个组件。

- [ ] **Step 9: 浏览器验证（兼容性闸门）**

Run: `npm run dev`
打开 `http://localhost:5173/chain`，确认：画布出现 3 个蓝色节点 + 2 条连线、可拖动旋转、控制台无报错。

**闸门**：若渲染空白或控制台报 React 版本/生命周期错误，**停下来报告**，不要继续 Task 2+；由控制者裁定是否改走 d3-force 自绘（`chain.ts` 的接口不变，只换 `GraphCanvas` 实现）。

- [ ] **Step 10: 跑测试脚本**

Run: `npm run test`
Expected: `No test files found` 但退出码 0（`--passWithNoTests` 生效）。

- [ ] **Step 11: 提交**

```bash
git add package.json package-lock.json tsconfig.app.json vitest.config.ts src/pages/Chain.tsx src/App.tsx src/components/Navbar.tsx
git commit -m "feat: 接入 react-force-graph-2d 与 vitest，新增 /chain 路由骨架"
```

---

### Task 2: 产业链数据 `ai_chain.json` + 校验测试

**Files:**
- Create: `tests/test_chain_data.py`
- Create: `src/data/ai_chain.json`

**Interfaces:**
- Consumes: `backend/stock_mapping.json`（code → name）
- Produces: `src/data/ai_chain.json`，结构为 `{ meta, segments[], stocks[] }`，字段严格按下方 schema。后续所有任务读它。

- [ ] **Step 1: 先写校验测试**

创建 `tests/test_chain_data.py`：

```python
"""校验 src/data/ai_chain.json 的结构、引用完整性与名称一致性。"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHAIN = ROOT / "src" / "data" / "ai_chain.json"
MAPPING = ROOT / "backend" / "stock_mapping.json"

VALID_TIERS = {"直接铲子", "间接铲子", "铲子的铲子"}
# stock_mapping.json 的名称带 XD/DR/XR/N/*ST 前缀且被截断，比对前先剥前缀
_PREFIX = re.compile(r"^(?:XD|XR|DR|N|\*?ST)")


def _load_chain():
    with open(CHAIN, encoding="utf-8") as f:
        return json.load(f)


def _load_mapping():
    with open(MAPPING, encoding="utf-8") as f:
        return json.load(f)


def _norm(name: str) -> str:
    return _PREFIX.sub("", name)


def test_segments_well_formed():
    data = _load_chain()
    ids = [s["id"] for s in data["segments"]]
    assert ids, "segments 不能为空"
    assert len(ids) == len(set(ids)), f"环节 id 重复: {ids}"
    for seg in data["segments"]:
        assert seg["name"], f"{seg['id']} 缺 name"
        assert seg["tier"] in VALID_TIERS, f"{seg['id']} tier 非法: {seg['tier']}"
        for ref in seg["upstream"] + seg["downstream"]:
            assert ref in ids, f"{seg['id']} 引用了未定义环节 {ref}"
            assert ref != seg["id"], f"{seg['id']} 不能以自己为上下游"


def test_stocks_well_formed():
    data = _load_chain()
    mapping = _load_mapping()
    seg_ids = {s["id"] for s in data["segments"]}

    codes = [s["code"] for s in data["stocks"]]
    assert codes, "stocks 不能为空"
    assert len(codes) == len(set(codes)), "股票代码重复"

    for stk in data["stocks"]:
        assert stk["segment"] in seg_ids, f"{stk['name']} 的环节 {stk['segment']} 未定义"
        assert stk["code"] in mapping, f"{stk['name']} ({stk['code']}) 不在 stock_mapping.json"
        assert isinstance(stk["ecosystems"], list), f"{stk['name']} ecosystems 必须是数组"
        assert stk["role"].strip(), f"{stk['name']} 缺 role"
        if "tier" in stk:
            assert stk["tier"] in VALID_TIERS, f"{stk['name']} tier 非法: {stk['tier']}"

        mapped = _norm(mapping[stk["code"]])
        assert stk["name"].startswith(mapped) or mapped.startswith(stk["name"]), (
            f"{stk['code']} 名称与 mapping 不符: json={stk['name']!r} mapping={mapping[stk['code']]!r}"
        )
```

- [ ] **Step 2: 跑测试确认它失败**

Run: `python3 -m pytest tests/test_chain_data.py -v`
Expected: FAIL — `FileNotFoundError`（`src/data/ai_chain.json` 还不存在）

- [ ] **Step 3: 解析名称 → 代码**

用这个脚本把下方环节表里的公司名转成代码（剥前缀 + 前缀匹配）：

```bash
python3 - <<'PY'
import json, re
m = json.load(open('backend/stock_mapping.json'))
norm = lambda s: re.sub(r'^(?:XD|XR|DR|N|\*?ST)', '', s)
by_name = {}
for c, n in m.items():
    by_name.setdefault(norm(n), c)
names = ["寒武纪", "海光信息"]  # ← 换成你要查的名字
for name in names:
    exact = by_name.get(name)
    if exact:
        print(f"{name}\t{exact}")
        continue
    hits = [(c, n) for c, n in m.items() if norm(n).startswith(name[:3])]
    print(f"{name}\t?{hits[:5]}")
PY
```

查不到的（如 `仕佳光子`→`688313`、`华峰测控`→`688200`，因被截断为 `仕佳光`/`华峰测`）用代码反查确认后再填。

- [ ] **Step 4: 写 `src/data/ai_chain.json`**

`meta` 固定为：

```json
"meta": { "source": "AI基础设施产业链深度报告", "updated": "2026-09-09" }
```

`segments` 用下面这张表**逐字**填（id / tier / upstream / downstream 照抄，不要增删环节）：

```jsonc
[
  { "id": "算力芯片",     "name": "算力芯片",     "tier": "直接铲子",   "upstream": ["芯片制造设备", "封测"],           "downstream": ["服务器整机"] },
  { "id": "存储",         "name": "存储",         "tier": "直接铲子",   "upstream": ["芯片制造设备"],                    "downstream": ["服务器整机"] },
  { "id": "服务器整机",   "name": "服务器整机",   "tier": "直接铲子",   "upstream": ["算力芯片", "存储", "PCB", "电源", "液冷", "铜连接"], "downstream": ["算力租赁与IDC"] },
  { "id": "算力租赁与IDC","name": "算力租赁与IDC","tier": "直接铲子",   "upstream": ["服务器整机"],                      "downstream": [] },
  { "id": "光模块",       "name": "光模块",       "tier": "直接铲子",   "upstream": ["光芯片", "PCB"],                   "downstream": ["交换机"] },
  { "id": "交换机",       "name": "交换机",       "tier": "直接铲子",   "upstream": ["光模块", "铜连接", "CPO/OCS"],     "downstream": ["服务器整机"] },
  { "id": "铜连接",       "name": "铜连接",       "tier": "直接铲子",   "upstream": [],                                  "downstream": ["服务器整机", "交换机"] },
  { "id": "PCB",          "name": "PCB",          "tier": "直接铲子",   "upstream": ["CCL", "铜箔"],                     "downstream": ["光模块", "服务器整机"] },
  { "id": "液冷",         "name": "液冷",         "tier": "直接铲子",   "upstream": [],                                  "downstream": ["服务器整机"] },
  { "id": "电源",         "name": "电源",         "tier": "直接铲子",   "upstream": ["被动元件"],                        "downstream": ["服务器整机"] },
  { "id": "被动元件",     "name": "被动元件",     "tier": "间接铲子",   "upstream": ["芯片制造材料"],                    "downstream": ["电源", "服务器整机"] },
  { "id": "CCL",          "name": "CCL",          "tier": "间接铲子",   "upstream": ["电子布", "铜箔", "树脂"],          "downstream": ["PCB"] },
  { "id": "芯片制造设备", "name": "芯片制造设备", "tier": "间接铲子",   "upstream": ["芯片制造材料", "量检测"],          "downstream": ["算力芯片", "存储"] },
  { "id": "封测",         "name": "封测",         "tier": "间接铲子",   "upstream": ["探针测试", "芯片制造设备"],        "downstream": ["算力芯片"] },
  { "id": "光芯片",       "name": "光芯片",       "tier": "间接铲子",   "upstream": ["芯片制造材料"],                    "downstream": ["光模块"] },
  { "id": "光纤光缆",     "name": "光纤光缆",     "tier": "间接铲子",   "upstream": [],                                  "downstream": ["光模块"] },
  { "id": "CPO/OCS",      "name": "CPO/OCS",      "tier": "间接铲子",   "upstream": ["光芯片"],                          "downstream": ["交换机"] },
  { "id": "电子布",       "name": "电子布",       "tier": "铲子的铲子", "upstream": [],                                  "downstream": ["CCL"] },
  { "id": "铜箔",         "name": "铜箔",         "tier": "铲子的铲子", "upstream": [],                                  "downstream": ["PCB", "CCL"] },
  { "id": "树脂",         "name": "树脂",         "tier": "铲子的铲子", "upstream": [],                                  "downstream": ["CCL"] },
  { "id": "芯片制造材料", "name": "芯片制造材料", "tier": "铲子的铲子", "upstream": [],                                  "downstream": ["芯片制造设备", "光芯片", "封测"] },
  { "id": "探针测试",     "name": "探针测试",     "tier": "铲子的铲子", "upstream": ["芯片制造材料"],                    "downstream": ["封测"] },
  { "id": "量检测",       "name": "量检测",       "tier": "铲子的铲子", "upstream": ["芯片制造材料"],                    "downstream": ["芯片制造设备", "封测"] }
]
```

`stocks` 的取材规则：**只取报告 `~/Downloads/AI基础设施产业链深度报告/AI基础设施产业链深度报告.md` 第 1117–1200 行（§9.1.1 三张子表）「国产主力」列点名的 A 股公司**，按下表归入环节。`role` 写成一句话（≤30 字），从该行「细分」+「2026景气验证」提炼；`ecosystems` 从 Global Constraints 词表里选，判断不了就给 `[]`。

| 环节 id | 候选公司（报告原文名） |
|---|---|
| 算力芯片 | 寒武纪、海光信息、芯原股份 |
| 存储 | 兆易创新、江波龙、佰维存储、德明利 |
| 服务器整机 | 工业富联、浪潮信息、华勤技术、立讯精密 |
| 算力租赁与IDC | 协创数据、利通电子、宏景科技、润泽科技、数据港 |
| 光模块 | 中际旭创、新易盛、光迅科技、华工科技、剑桥科技、联特科技 |
| 交换机 | 紫光股份、锐捷网络、盛科通信 |
| 铜连接 | 瑞可达、兆龙互连、金信诺、华丰科技、鼎通科技、意华股份 |
| PCB | 深南电路、生益电子、胜宏科技、沪电股份、鹏鼎控股 |
| 液冷 | 英维克、申菱环境、高澜股份、曙光数创、川环科技、飞龙股份、大元泵业、科创新源、中石科技 |
| 电源 | 麦格米特、欧陆通、中恒电气、科士达、科华数据、中富电路、顺络电子、新雷能、杰华特 |
| 被动元件 | 三环集团、风华高科、火炬电子、博迁新材、国瓷材料、洁美科技、江海股份 |
| CCL | 生益科技、南亚新材、华正新材 |
| 芯片制造设备 | 中微公司、北方华创、拓荆科技、微导纳米、盛美上海、芯源微、汇成真空、茂莱光学 |
| 封测 | 长电科技、通富微电、甬矽电子、华天科技 |
| 光芯片 | 源杰科技、长光华芯、仕佳光子、永鼎股份 |
| 光纤光缆 | 长飞光纤、亨通光电、烽火通信、长盈通 |
| CPO/OCS | 罗博特科、科瑞技术、光库科技、普源精电、鼎阳科技 |
| 电子布 | 宏和科技、菲利华、国际复材、中国巨石、中材科技、山东玻纤 |
| 铜箔 | 德福科技、铜冠铜箔、嘉元科技 |
| 树脂 | 圣泉集团、东材科技、联瑞新材 |
| 芯片制造材料 | 江丰电子、欧莱新材、阿石创、沪硅产业、西安奕材、石英股份、金宏气体、华特气体、中船特气、鼎龙股份、安集科技、富创精密、彤程新材 |
| 探针测试 | 和林微纳、强一股份、长川科技、华峰测控、精智达、伟测科技、矽电股份 |
| 量检测 | 中科飞测、精测电子、埃科光电 |

排除规则（写进任务报告）：
- 名字在 mapping 里查不到 → 排除并列出；
- 未上市（摩尔线程、沐曦、华为系、阿里平头哥等）→ 排除并列出；
- 名字有歧义、无法确认唯一代码 → 宁可漏掉，列出来给用户补。

单条 `stocks` 元素形如：

```json
{ "code": "300308", "name": "中际旭创", "segment": "光模块", "ecosystems": ["英伟达链"], "role": "800G/1.6T 光模块，全球份额约35%" }
```

- [ ] **Step 5: 跑测试确认通过**

Run: `python3 -m pytest tests/test_chain_data.py -v`
Expected: 2 passed

- [ ] **Step 6: 用户过目（硬闸门）**

把产物摘要写进任务报告：环节数、股票数、每环节只数、被排除的名字及原因。**在用户确认这份 JSON 之前，不得提交、不得进入 Task 3。**

- [ ] **Step 7: 提交**

```bash
git add src/data/ai_chain.json tests/test_chain_data.py
git commit -m "feat: 新增 AI 产业链关系数据与校验测试"
```

---

### Task 3: 派生纯函数 `src/lib/chain.ts`

**Files:**
- Create: `src/lib/chain.ts`
- Create: `src/lib/chain.test.ts`

**Interfaces:**
- Consumes: `@/types/api` 的 `Snapshot` / `StockItem`
- Produces（后续任务按这些签名调用，名字不可改）：
  - `type Tier = '直接铲子' | '间接铲子' | '铲子的铲子'`
  - `interface ChainSegment { id; name; tier; upstream; downstream }`
  - `interface ChainStock { code; name; segment; ecosystems; tier?; role }`
  - `interface ChainData { meta; segments; stocks }`
  - `interface StockHeat { peakSc; listed; mentions; bull; bear }`
  - `interface GraphNode { id; name; code; segment; segmentName; color; tier; ecosystems; role; peakSc; listed; mentions; bull; bear; val }`
  - `type LinkKind = 'peer' | 'ecosystem'`
  - `interface GraphLink { source; target; kind }`
  - `interface SupplyArc { from; to }`（环节 id 对）
  - `const PALETTE: string[]`、`const TIERS: Tier[]`
  - `buildPalette(segments): Record<string, string>`
  - `aggregateHeat(snapshots): Record<string, StockHeat>`
  - `nodeRadius(peakSc): number`
  - `buildNodes(data, heat): GraphNode[]`
  - `buildLinks(data): GraphLink[]`
  - `buildSupplyArcs(segments): SupplyArc[]`
  - `candidateCodes(nodes, selectedId): Set<string>`

- [ ] **Step 1: 写失败的测试**

创建 `src/lib/chain.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import {
  aggregateHeat,
  buildLinks,
  buildNodes,
  buildPalette,
  buildSupplyArcs,
  candidateCodes,
  nodeRadius,
} from './chain';
import type { ChainData, ChainSegment } from './chain';
import type { Snapshot } from '@/types/api';

const SEGMENTS: ChainSegment[] = [
  { id: '光模块', name: '光模块', tier: '直接铲子', upstream: ['光芯片'], downstream: ['交换机'] },
  { id: '光芯片', name: '光芯片', tier: '间接铲子', upstream: [], downstream: ['光模块'] },
  { id: '交换机', name: '交换机', tier: '直接铲子', upstream: ['光模块'], downstream: [] },
];

const DATA: ChainData = {
  meta: { source: 'test', updated: '2026-09-09' },
  segments: SEGMENTS,
  stocks: [
    { code: '300308', name: '中际旭创', segment: '光模块', ecosystems: ['英伟达链'], role: 'r1' },
    { code: '300502', name: '新易盛', segment: '光模块', ecosystems: ['英伟达链'], role: 'r2' },
    { code: '002281', name: '光迅科技', segment: '光模块', ecosystems: [], role: 'r3' },
    { code: '688313', name: '仕佳光子', segment: '光芯片', ecosystems: ['英伟达链'], role: 'r4' },
  ],
};

function snap(t: string, stks: Array<{ c: string; sc: number; mc: number; bu: number; be: number }>): Snapshot {
  return {
    t,
    msg: 10,
    grp: 2,
    sent: '偏多',
    sd: { bu: 1, be: 0, ne: 0, eh: 0, el: 0 },
    act: {},
    stk: stks.map((s) => ({ ...s, n: s.c, gc: 1, ac: 0, ft: t, lt: t, sec: [] })),
    sec: [],
  };
}

describe('buildPalette', () => {
  it('按 segments 顺序确定性分配颜色', () => {
    const a = buildPalette(SEGMENTS);
    const b = buildPalette(SEGMENTS);
    expect(a).toEqual(b);
    expect(a['光模块']).toBeTruthy();
    expect(a['光模块']).not.toBe(a['光芯片']);
  });

  it('在末尾追加环节不改变已有环节的颜色', () => {
    const before = buildPalette(SEGMENTS);
    const after = buildPalette([
      ...SEGMENTS,
      { id: '液冷', name: '液冷', tier: '直接铲子', upstream: [], downstream: [] },
    ]);
    expect(after['光模块']).toBe(before['光模块']);
    expect(after['光芯片']).toBe(before['光芯片']);
  });
});

describe('aggregateHeat', () => {
  it('空快照返回空对象', () => {
    expect(aggregateHeat([])).toEqual({});
  });

  it('取当日峰值 sc、标记上榜、累计值取最后一次出现的快照', () => {
    const heat = aggregateHeat([
      snap('2026-09-09 09:35', [{ c: '300308', sc: 40, mc: 3, bu: 1, be: 0 }]),
      snap('2026-09-09 10:35', [
        { c: '300308', sc: 92, mc: 9, bu: 4, be: 1 },
        { c: '300502', sc: 30, mc: 2, bu: 0, be: 1 },
      ]),
    ]);
    expect(heat['300308']).toEqual({ peakSc: 92, listed: true, mentions: 9, bull: 4, bear: 1 });
    expect(heat['300502']).toEqual({ peakSc: 30, listed: true, mentions: 2, bull: 0, bear: 1 });
    expect(heat['002281']).toBeUndefined();
  });
});

describe('buildLinks', () => {
  it('同业边为同环节两两相连，阵营边只连跨环节，且不重复', () => {
    const links = buildLinks(DATA);
    const peer = links.filter((l) => l.kind === 'peer');
    const eco = links.filter((l) => l.kind === 'ecosystem');
    expect(peer).toHaveLength(3); // 光模块 3 只 → C(3,2)
    expect(eco).toHaveLength(2); // 英伟达链: 旭创×仕佳、新易盛×仕佳
    const keys = links.map((l) => `${l.kind}:${l.source}|${l.target}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(eco.every((l) => !(l.source === '300308' && l.target === '300502'))).toBe(true);
  });
});

describe('buildSupplyArcs', () => {
  it('合并 upstream/downstream 两个方向并去重', () => {
    const arcs = buildSupplyArcs(SEGMENTS);
    const keys = arcs.map((a) => `${a.from}->${a.to}`).sort();
    expect(keys).toEqual(['光模块->交换机', '光芯片->光模块']);
  });
});

describe('candidateCodes', () => {
  it('只返回选中票的同环节未上榜票', () => {
    const nodes = buildNodes(DATA, {
      '300308': { peakSc: 92, listed: true, mentions: 9, bull: 4, bear: 1 },
      '300502': { peakSc: 30, listed: true, mentions: 2, bull: 0, bear: 1 },
    });
    const cands = candidateCodes(nodes, '300308');
    expect([...cands]).toEqual(['002281']);
    expect(candidateCodes(nodes, null).size).toBe(0);
    expect(candidateCodes(nodes, '不存在的代码').size).toBe(0);
  });
});

describe('nodeRadius', () => {
  it('随热度单调递增，未上榜仍可见', () => {
    expect(nodeRadius(0)).toBeGreaterThan(0);
    expect(nodeRadius(50)).toBeGreaterThan(nodeRadius(10));
    expect(nodeRadius(92)).toBeGreaterThan(nodeRadius(50));
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test`
Expected: FAIL — `Failed to resolve import "./chain"`

- [ ] **Step 3: 写实现**

创建 `src/lib/chain.ts`：

```ts
// AI 产业链图谱的派生逻辑：把静态关系数据 + 当日快照，算成画布要的节点/边/弧线。
// 全是纯函数，便于单测；组件只负责画。
import type { Snapshot } from '@/types/api';

export type Tier = '直接铲子' | '间接铲子' | '铲子的铲子';

export const TIERS: Tier[] = ['直接铲子', '间接铲子', '铲子的铲子'];

export interface ChainSegment {
  id: string;
  name: string;
  tier: Tier;
  upstream: string[];
  downstream: string[];
}

export interface ChainStock {
  code: string;
  name: string;
  segment: string;
  ecosystems: string[];
  tier?: Tier;
  role: string;
}

export interface ChainData {
  meta: { source: string; updated: string };
  segments: ChainSegment[];
  stocks: ChainStock[];
}

export interface StockHeat {
  peakSc: number;
  listed: boolean;
  mentions: number;
  bull: number;
  bear: number;
}

export interface GraphNode {
  id: string;
  name: string;
  code: string;
  segment: string;
  segmentName: string;
  color: string;
  tier: Tier;
  ecosystems: string[];
  role: string;
  peakSc: number;
  listed: boolean;
  mentions: number;
  bull: number;
  bear: number;
  val: number;
}

export type LinkKind = 'peer' | 'ecosystem';

export interface GraphLink {
  source: string;
  target: string;
  kind: LinkKind;
}

export interface SupplyArc {
  from: string;
  to: string;
}

// 确定性调色板：按 segments 数组下标取色，末尾追加环节不影响已有颜色。
export const PALETTE = [
  '#30D158', '#0A84FF', '#FF9F0A', '#FF375F', '#BF5AF2',
  '#64D2FF', '#FFD60A', '#5E5CE6', '#FF6961', '#63E6E2',
  '#AC8E68', '#DA8FFF', '#66D4CF', '#FFB340', '#FF6482',
  '#8E8E93', '#40C8E0', '#FFD426', '#A0C862', '#C77DFF',
];

export function buildPalette(segments: ChainSegment[]): Record<string, string> {
  const out: Record<string, string> = {};
  segments.forEach((seg, i) => {
    out[seg.id] = PALETTE[i % PALETTE.length];
  });
  return out;
}

export function aggregateHeat(snapshots: Snapshot[]): Record<string, StockHeat> {
  const out: Record<string, StockHeat> = {};
  for (const snap of snapshots) {
    for (const stk of snap?.stk ?? []) {
      const cur = out[stk.c];
      if (!cur) {
        out[stk.c] = {
          peakSc: stk.sc,
          listed: true,
          mentions: stk.mc,
          bull: stk.bu,
          bear: stk.be,
        };
        continue;
      }
      cur.peakSc = Math.max(cur.peakSc, stk.sc);
      // 快照是累计语义：最后一次出现的那条就是当日累计值
      cur.mentions = stk.mc;
      cur.bull = stk.bu;
      cur.bear = stk.be;
    }
  }
  return out;
}

export function nodeRadius(peakSc: number): number {
  if (peakSc <= 0) return 3;
  return 3 + Math.sqrt(peakSc) * 2;
}

export function buildNodes(data: ChainData, heat: Record<string, StockHeat>): GraphNode[] {
  const palette = buildPalette(data.segments);
  const segById = new Map(data.segments.map((s) => [s.id, s]));
  return data.stocks.map((stk) => {
    const seg = segById.get(stk.segment);
    const h = heat[stk.code];
    const peakSc = h?.peakSc ?? 0;
    return {
      id: stk.code,
      name: stk.name,
      code: stk.code,
      segment: stk.segment,
      segmentName: seg?.name ?? stk.segment,
      color: palette[stk.segment] ?? '#8E8E93',
      tier: stk.tier ?? seg?.tier ?? '直接铲子',
      ecosystems: stk.ecosystems,
      role: stk.role,
      peakSc,
      listed: h?.listed ?? false,
      mentions: h?.mentions ?? 0,
      bull: h?.bull ?? 0,
      bear: h?.bear ?? 0,
      val: nodeRadius(peakSc),
    };
  });
}

export function buildLinks(data: ChainData): GraphLink[] {
  const links: GraphLink[] = [];
  const seen = new Set<string>();
  const push = (a: string, b: string, kind: LinkKind) => {
    const key = a < b ? `${kind}:${a}|${b}` : `${kind}:${b}|${a}`;
    if (seen.has(key)) return;
    seen.add(key);
    links.push({ source: a, target: b, kind });
  };

  const bySegment = new Map<string, ChainStock[]>();
  for (const stk of data.stocks) {
    const arr = bySegment.get(stk.segment) ?? [];
    arr.push(stk);
    bySegment.set(stk.segment, arr);
  }
  for (const arr of bySegment.values()) {
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) push(arr[i].code, arr[j].code, 'peer');
    }
  }

  const byEco = new Map<string, ChainStock[]>();
  for (const stk of data.stocks) {
    for (const eco of stk.ecosystems) {
      const arr = byEco.get(eco) ?? [];
      arr.push(stk);
      byEco.set(eco, arr);
    }
  }
  for (const arr of byEco.values()) {
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        if (arr[i].segment === arr[j].segment) continue; // 同环节已有同业边
        push(arr[i].code, arr[j].code, 'ecosystem');
      }
    }
  }
  return links;
}

export function buildSupplyArcs(segments: ChainSegment[]): SupplyArc[] {
  const seen = new Set<string>();
  const arcs: SupplyArc[] = [];
  const add = (from: string, to: string) => {
    const key = `${from}->${to}`;
    if (seen.has(key)) return;
    seen.add(key);
    arcs.push({ from, to });
  };
  for (const seg of segments) {
    for (const up of seg.upstream) add(up, seg.id);
    for (const down of seg.downstream) add(seg.id, down);
  }
  return arcs;
}

export function candidateCodes(nodes: GraphNode[], selectedId: string | null): Set<string> {
  const out = new Set<string>();
  if (!selectedId) return out;
  const sel = nodes.find((n) => n.id === selectedId);
  if (!sel) return out;
  for (const n of nodes) {
    if (n.segment === sel.segment && !n.listed) out.add(n.id);
  }
  return out;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm run test`
Expected: 全部 passed（7 个用例）

- [ ] **Step 5: 类型检查**

Run: `npm run build`
Expected: 退出码 0

- [ ] **Step 6: 提交**

```bash
git add src/lib/chain.ts src/lib/chain.test.ts
git commit -m "feat: 新增产业链图谱派生逻辑与单测"
```

---

### Task 4: 桌面画布 `GraphCanvas.tsx` + 真实数据接入

**Files:**
- Create: `src/components/chain/GraphCanvas.tsx`
- Modify: `src/pages/Chain.tsx`（整文件替换 Task 1 的骨架）

**Interfaces:**
- Consumes: Task 2 的 `@/data/ai_chain.json`；Task 3 的 `GraphNode` / `GraphLink` / `SupplyArc` / `ChainData`
- Produces: `<GraphCanvas nodes links arcs showPeer showSupply showEcosystem selectedId candidateIds onSelect />`

- [ ] **Step 1: 写画布组件**

创建 `src/components/chain/GraphCanvas.tsx`：

```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import type { GraphLink, GraphNode, SupplyArc } from '@/lib/chain';

// react-force-graph 会在运行时往节点上挂 x/y/vx/vy，类型里没有，这里补齐。
type SimNode = GraphNode & { x?: number; y?: number };

// d3 跑完布局后 link.source/target 是节点对象，之前是字符串，两种都取到 id。
function linkId(end: unknown): string {
  return typeof end === 'string' ? end : (end as GraphNode).id;
}

interface Props {
  nodes: GraphNode[];
  links: GraphLink[];
  arcs: SupplyArc[];
  showPeer: boolean;
  showSupply: boolean;
  showEcosystem: boolean;
  selectedId: string | null;
  candidateIds: Set<string>;
  onSelect: (id: string | null) => void;
}

export default function GraphCanvas({
  nodes,
  links,
  arcs,
  showPeer,
  showSupply,
  showEcosystem,
  selectedId,
  candidateIds,
  onSelect,
}: Props) {
  // 组件不重挂载，只让 d3 重新跑布局
  const fgRef = useRef<{ zoomToFit: (ms?: number, px?: number) => void } | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });

  // 画布必须给宽高，跟随容器尺寸
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const visibleLinks = useMemo(
    () =>
      links.filter((l) =>
        l.kind === 'peer' ? showPeer : showEcosystem,
      ),
    [links, showPeer, showEcosystem],
  );

  // d3 会把 link 的 source/target 从字符串改写成节点对象，且是原地改写；
  // 传副本出去，免得父组件的 links 被改脏（上层还要按字符串过滤）。
  const graphData = useMemo(
    () => ({ nodes, links: visibleLinks.map((l) => ({ ...l })) }),
    [nodes, visibleLinks],
  );

  // 环节簇中心：上下游弧线按簇心画，不做公司两两连边
  const segmentCenters = useMemo(() => {
    const acc = new Map<string, { x: number; y: number; n: number }>();
    for (const node of nodes as SimNode[]) {
      if (typeof node.x !== 'number' || typeof node.y !== 'number') continue;
      const cur = acc.get(node.segment) ?? { x: 0, y: 0, n: 0 };
      cur.x += node.x;
      cur.y += node.y;
      cur.n += 1;
      acc.set(node.segment, cur);
    }
    const out = new Map<string, { x: number; y: number }>();
    for (const [id, v] of acc) {
      if (v.n > 0) out.set(id, { x: v.x / v.n, y: v.y / v.n });
    }
    return out;
  }, [nodes]);

  useEffect(() => {
    fgRef.current?.zoomToFit(400, 60);
  }, [nodes.length]);

  const paintNode = useCallback(
    (rawNode: unknown, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const node = rawNode as SimNode;
      const r = node.val;
      const isSelected = node.id === selectedId;
      const isCandidate = candidateIds.has(node.id);
      const dimmed = selectedId !== null && !isSelected && !isCandidate && !node.listed;

      ctx.beginPath();
      ctx.arc(node.x ?? 0, node.y ?? 0, r, 0, Math.PI * 2);
      ctx.fillStyle = node.color;
      ctx.globalAlpha = node.listed ? (dimmed ? 0.3 : 0.92) : dimmed ? 0.18 : 0.3;
      ctx.fill();
      ctx.globalAlpha = 1;

      if (!node.listed) {
        ctx.setLineDash([2, 2]);
        ctx.strokeStyle = node.color;
        ctx.lineWidth = 1 / globalScale;
        ctx.stroke();
        ctx.setLineDash([]);
      }

      if (isCandidate) {
        ctx.beginPath();
        ctx.arc(node.x ?? 0, node.y ?? 0, r + 3, 0, Math.PI * 2);
        ctx.strokeStyle = '#FFD60A';
        ctx.lineWidth = 2 / globalScale;
        ctx.stroke();
      } else if (isSelected) {
        ctx.beginPath();
        ctx.arc(node.x ?? 0, node.y ?? 0, r + 3, 0, Math.PI * 2);
        ctx.strokeStyle = '#0A84FF';
        ctx.lineWidth = 2.5 / globalScale;
        ctx.stroke();
      } else if (node.listed) {
        ctx.beginPath();
        ctx.arc(node.x ?? 0, node.y ?? 0, r + 1.5, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 1.2 / globalScale;
        ctx.stroke();
      }

      // 标签只给够热或够相关的票，避免上百节点糊成一片
      const showLabel = isSelected || isCandidate || node.peakSc >= 60;
      if (showLabel && globalScale > 0.5) {
        const label = node.name;
        ctx.font = `${isSelected ? 600 : 400} ${11 / globalScale}px Inter, "PingFang SC", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = isSelected ? '#F4F4F7' : 'rgba(165,165,172,0.9)';
        ctx.fillText(label, node.x ?? 0, (node.y ?? 0) + r + 2);
      }
    },
    [candidateIds, selectedId],
  );

  const paintPointerArea = useCallback((rawNode: unknown, color: string, ctx: CanvasRenderingContext2D) => {
    const node = rawNode as SimNode;
    ctx.beginPath();
    ctx.arc(node.x ?? 0, node.y ?? 0, node.val + 2, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }, []);

  return (
    <div ref={wrapRef} className="w-full h-full">
      <ForceGraph2D
        ref={fgRef as never}
        width={size.width}
        height={size.height}
        graphData={graphData}
        backgroundColor="#0A0A0D"
        nodeCanvasObject={paintNode}
        nodePointerAreaPaint={paintPointerArea}
        linkColor={(l) => {
          const link = l as unknown as GraphLink;
          const touchesSel =
            selectedId !== null &&
            (linkId(link.source) === selectedId || linkId(link.target) === selectedId);
          if (link.kind === 'peer') return touchesSel ? 'rgba(48,209,88,0.85)' : 'rgba(58,58,66,0.9)';
          return touchesSel ? 'rgba(191,90,242,0.9)' : 'rgba(191,90,242,0.35)';
        }}
        linkWidth={(l) => {
          const link = l as unknown as GraphLink;
          return link.kind === 'peer' ? 1 : 1.2;
        }}
        linkCurvature={(l) => ((l as unknown as GraphLink).kind === 'ecosystem' ? 0.25 : 0)}
        onNodeClick={(n) => onSelect((n as unknown as GraphNode).id)}
        onBackgroundClick={() => onSelect(null)}
        onRenderFramePost={(ctx, globalScale) => {
          if (!showSupply) return;
          ctx.save();
          ctx.strokeStyle = 'rgba(74,74,82,0.75)';
          ctx.lineWidth = 1.2 / globalScale;
          ctx.setLineDash([7 / globalScale, 6 / globalScale]);
          for (const arc of arcs) {
            const a = segmentCenters.get(arc.from);
            const b = segmentCenters.get(arc.to);
            if (!a || !b) continue;
            const mx = (a.x + b.x) / 2;
            const my = (a.y + b.y) / 2;
            const nx = -(b.y - a.y);
            const ny = b.x - a.x;
            const len = Math.hypot(nx, ny) || 1;
            const k = Math.min(60, len * 0.22);
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.quadraticCurveTo(mx + (nx / len) * k, my + (ny / len) * k, b.x, b.y);
            ctx.stroke();
          }
          ctx.restore();
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: 页面接入真实数据**

整文件替换 `src/pages/Chain.tsx`：

```tsx
import { useEffect, useMemo, useState } from 'react';
import rawChainData from '@/data/ai_chain.json';
import { useStore } from '@/store/useStore';
import {
  aggregateHeat,
  buildLinks,
  buildNodes,
  buildSupplyArcs,
  candidateCodes,
  type ChainData,
} from '@/lib/chain';
import GraphCanvas from '@/components/chain/GraphCanvas';

// JSON 里 tier 是 string，运行时形状由 tests/test_chain_data.py 保证
const CHAIN_DATA = rawChainData as unknown as ChainData;

export default function Chain() {
  const snapshots = useStore((s) => s.currentDayData?.snapshots ?? []);
  const dayFullLoaded = useStore((s) => s.dayFullLoaded);
  const loadDayFull = useStore((s) => s.loadDayFull);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showPeer, setShowPeer] = useState(true);
  const [showSupply, setShowSupply] = useState(false);
  const [showEcosystem, setShowEcosystem] = useState(false);

  useEffect(() => {
    if (!dayFullLoaded) loadDayFull();
  }, [dayFullLoaded, loadDayFull]);

  const heat = useMemo(() => aggregateHeat(snapshots), [snapshots]);
  const nodes = useMemo(() => buildNodes(CHAIN_DATA, heat), [heat]);
  const links = useMemo(() => buildLinks(CHAIN_DATA), []);
  const arcs = useMemo(() => buildSupplyArcs(CHAIN_DATA.segments), []);
  const candidates = useMemo(() => candidateCodes(nodes, selectedId), [nodes, selectedId]);

  return (
    <div className="flex flex-col h-[calc(100dvh-140px)] gap-3">
      <div className="flex items-center gap-2 flex-wrap text-[13px]">
        <Toggle label="同业" on={showPeer} onClick={() => setShowPeer((v) => !v)} />
        <Toggle label="上下游" on={showSupply} onClick={() => setShowSupply((v) => !v)} />
        <Toggle label="阵营" on={showEcosystem} onClick={() => setShowEcosystem((v) => !v)} />
        <span className="text-ink-tertiary ml-2">
          节点大小 = 当日峰值热度 · 描边 = 今日上榜 · 虚线 = 未上榜
        </span>
      </div>

      <div className="flex-1 min-h-0 rounded-[14px] border border-border-subtle bg-bg-secondary overflow-hidden">
        <GraphCanvas
          nodes={nodes}
          links={links}
          arcs={arcs}
          showPeer={showPeer}
          showSupply={showSupply}
          showEcosystem={showEcosystem}
          selectedId={selectedId}
          candidateIds={candidates}
          onSelect={setSelectedId}
        />
      </div>
    </div>
  );
}

function Toggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 h-[30px] rounded-[8px] border text-[12.5px] transition-colors ${
        on
          ? 'border-brand-blue/55 bg-brand-blue/15 text-brand-blue'
          : 'border-border-subtle bg-bg-tertiary text-ink-secondary'
      }`}
    >
      {label}
    </button>
  );
}
```

- [ ] **Step 3: 构建**

Run: `npm run build`
Expected: 退出码 0

- [ ] **Step 4: 浏览器验证**

Run: `npm run dev`，打开 `/chain`：
- 环节按颜色聚成簇，同环节之间有细线；
- 打开「上下游」后出现环节簇之间的虚线弧线；
- 打开「阵营」后出现跨环节紫色虚线；
- 今日上榜的票有白色描边，未上榜是虚线小点；
- 热度高的票显示名称，未上榜的不显示。

- [ ] **Step 5: 提交**

```bash
git add src/components/chain/GraphCanvas.tsx src/pages/Chain.tsx
git commit -m "feat: 产业链图谱桌面画布与真实数据接入"
```

---

### Task 5: 桌面交互与详情栏

**Files:**
- Create: `src/components/chain/DetailPanel.tsx`
- Modify: `src/pages/Chain.tsx`

**Interfaces:**
- Consumes: Task 3 的 `GraphNode`；Task 4 的 `GraphCanvas`
- Produces: `<DetailPanel node nodes onSelect onClose? />`（桌面右栏与 Task 6 移动端抽屉共用）

- [ ] **Step 1: 写详情面板**

创建 `src/components/chain/DetailPanel.tsx`：

```tsx
import { Link } from 'react-router-dom';
import type { GraphNode } from '@/lib/chain';

interface Props {
  node: GraphNode;
  nodes: GraphNode[];
  onSelect: (id: string) => void;
  onClose?: () => void;
}

const TIER_STYLE: Record<string, string> = {
  直接铲子: 'bg-brand-blue/15 text-brand-blue',
  间接铲子: 'bg-brand-purple/15 text-brand-purple',
  铲子的铲子: 'bg-brand-yellow/15 text-brand-yellow',
};

export default function DetailPanel({ node, nodes, onSelect, onClose }: Props) {
  const neighbors = nodes
    .filter((n) => n.segment === node.segment && n.id !== node.id)
    .sort((a, b) => b.peakSc - a.peakSc);

  return (
    <div className="text-[13px]">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[15px] font-semibold text-ink-primary">{node.name}</div>
          <div className="font-mono text-[11.5px] text-ink-tertiary">{node.code}</div>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-ink-tertiary hover:text-ink-secondary text-[16px] leading-none px-1">
            ✕
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5 mt-3">
        <span
          className="px-2 py-[2px] rounded-[6px] text-[11px] font-semibold"
          style={{ backgroundColor: `${node.color}22`, color: node.color }}
        >
          {node.segmentName}
        </span>
        {node.ecosystems.map((eco) => (
          <span key={eco} className="px-2 py-[2px] rounded-[6px] text-[11px] font-semibold bg-brand-purple/15 text-brand-purple">
            {eco}
          </span>
        ))}
        <span className={`px-2 py-[2px] rounded-[6px] text-[11px] font-semibold ${TIER_STYLE[node.tier] ?? 'bg-bg-tertiary text-ink-secondary'}`}>
          {node.tier}
        </span>
      </div>

      <div className="mt-3">
        <Row label="今日峰值热度" value={node.peakSc > 0 ? String(node.peakSc) : '未上榜'} />
        <Row label="累计提及" value={String(node.mentions)} />
        <Row label="看多 / 看空" value={`${node.bull} / ${node.bear}`} />
        <Row label="今日上榜" value={node.listed ? '是' : '否'} />
      </div>

      <p className="mt-3 text-[12px] leading-relaxed text-ink-secondary">{node.role}</p>

      <Link
        to={`/stock/${node.code}`}
        className="block text-center mt-4 py-2 rounded-[8px] bg-brand-blue text-white text-[12.5px] font-semibold"
      >
        → 个股详情
      </Link>

      {neighbors.length > 0 && (
        <>
          <div className="mt-4 mb-1 text-[10.5px] tracking-[0.09em] uppercase text-ink-quaternary">
            同环节邻居
          </div>
          {neighbors.map((n) => (
            <button
              key={n.id}
              onClick={() => onSelect(n.id)}
              className="w-full flex items-center gap-2 py-[5px] text-left hover:bg-hover/[0.04] rounded-[6px] px-1"
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: n.color }} />
              <span className="flex-1 text-ink-primary">{n.name}</span>
              <span className={`font-mono text-[11.5px] ${n.listed ? 'text-ink-tertiary' : 'text-brand-yellow'}`}>
                {n.listed ? n.peakSc : '未上榜'}
              </span>
            </button>
          ))}
        </>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-[6px] border-b border-dashed border-border-subtle">
      <span className="text-ink-tertiary">{label}</span>
      <span className="text-ink-primary">{value}</span>
    </div>
  );
}
```

- [ ] **Step 2: 接入过滤条、搜索、同链未上榜开关、右栏**

修改 `src/pages/Chain.tsx`：在文件顶部 import 区加

```tsx
import DetailPanel from '@/components/chain/DetailPanel';
import { TIERS, type Tier } from '@/lib/chain';
```

在 `Chain` 组件里加状态与派生（放在现有 `candidates` 之后）：

```tsx
  const [segmentFilter, setSegmentFilter] = useState<Set<string>>(new Set());
  const [ecoFilter, setEcoFilter] = useState<Set<string>>(new Set());
  const [tierFilter, setTierFilter] = useState<Set<Tier>>(new Set());
  const [query, setQuery] = useState('');
  const [highlightCandidates, setHighlightCandidates] = useState(true);

  const allEcosystems = useMemo(
    () => Array.from(new Set(CHAIN_DATA.stocks.flatMap((s) => s.ecosystems))).sort(),
    [],
  );

  const visibleNodes = useMemo(() => {
    const q = query.trim();
    return nodes.filter((n) => {
      if (segmentFilter.size > 0 && !segmentFilter.has(n.segment)) return false;
      if (tierFilter.size > 0 && !tierFilter.has(n.tier)) return false;
      if (ecoFilter.size > 0 && !n.ecosystems.some((e) => ecoFilter.has(e))) return false;
      if (q && !n.name.includes(q) && !n.code.includes(q)) return false;
      return true;
    });
  }, [nodes, segmentFilter, tierFilter, ecoFilter, query]);

  const visibleIds = useMemo(() => new Set(visibleNodes.map((n) => n.id)), [visibleNodes]);
  const visibleLinks = useMemo(
    () => links.filter((l) => visibleIds.has(l.source) && visibleIds.has(l.target)),
    [links, visibleIds],
  );
  const selected = useMemo(() => nodes.find((n) => n.id === selectedId) ?? null, [nodes, selectedId]);
```

把渲染部分替换为：

```tsx
  return (
    <div className="flex flex-col lg:flex-row gap-3 h-[calc(100dvh-140px)]">
      <div className="flex-1 min-h-0 flex flex-col gap-3">
        <div className="flex items-center gap-2 flex-wrap text-[13px]">
          <Filter label="环节" options={CHAIN_DATA.segments.map((s) => s.id)} selected={segmentFilter} onChange={setSegmentFilter} />
          <Filter label="阵营" options={allEcosystems} selected={ecoFilter} onChange={setEcoFilter} />
          <Filter label="层级" options={TIERS as unknown as string[]} selected={tierFilter as unknown as Set<string>} onChange={(next) => setTierFilter(next as Set<Tier>)} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="名称或代码"
            className="h-[30px] px-3 rounded-[8px] border border-border-subtle bg-bg-secondary text-[12.5px] text-ink-primary outline-none focus:border-border-focus w-[150px]"
          />
          <Toggle label="同业" on={showPeer} onClick={() => setShowPeer((v) => !v)} />
          <Toggle label="上下游" on={showSupply} onClick={() => setShowSupply((v) => !v)} />
          <Toggle label="阵营" on={showEcosystem} onClick={() => setShowEcosystem((v) => !v)} />
          <Toggle
            label="高亮同链未上榜"
            on={highlightCandidates}
            onClick={() => setHighlightCandidates((v) => !v)}
          />
        </div>

        <div className="flex-1 min-h-0 rounded-[14px] border border-border-subtle bg-bg-secondary overflow-hidden">
          <GraphCanvas
            nodes={visibleNodes}
            links={visibleLinks}
            arcs={arcs}
            showPeer={showPeer}
            showSupply={showSupply}
            showEcosystem={showEcosystem}
            selectedId={selectedId}
            candidateIds={highlightCandidates ? candidates : EMPTY_SET}
            onSelect={setSelectedId}
          />
        </div>
      </div>

      <aside className="hidden lg:block w-[280px] shrink-0 rounded-[14px] border border-border-subtle bg-bg-secondary p-4 overflow-y-auto">
        {selected ? (
          <DetailPanel node={selected} nodes={nodes} onSelect={setSelectedId} />
        ) : (
          <p className="text-[12.5px] text-ink-tertiary leading-relaxed">
            点一个节点看它的环节、阵营与今日热度。
            <br />
            <br />
            选中今日热票后，同环节里未上榜的票会被标成
            <span className="text-brand-yellow"> 补涨候选</span>。
          </p>
        )}
      </aside>
    </div>
  );
}

const EMPTY_SET = new Set<string>();

function Filter({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`px-3 h-[30px] rounded-[8px] border text-[12.5px] ${
          selected.size > 0
            ? 'border-brand-blue/55 bg-brand-blue/15 text-brand-blue'
            : 'border-border-subtle bg-bg-tertiary text-ink-secondary'
        }`}
      >
        {label}
        {selected.size > 0 ? ` · ${selected.size}` : ''} ▾
      </button>
      {open && (
        <div className="absolute z-20 mt-1 min-w-[160px] max-h-[280px] overflow-y-auto rounded-[10px] border border-border-subtle bg-bg-tertiary shadow-elevated p-1">
          {options.map((opt) => {
            const on = selected.has(opt);
            return (
              <button
                key={opt}
                onClick={() => {
                  const next = new Set(selected);
                  if (on) next.delete(opt);
                  else next.add(opt);
                  onChange(next);
                }}
                className="w-full text-left px-2 py-[6px] rounded-[6px] text-[12.5px] hover:bg-hover/[0.06] flex items-center gap-2"
              >
                <span className={`w-3 h-3 rounded-[3px] border ${on ? 'bg-brand-blue border-brand-blue' : 'border-border-default'}`} />
                <span className={on ? 'text-ink-primary' : 'text-ink-secondary'}>{opt}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: 构建**

Run: `npm run build`
Expected: 退出码 0

- [ ] **Step 4: 浏览器验证**

Run: `npm run dev`，打开 `/chain`：
- 三个下拉可多选，筛选后节点数变化；
- 搜索框输「旭创」只剩中际旭创，输「3003」也命中；
- 点中际旭创 → 右栏出现详情，同环节边变绿、其余压暗；
- 「高亮同链未上榜」开着时，光迅科技（同环节、未上榜）出现黄圈；关掉黄圈消失；
- 「→ 个股详情」跳到 `/stock/300308`；
- 点空白取消选中，右栏回到提示文案。

- [ ] **Step 5: 提交**

```bash
git add src/components/chain/DetailPanel.tsx src/pages/Chain.tsx
git commit -m "feat: 产业链图谱过滤、搜索、选中高亮与详情栏"
```

---

### Task 6: 窄屏图谱 + 列表视图

**Files:**
- Create: `src/components/chain/ChainList.tsx`
- Modify: `src/pages/Chain.tsx`

**Interfaces:**
- Consumes: Task 3 的 `GraphNode`；Task 4 的 `GraphCanvas`；Task 5 的 `DetailPanel`
- Produces: `<ChainList nodes selectedId candidateIds onSelect />`；`Chain.tsx` 在 `<768px` 下的「图谱 / 列表」双视图

- [ ] **Step 1: 写列表视图**

创建 `src/components/chain/ChainList.tsx`：

```tsx
import { useMemo, useState } from 'react';
import type { GraphNode } from '@/lib/chain';

interface Props {
  nodes: GraphNode[];
  selectedId: string | null;
  candidateIds: Set<string>;
  onSelect: (id: string) => void;
}

export default function ChainList({ nodes, selectedId, candidateIds, onSelect }: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const groups = useMemo(() => {
    const map = new Map<string, { name: string; color: string; items: GraphNode[] }>();
    for (const n of nodes) {
      const g = map.get(n.segment) ?? { name: n.segmentName, color: n.color, items: [] };
      g.items.push(n);
      map.set(n.segment, g);
    }
    for (const g of map.values()) g.items.sort((a, b) => b.peakSc - a.peakSc);
    return Array.from(map.entries());
  }, [nodes]);

  return (
    <div className="h-full overflow-y-auto">
      {groups.map(([segId, g]) => {
        const isCollapsed = collapsed.has(segId);
        return (
          <div key={segId}>
            <button
              onClick={() => {
                const next = new Set(collapsed);
                if (isCollapsed) next.delete(segId);
                else next.add(segId);
                setCollapsed(next);
              }}
              className="w-full flex items-center gap-2 px-4 py-[9px] bg-bg-tertiary border-t border-border-subtle text-left"
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: g.color }} />
              <span className="text-[12.5px] font-semibold text-ink-primary">{g.name}</span>
              <span className="text-[11px] text-ink-quaternary">{g.items.length}</span>
              <span className="ml-auto text-[9px] text-ink-quaternary">{isCollapsed ? '▸' : '▾'}</span>
            </button>

            {!isCollapsed &&
              g.items.map((n) => {
                const isSel = n.id === selectedId;
                const isCand = candidateIds.has(n.id);
                return (
                  <button
                    key={n.id}
                    onClick={() => onSelect(n.id)}
                    className="w-full flex items-center gap-2 px-4 py-2 pl-[13px] border-l-[3px] text-left"
                    style={{
                      borderLeftColor: isSel ? '#0A84FF' : isCand ? '#FFD60A' : 'transparent',
                      backgroundColor: isSel
                        ? 'rgba(10,132,255,0.07)'
                        : isCand
                          ? 'rgba(255,214,10,0.06)'
                          : undefined,
                    }}
                  >
                    <span className="flex-1 min-w-0">
                      <span className={`block text-[12.5px] truncate ${n.listed ? 'text-ink-primary' : 'text-ink-tertiary'}`}>
                        {n.name}
                      </span>
                      <span className="block font-mono text-[10.5px] text-ink-quaternary">{n.code}</span>
                    </span>
                    {isCand && (
                      <span className="shrink-0 text-[9px] font-bold text-brand-yellow bg-brand-yellow/15 border border-brand-yellow/35 rounded-[5px] px-[5px] py-[1px]">
                        补涨候选
                      </span>
                    )}
                    {n.listed ? (
                      <>
                        <span className="shrink-0 w-[52px] h-[4px] rounded-[3px] bg-bg-tertiary overflow-hidden">
                          <span
                            className="block h-full rounded-[3px]"
                            style={{ width: `${Math.min(100, n.peakSc)}%`, backgroundColor: g.color }}
                          />
                        </span>
                        <span className="shrink-0 w-[26px] text-right font-mono text-[11.5px] text-ink-secondary">
                          {n.peakSc}
                        </span>
                      </>
                    ) : (
                      <span className="shrink-0 text-[10.5px] text-ink-quaternary">未上榜</span>
                    )}
                  </button>
                );
              })}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: 页面接入窄屏布局**

修改 `src/pages/Chain.tsx`：

1. import 区加

```tsx
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { useIsMobile } from '@/hooks/use-mobile';
import ChainList from '@/components/chain/ChainList';
```

2. 组件内加状态

```tsx
  const isMobile = useIsMobile();
  const [mobileView, setMobileView] = useState<'graph' | 'list'>('graph');
```

3. 把 `<div className="flex-1 min-h-0 rounded-[14px] ...">` 那一块换成

```tsx
        <div className="flex-1 min-h-0 rounded-[14px] border border-border-subtle bg-bg-secondary overflow-hidden">
          {isMobile && (
            <div className="flex gap-1 p-2 border-b border-border-subtle">
              <SegBtn label="图谱" active={mobileView === 'graph'} onClick={() => setMobileView('graph')} />
              <SegBtn label="列表" active={mobileView === 'list'} onClick={() => setMobileView('list')} />
            </div>
          )}
          {mobileView === 'graph' || !isMobile ? (
            <GraphCanvas
              nodes={visibleNodes}
              links={visibleLinks}
              arcs={arcs}
              showPeer={showPeer}
              showSupply={showSupply}
              showEcosystem={showEcosystem}
              selectedId={selectedId}
              candidateIds={highlightCandidates ? candidates : EMPTY_SET}
              onSelect={setSelectedId}
            />
          ) : (
            <ChainList
              nodes={visibleNodes}
              selectedId={selectedId}
              candidateIds={highlightCandidates ? candidates : EMPTY_SET}
              onSelect={setSelectedId}
            />
          )}
        </div>
```

4. 在 `</div>` 收尾前（`aside` 之后）加移动端抽屉：

```tsx
      {isMobile && (
        <Drawer open={!!selected} onOpenChange={(open) => !open && setSelectedId(null)}>
          <DrawerContent className="bg-bg-secondary border-border-subtle max-h-[75vh]">
            <div className="p-4 overflow-y-auto">
              {selected && (
                <DetailPanel
                  node={selected}
                  nodes={nodes}
                  onSelect={setSelectedId}
                  onClose={() => setSelectedId(null)}
                />
              )}
            </div>
          </DrawerContent>
        </Drawer>
      )}
```

5. 文件末尾加

```tsx
function SegBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 h-[30px] rounded-[8px] text-[12.5px] font-medium ${
        active ? 'bg-hover/[0.08] text-ink-primary' : 'text-ink-tertiary'
      }`}
    >
      {label}
    </button>
  );
}
```

- [ ] **Step 3: 构建**

Run: `npm run build`
Expected: 退出码 0

- [ ] **Step 4: 浏览器验证（窄屏）**

Run: `npm run dev`，DevTools 切到 iPhone 宽度（<768px），打开 `/chain`：
- 顶部出现「图谱 / 列表」切换；
- 图谱可单指拖动平移、双指缩放；标签只出现在热度 ≥60 的票和选中票上；
- 点一个节点 → 底部弹出抽屉，点 ✕ 或遮罩关闭；
- 切到「列表」→ 按环节分组，组头可折叠，未上榜行灰显无热度条，同环节未上榜票带黄条 + 「补涨候选」；
- 恢复桌面宽度，右栏详情回来、切换按钮消失。

- [ ] **Step 5: 提交**

```bash
git add src/components/chain/ChainList.tsx src/pages/Chain.tsx
git commit -m "feat: 产业链图谱窄屏布局与列表视图"
```

---

### Task 7: 收尾验证与执行记录

**Files:**
- Modify: `docs/superpowers/plans/2026-09-09-ai-chain-graph.md`（追加「执行记录」小节）

**Interfaces:**
- Consumes: 前六个任务的全部产物
- Produces: 全绿测试 + 构建 + 手动回归结论

- [ ] **Step 1: 跑全部自动化测试**

Run: `python3 -m pytest tests/ -q && npm run test`
Expected: pytest 全 passed（含新增 2 个用例）；vitest 全 passed

- [ ] **Step 2: 构建**

Run: `npm run build`
Expected: 退出码 0；确认产物里 `/chain` 是独立 chunk（`frontend/dist/assets/` 下有一个只在 chain 页加载的 js），且 `react-force-graph` 没有进主包

Run: `ls -S frontend/dist/assets/*.js | head -5`

- [ ] **Step 3: 浏览器全量回归**

Run: `npm run dev`，逐项过一遍：
1. 默认态：同业边开、上下游/阵营关；
2. 三个过滤下拉多选 + 搜索（名称 / 代码）；
3. 点节点 → 高亮同环节 + 同阵营，其余压暗，右栏详情正确；
4. 「高亮同链未上榜」开关；
5. 「→ 个股详情」跳转正确；
6. 拖拽节点、点空白取消选中；
7. 窄屏：图谱/列表切换、抽屉、双指缩放；
8. 空数据日（切到没有快照的日期）：所有节点等大、无描边、页面不崩。

- [ ] **Step 4: 把结果写进计划的执行记录**

在计划文件末尾追加：

```markdown
## 执行记录

- pytest：<实际输出摘要>
- vitest：<实际输出摘要>
- npm run build：<结果 + /chain 分包文件名>
- 浏览器回归：<逐项结论，含空数据日与窄屏>
- 已知问题：<无 / 列出>
```

- [ ] **Step 5: 提交**

```bash
git add docs/superpowers/plans/2026-09-09-ai-chain-graph.md
git commit -m "docs: 记录产业链图谱的验证结果"
```

---

## 自审

**Spec 覆盖**：§2 数据模型 → Task 2；§3 关系派生 → Task 3；§4 抽取规则 → Task 2；§5 页面与交互（桌面画布/过滤/三开关/选中高亮/同链未上榜/详情栏/窄屏图谱+列表/图例）→ Task 4、5、6；§6 数据流与选型 → Task 1、4；§7 测试（pytest + vitest + build + 手动）→ Task 2、3、7；§8 风险（React 19 闸门）→ Task 1 Step 9；§9 回滚 → 纯新增文件，无删除步骤。

**口径检查**：全文未出现「提及 / 未提及」用于描述热榜状态；「未上榜」统一指「今日未进过 Top10」。

---

## 执行记录

（2026-09-09，SDD 流程；分支 `main`，用户明确同意直接在 main 上做）

- **pytest**：`python3 -m pytest tests/ -q` → **77 passed**（含 `tests/test_chain_data.py` 新增 2 例）。
- **vitest**：`npm run test` → **8 passed**（`src/lib/chain.test.ts`）。
- **npm run build**：退出码 0、无 warning。`/chain` 为独立 chunk（`Chain-*.js`）；`react-force-graph` 及其 d3 依赖被单独拆进 `vendor-force-graph-*.js`（97.93 kB），仅被 `Chain-*.js` 引用，`index.html` 不预加载；主包 vendor 由 380.52 kB 降至 300.60 kB（gzip 122.80→98.84）。
- **浏览器回归**（kimi-webbridge 驱动真实 Chrome，`http://localhost:3000/chain`，用户指示「你自行验证」）：
  1. 默认态 ✓ 124 节点按环节着色、同业灰线、左下图例、顶部过滤条、右栏占位。
  2. 过滤/搜索 ✓ 搜索「旭创」隔离出「中际旭创」；「环节」下拉选「光模块」→ 6 节点、按钮「环节 · 1 ▾」。
  3. 点节点 ✓ 右栏详情正确（华丰科技 688629）；选中蓝环、同环节未上榜黄环、非候选未上榜压暗+虚线、选中边变绿。
  4. 「高亮同链未上榜」开关 ✓ 关闭后黄环消失、选中态保留。
  5. 「→ 个股详情」✓ 跳 `/stock/688629`。
  6. 点空白取消选中 ✓（**拖拽平移 / 节点拖拽 / 双指缩放未能验证**——kimi-webbridge 的 CDP 桥不投递按下后的 `mouseMoved`，touch 事件亦未投递；依赖 react-force-graph 原生 d3-zoom/d3-drag，记为验证盲区）。
  7. 窄屏 390×844 ✓ 图谱/列表切换、列表按环节分组、点行开底部抽屉、底部横向色点条；桌面图例已隐藏。
  8. 空数据日 ✓ 拦截 `/api/day/*?full=1` 返回 `{snapshots: []}` 后，页面正常渲染 124 节点、无 `Maximum update depth`。
- **过程中修复的三处缺陷**（均超出任务简报、由回归发现）：
  - `src/pages/Chain.tsx`：`useStore((s) => s.currentDayData?.snapshots ?? [])` 每次返回新数组 → `useSyncExternalStore` 无限重渲染、首屏空白。改为引用稳定的选择器，`?? []` 下沉进 `useMemo`。
  - `src/components/chain/GraphCanvas.tsx`：`zoomToFit` 挂在 `[nodes.length]`（恒 124），早于布局展开 → 首屏聚成小簇。改为 `onEngineStop` + `fittedRef` 取景一次。
  - `vite.config.ts`：`react-force-graph` 落进被全站 `modulepreload` 的 `vendor` 主包。新增 `vendor-force-graph` 分包规则。
- **已知问题**：
  - `StockDetail.tsx` / `Sectors.tsx` / `Sentiment.tsx` 存在与 Ruling 14 相同的 `?? []` 选择器写法（未改，超出本计划范围，待用户定夺）。
  - 默认视图（同业开、上下游关、阵营关）下 23 个环节互不相连；d3 初始位置随机，故每次加载布局不同：或叠成一个连贯的团（实测 k≈2.65），或散成 23 个小簇（实测 k≈0.49）。spec §5 示意本就是多簇，记为 deferred；是否调力参数或默认开「阵营」由用户定。
  - 画布拖动平移 / 节点拖拽 / 双指缩放未经浏览器验证（工具盲区，见上）。

## 执行记录 · 最终整支审查修复（2026-09-09）

最终整支审查（`4b2a0b1..worktree`）结论：0 Critical、4 Important、8 Minor。裁定与修复：

- **Ruling 16**（Important #1）`candidateCodes` 未校验锚点上榜 → 选中未上榜节点时整段被标「补涨候选」、琥珀环盖过选中环。修复：加 `if (!sel.listed) return out;`（spec §5:116），并新增 vitest「锚点未上榜时无补涨候选」。
- **Ruling 17**（Important #2）选中态只压暗「未上榜非候选」，未含同阵营邻居。修复：`GraphCanvas` 新增 `neighborIds`（同环节 ∪ 共享阵营），`dimmed = neighborIds.size > 0 && !neighborIds.has(id) && !isCandidate`（spec §5:114）。
- **Ruling 18**（Important #3）768–1023px 无详情面板（`aside` 是 `hidden lg:block`、抽屉是 `isMobile`<768）。修复：该页四处 `lg:` → `md:`（=768，与 `useIsMobile` 同界）；**并补 `min-w-0`**——改 `md:flex-row` 后画布列无法收缩，900px 视口下整页 1416px 宽（横向溢出），实测修复后 889 ≤ 900。
- **Ruling 19**（Important #4）审查据「默认 k≈0.49」推断标签被 `globalScale > 0.5` 门限挡住。实测 k 随布局随机（2.65 或 0.489），故该门限确实会偶发抑制标签；且 spec §5:121 要求「选中节点 + 其同环节候选」始终带标签。修复：把选中/候选移出缩放门限，热度 ≥ 60 的仍受门限约束。
- **残留 Minor（scoped re-review 提出，已修）**：选中节点被过滤出 `visibleNodes` 时 `neighborIds` 为空 → 全场压暗。修复：`dimmed` 增加 `neighborIds.size > 0` 前置条件。
- 复查：scoped re-review 结论 **Clean**，四项全部 ADDRESSED。`npm run test` 9 passed；`python3 -m pytest tests/ -q` 77 passed；`npm run build` exit 0（`vendor-force-graph` 仍为独立 97.93 kB chunk）。浏览器复验：900px 下右栏可见、无横向溢出；选中未上榜节点显示蓝色选中环、无琥珀候选环；选中节点标签正常渲染。
- 未修（Minor，记为 deferred）：悬停 tooltip 无热度、`zoomToFit` 只跑一次、列表/画布环优先级不一致、下拉不自动关闭、移动端两步详情、类型 cast、`aggregateHeat` 依赖快照有序。`StockDetail/Sectors/Sentiment` 的 `?? []` 选择器为范围外隐患，已向用户报告。
