# Tailwind CSS + DaisyUI 前端重构实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将前端从自定义 CSS 迁移到 Tailwind CSS + DaisyUI，实现全面视觉现代化

**Architecture:** 使用 Tailwind CLI 编译 CSS，DaisyUI 提供组件库，mobile-first 响应式设计，移除手动视图切换逻辑

**Tech Stack:** Tailwind CSS 3.x, DaisyUI 4.x, FastAPI (静态文件服务), npm

---

## 文件结构

### 新建文件
- `package.json` - npm 依赖配置
- `tailwind.config.js` - Tailwind 配置文件
- `frontend/src/styles.css` - Tailwind 源文件（@tailwind 指令）
- `frontend/dist/styles.css` - 编译输出（自动生成，加入 .gitignore）

### 修改文件
- `frontend/index.html` - 所有 class 替换为 Tailwind utility classes
- `frontend/app.js` - 动态生成的 HTML 模板使用 Tailwind classes
- `backend/server.py` - 添加 dist 目录静态文件服务
- `Makefile` - 添加 CSS 编译命令
- `.gitignore` - 添加 frontend/dist/

### 删除文件
- `frontend/style.css` - 被 Tailwind 替代

---

## Task 1: 初始化 npm 并安装依赖

**Files:**
- Create: `package.json`
- Modify: `.gitignore`

- [ ] **Step 1: 初始化 npm 项目**

```bash
cd /Users/wansheng/git/hot-dashboard
npm init -y
```

Expected: 创建 `package.json`

- [ ] **Step 2: 安装 Tailwind CSS 和 DaisyUI**

```bash
npm install -D tailwindcss daisyui
```

Expected: 安装成功，`package.json` 中出现 devDependencies

- [ ] **Step 3: 更新 .gitignore**

在 `.gitignore` 文件末尾添加：

```gitignore
# Tailwind CSS 编译输出
frontend/dist/

# npm
node_modules/
```

- [ ] **Step 4: 提交**

```bash
git add package.json package-lock.json .gitignore
git commit -m "chore: initialize npm and install Tailwind CSS + DaisyUI"
```

---

## Task 2: 创建 Tailwind 配置文件

**Files:**
- Create: `tailwind.config.js`

- [ ] **Step 1: 创建 tailwind.config.js**

```js
module.exports = {
  content: ["./frontend/**/*.{html,js}"],
  theme: {
    extend: {},
  },
  plugins: [require("daisyui")],
  daisyui: {
    themes: [{
      dark: {
        "primary": "#60a5fa",
        "secondary": "#a855f7",
        "accent": "#fbbf24",
        "neutral": "#1e293b",
        "base-100": "#0f172a",
        "base-200": "#1e293b",
        "base-300": "#334155",
        "info": "#60a5fa",
        "success": "#22c55e",
        "warning": "#eab308",
        "error": "#ef4444",
      }
    }]
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add tailwind.config.js
git commit -m "chore: add Tailwind CSS configuration with DaisyUI dark theme"
```

---

## Task 3: 创建 Tailwind 源文件

**Files:**
- Create: `frontend/src/styles.css`
- Create: `frontend/dist/` (目录)

- [ ] **Step 1: 创建 src 目录**

```bash
mkdir -p frontend/src
```

- [ ] **Step 2: 创建 styles.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 3: 创建 dist 目录**

```bash
mkdir -p frontend/dist
```

- [ ] **Step 4: 提交**

```bash
git add frontend/src/styles.css
git commit -m "chore: add Tailwind CSS source file"
```

---

## Task 4: 更新 Makefile 添加 CSS 编译命令

**Files:**
- Modify: `Makefile`

- [ ] **Step 1: 在 Makefile 末尾添加 CSS 命令**

```makefile
# Tailwind CSS 编译
css:
	npx tailwindcss -i frontend/src/styles.css -o frontend/dist/styles.css

css-watch:
	npx tailwindcss -i frontend/src/styles.css -o frontend/dist/styles.css --watch

css-prod:
	npx tailwindcss -i frontend/src/styles.css -o frontend/dist/styles.css --minify
```

- [ ] **Step 2: 修改 server 命令依赖**

将 `server` 命令改为：

```makefile
server: css
	python -m uvicorn backend.server:app --reload --host 0.0.0.0 --port 8765
```

- [ ] **Step 3: 提交**

```bash
git add Makefile
git commit -m "chore: add Tailwind CSS build commands to Makefile"
```

---

## Task 5: 更新后端静态文件服务

**Files:**
- Modify: `backend/server.py`

- [ ] **Step 1: 读取 server.py 找到静态文件挂载位置**

```bash
grep -n "StaticFiles" backend/server.py
```

Expected: 找到 `app.mount("/static", ...)` 的位置

- [ ] **Step 2: 在现有静态文件挂载后添加 dist 目录服务**

在 `app.mount("/static", StaticFiles(directory="frontend"), name="static")` 之后添加：

```python
# Tailwind CSS 编译输出
app.mount("/static/dist", StaticFiles(directory="frontend/dist"), name="static-dist")
```

- [ ] **Step 3: 提交**

```bash
git add backend/server.py
git commit -m "feat: add static file serving for Tailwind CSS dist directory"
```

---

## Task 6: 编译 CSS 并测试构建流程

**Files:**
- Create: `frontend/dist/styles.css` (自动生成)

- [ ] **Step 1: 编译 CSS**

```bash
make css
```

Expected: 创建 `frontend/dist/styles.css` 文件

- [ ] **Step 2: 验证文件存在**

```bash
ls -lh frontend/dist/styles.css
```

Expected: 文件存在，大小约 5-10MB（开发模式未 minify）

- [ ] **Step 3: 提交**

```bash
git add frontend/dist/.gitkeep 2>/dev/null || echo "dist 目录已在 .gitignore"
git commit -m "test: verify Tailwind CSS build process" --allow-empty
```

---

## Task 7: 重构 index.html - Header 和控制栏

**Files:**
- Modify: `frontend/index.html:10-21`

- [ ] **Step 1: 更新 CSS 引用**

将第 7 行：

```html
<link rel="stylesheet" href="/static/style.css">
```

改为：

```html
<link rel="stylesheet" href="/static/dist/styles.css">
```

- [ ] **Step 2: 重构 header 部分（第 10-21 行）**

替换整个 header div 为：

```html
<div class="text-center mb-4">
  <h1 class="text-xl md:text-2xl font-bold text-white">🔥 飞书投资群 · 多维热点看板</h1>
  <div class="text-sm text-primary mt-1" id="dateLabel">连接中...</div>
  <div class="flex gap-2 justify-center flex-wrap my-3">
    <button class="btn btn-sm btn-outline" id="btnPlay" onclick="togglePlay()">▶ 播放</button>
    <button class="btn btn-sm btn-outline" id="btnSpeed" onclick="cycleSpeed()">1x</button>
    <button class="btn btn-sm btn-outline" onclick="jumpLatest()">⏭</button>
    <button class="btn btn-sm btn-outline" onclick="jumpFirst()">⏮</button>
    <button class="btn btn-sm btn-outline" id="btnCollect" onclick="triggerCollect()">🔄 采集</button>
  </div>
</div>
```

**注意**: 移除了 `btnViewToggle` 按钮

- [ ] **Step 3: 提交**

```bash
git add frontend/index.html
git commit -m "refactor: update header and controls with Tailwind classes"
```

---

## Task 8: 重构 index.html - Mode Bar 和 Date Picker

**Files:**
- Modify: `frontend/index.html:22-29`

- [ ] **Step 1: 重构 mode-bar（第 22-25 行）**

替换为：

```html
<div class="flex gap-1.5 justify-center p-1 bg-base-200 rounded-xl border border-base-300 mb-4 mx-auto max-w-lg">
  <button class="btn btn-sm btn-primary" onclick="switchMode('replay')">📼 回放</button>
  <button class="btn btn-sm btn-ghost" onclick="switchMode('live')">🔴 实时</button>
</div>
```

- [ ] **Step 2: 重构 date-picker（第 26-29 行）**

替换为：

```html
<div class="flex gap-2 justify-center mb-4 items-center">
  <select class="select select-sm select-bordered" id="dateSelect" onchange="loadDate(this.value)"></select>
  <button class="btn btn-sm btn-outline" onclick="fetchAvailableDates()">刷新日期</button>
</div>
```

- [ ] **Step 3: 提交**

```bash
git add frontend/index.html
git commit -m "refactor: update mode bar and date picker with Tailwind classes"
```

---

## Task 9: 重构 index.html - Tab 导航栏

**Files:**
- Modify: `frontend/index.html:30-35`

- [ ] **Step 1: 重构 tabs（第 30-35 行）**

替换为：

```html
<div class="flex gap-1.5 justify-center md:justify-center p-1 bg-base-200 rounded-xl border border-base-300 mb-4 mx-auto max-w-2xl overflow-x-auto">
  <button class="btn btn-sm btn-primary whitespace-nowrap" data-tab="stocks" onclick="switchTab('stocks')">📈 股票热点</button>
  <button class="btn btn-sm btn-ghost whitespace-nowrap" data-tab="sectors" onclick="switchTab('sectors')">🏭 板块热度</button>
  <button class="btn btn-sm btn-ghost whitespace-nowrap" data-tab="sentiment" onclick="switchTab('sentiment')">💭 市场情绪</button>
  <button class="btn btn-sm btn-ghost whitespace-nowrap" data-tab="actions" onclick="switchTab('actions')">⚡ 操作信号</button>
</div>
```

- [ ] **Step 2: 提交**

```bash
git add frontend/index.html
git commit -m "refactor: update tab navigation with Tailwind classes"
```

---

## Task 10: 重构 index.html - Stats 和 Timeline

**Files:**
- Modify: `frontend/index.html:36-41`

- [ ] **Step 1: 重构 stats bar（第 36 行）**

替换为：

```html
<div class="flex gap-2 justify-center flex-wrap my-3" id="statsBar"></div>
```

- [ ] **Step 2: 重构 timeline（第 37-41 行）**

替换为：

```html
<div class="my-3">
  <div class="flex justify-between text-xs text-slate-400 mb-1">
    <span id="tlS">--</span>
    <span id="tlE">--</span>
  </div>
  <input type="range" class="range range-primary range-sm w-full" id="slider" min="0" max="100" value="100">
  <div class="text-center text-base font-bold text-accent mt-2" id="curTime">--:--</div>
</div>
```

- [ ] **Step 3: 提交**

```bash
git add frontend/index.html
git commit -m "refactor: update stats bar and timeline with Tailwind classes"
```

---

## Task 11: 重构 index.html - Panel 容器

**Files:**
- Modify: `frontend/index.html:42-63`

- [ ] **Step 1: 更新 panel 基础样式（第 42, 46, 49, 59 行）**

将所有 `<div class="panel active"` 和 `<div class="panel"` 保持不变，因为 `panel` 类的显示/隐藏逻辑由 app.js 控制。

- [ ] **Step 2: 更新 stocks panel 结构（第 42-45 行）**

替换为：

```html
<div class="panel active" id="panel-stocks">
  <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3" id="stockMobile"></div>
</div>
```

**注意**: 移除了 `<table>` 元素，只保留 `stockMobile` div（将用于卡片布局）

- [ ] **Step 3: 更新 sectors panel（第 46-48 行）**

替换为：

```html
<div class="panel" id="panel-sectors">
  <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3" id="sectorGrid"></div>
</div>
```

- [ ] **Step 4: 更新 sentiment panel（第 49-58 行）**

替换为：

```html
<div class="panel" id="panel-sentiment">
  <div class="text-center mb-4">
    <div class="text-lg font-bold mb-2" id="sentLabel">--</div>
    <div class="flex h-6 bg-base-200 border border-base-300 rounded-lg overflow-hidden max-w-md mx-auto" id="sentMeter"></div>
    <div class="flex justify-between max-w-md mx-auto mt-1.5 text-xs text-slate-400">
      <span>看多</span>
      <span>观望</span>
      <span>看空</span>
    </div>
  </div>
  <div class="flex gap-2 justify-center flex-wrap my-3" id="sentDetails"></div>
  <div class="block md:hidden" id="sentDetailCards"></div>
</div>
```

- [ ] **Step 5: 更新 actions panel（第 59-63 行）**

替换为：

```html
<div class="panel" id="panel-actions">
  <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4" id="actionGrid"></div>
  <div class="block md:hidden" id="actDetailCards"></div>
</div>
```

- [ ] **Step 6: 提交**

```bash
git add frontend/index.html
git commit -m "refactor: update panel containers with Tailwind grid layouts"
```

---

## Task 12: 重构 index.html - Footer 和 Modal

**Files:**
- Modify: `frontend/index.html:64-74`

- [ ] **Step 1: 更新 footer（第 64 行）**

替换为：

```html
<div class="text-center text-xs text-slate-500 mt-4 opacity-60">数据来源：25个飞书投资群 | 每5分钟更新 | 仅供参考</div>
```

- [ ] **Step 2: 重构 modal（第 65-74 行）**

替换为：

```html
<dialog id="modalOverlay" class="modal">
  <div class="modal-box w-11/12 max-w-2xl bg-base-200 border border-base-300">
    <form method="dialog">
      <button class="btn btn-sm btn-circle btn-ghost absolute right-3 top-3">✕</button>
    </form>
    <div class="flex justify-between items-center mb-4">
      <h2 class="text-lg font-bold text-white" id="modalTitle">板块详情</h2>
    </div>
    <div class="flex gap-3 mb-4 flex-wrap" id="modalStats"></div>
    <div class="overflow-y-auto max-h-[50vh]" id="modalBody"></div>
  </div>
  <form method="dialog" class="modal-backdrop">
    <button>close</button>
  </form>
</dialog>
```

- [ ] **Step 3: 提交**

```bash
git add frontend/index.html
git commit -m "refactor: update footer and modal with DaisyUI modal component"
```

---

## Task 13: 更新 app.js - 移除视图切换逻辑

**Files:**
- Modify: `frontend/app.js`

- [ ] **Step 1: 搜索 toggleViewMode 函数**

```bash
grep -n "toggleViewMode" frontend/app.js
```

- [ ] **Step 2: 删除 toggleViewMode 函数和相关代码**

找到并删除：
- `toggleViewMode()` 函数定义
- 所有 `document.documentElement.classList.toggle('mobile-mode')` 调用
- 所有 `localStorage.getItem('mobileMode')` 和 `localStorage.setItem('mobileMode', ...)` 调用

- [ ] **Step 3: 提交**

```bash
git add frontend/app.js
git commit -m "refactor: remove manual view toggle logic from app.js"
```

---

## Task 14: 更新 app.js - Tab 切换逻辑

**Files:**
- Modify: `frontend/app.js`

- [ ] **Step 1: 搜索 switchTab 函数**

```bash
grep -n "switchTab\|\.tab\|tab\.active" frontend/app.js
```

- [ ] **Step 2: 更新 switchTab 函数中的 class 操作**

找到 tab 切换逻辑，将：

```javascript
document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
tab.classList.add('active');
```

改为：

```javascript
document.querySelectorAll('[data-tab]').forEach(t => {
  t.classList.remove('btn-primary');
  t.classList.add('btn-ghost');
});
tab.classList.remove('btn-ghost');
tab.classList.add('btn-primary');
```

- [ ] **Step 3: 提交**

```bash
git add frontend/app.js
git commit -m "refactor: update tab switching logic for Tailwind classes"
```

---

## Task 15: 更新 app.js - Mode 切换逻辑

**Files:**
- Modify: `frontend/app.js`

- [ ] **Step 1: 搜索 switchMode 函数**

```bash
grep -n "switchMode\|mode-btn" frontend/app.js
```

- [ ] **Step 2: 更新 switchMode 函数中的 class 操作**

找到 mode 切换逻辑，将：

```javascript
document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
btn.classList.add('active');
```

改为：

```javascript
document.querySelectorAll('.mode-bar button').forEach(b => {
  b.classList.remove('btn-primary');
  b.classList.add('btn-ghost');
});
btn.classList.remove('btn-ghost');
btn.classList.add('btn-primary');
```

- [ ] **Step 3: 提交**

```bash
git add frontend/app.js
git commit -m "refactor: update mode switching logic for Tailwind classes"
```

---

## Task 16: 更新 app.js - 股票列表渲染

**Files:**
- Modify: `frontend/app.js`

- [ ] **Step 1: 搜索 renderStocks 或股票列表渲染函数**

```bash
grep -n "stockBody\|stockMobile\|renderStock" frontend/app.js
```

- [ ] **Step 2: 重写股票卡片 HTML 模板**

找到生成股票列表 HTML 的函数，将表格行模板替换为卡片模板：

```javascript
// 旧代码（表格行）
// `<tr><td>${rank}</td><td class="code">${s.code}</td>...</tr>`

// 新代码（卡片）
const heatColor = s.score >= 80 ? 'success' : s.score >= 60 ? 'warning' : 'error';
const heatGradient = s.score >= 80 ? 'from-success to-green-700' : s.score >= 60 ? 'from-warning to-yellow-700' : 'from-error to-red-700';
const sentTag = s.sentiment === '看多' ? 'badge-success' : s.sentiment === '看空' ? 'badge-error' : 'badge-warning';

html += `
  <div class="bg-base-200 border border-base-300 rounded-lg p-3 hover:border-primary transition-colors cursor-pointer">
    <div class="flex justify-between items-center mb-2">
      <span class="text-xs text-slate-400 font-semibold">#${rank}</span>
      <span class="text-xl font-bold text-${heatColor}">${s.score}</span>
    </div>
    <div class="text-sm font-bold text-white mb-0.5">${s.name}</div>
    <div class="text-xs text-primary font-mono mb-2">${s.code}</div>
    <div class="flex gap-1 flex-wrap mb-2">
      <span class="badge ${sentTag} badge-sm">${s.sentiment || '观望'}</span>
      ${s.sector ? `<span class="badge badge-info badge-sm">${s.sector}</span>` : ''}
    </div>
    <div class="h-1 bg-base-300 rounded-full overflow-hidden">
      <div class="h-full w-[${s.score}%] bg-gradient-to-r ${heatGradient} rounded-full"></div>
    </div>
    <div class="text-xs text-slate-400 mt-1.5">提及 ${s.mentions} 次 · ${s.groups} 个群</div>
  </div>
`;
```

- [ ] **Step 3: 确保渲染目标是 #stockMobile**

找到 `document.getElementById('stockBody')` 或类似代码，改为：

```javascript
document.getElementById('stockMobile').innerHTML = html;
```

- [ ] **Step 4: 提交**

```bash
git add frontend/app.js
git commit -m "refactor: rewrite stock list as responsive card grid"
```

---

## Task 17: 更新 app.js - 板块卡片渲染

**Files:**
- Modify: `frontend/app.js`

- [ ] **Step 1: 搜索板块渲染函数**

```bash
grep -n "sectorGrid\|renderSector" frontend/app.js
```

- [ ] **Step 2: 更新板块卡片 HTML 模板**

找到生成板块卡片的代码，更新为：

```javascript
const html = sectors.map(s => `
  <div class="bg-base-200 border border-base-300 rounded-lg p-3 hover:border-primary transition-colors cursor-pointer" onclick="showSectorDetail('${s.name}')">
    <div class="text-base font-bold text-white mb-1">${s.name}</div>
    <div class="text-xs text-slate-400 mb-2">提及 ${s.mentions} 次 · ${s.groups} 个群</div>
    <div class="h-1 bg-base-300 rounded-full overflow-hidden">
      <div class="h-full w-[${s.heat}%] bg-gradient-to-r from-primary to-blue-700 rounded-full"></div>
    </div>
  </div>
`).join('');

document.getElementById('sectorGrid').innerHTML = html;
```

- [ ] **Step 3: 提交**

```bash
git add frontend/app.js
git commit -m "refactor: update sector cards with Tailwind classes"
```

---

## Task 18: 更新 app.js - 情绪面板渲染

**Files:**
- Modify: `frontend/app.js`

- [ ] **Step 1: 搜索情绪渲染函数**

```bash
grep -n "sentLabel\|sentMeter\|renderSentiment" frontend/app.js
```

- [ ] **Step 2: 更新情绪标签和进度条**

找到生成情绪面板的代码，更新为：

```javascript
// 更新标签
const sentLabel = document.getElementById('sentLabel');
sentLabel.textContent = `${sentiment.label} (${sentiment.labelEn})`;
sentLabel.className = `text-lg font-bold mb-2 text-${sentiment.color}`;

// 更新进度条
const meter = document.getElementById('sentMeter');
meter.innerHTML = `
  <div class="w-[${sentiment.bull}%] h-full bg-gradient-to-r from-success to-green-700"></div>
  <div class="w-[${sentiment.neu}%] h-full bg-slate-500"></div>
  <div class="w-[${sentiment.bear}%] h-full bg-gradient-to-r from-error to-red-700"></div>
`;
```

- [ ] **Step 3: 提交**

```bash
git add frontend/app.js
git commit -m "refactor: update sentiment panel with Tailwind classes"
```

---

## Task 19: 更新 app.js - 操作信号渲染

**Files:**
- Modify: `frontend/app.js`

- [ ] **Step 1: 搜索操作信号渲染函数**

```bash
grep -n "actionGrid\|renderAction" frontend/app.js
```

- [ ] **Step 2: 更新信号卡片 HTML 模板**

找到生成信号卡片的代码，更新为：

```javascript
const icons = { '买入': '🟢', '卖出': '🔴', '持有': '🟡', '风险': '⚠️' };
const colors = { '买入': 'success', '卖出': 'error', '持有': 'warning', '风险': 'error' };

const html = actions.map(a => `
  <div class="bg-base-200 border border-base-300 rounded-lg p-4 text-center">
    <div class="text-2xl mb-1.5">${icons[a.type] || '📊'}</div>
    <div class="text-3xl font-bold text-${colors[a.type] || 'primary'}">${a.count}</div>
    <div class="text-xs text-slate-400 mt-1">${a.type}信号</div>
  </div>
`).join('');

document.getElementById('actionGrid').innerHTML = html;
```

- [ ] **Step 3: 提交**

```bash
git add frontend/app.js
git commit -m "refactor: update action signals with Tailwind classes"
```

---

## Task 20: 更新 app.js - Stats 栏渲染

**Files:**
- Modify: `frontend/app.js`

- [ ] **Step 1: 搜索 stats 渲染函数**

```bash
grep -n "statsBar\|renderStats" frontend/app.js
```

- [ ] **Step 2: 更新 stats 卡片 HTML 模板**

找到生成 stats 的代码，更新为：

```javascript
const html = `
  <div class="bg-base-200 border border-base-300 rounded-lg px-4 py-2 text-center min-w-[80px]">
    <div class="text-lg font-bold text-white">${stats.totalMentions}</div>
    <div class="text-xs text-slate-400 mt-0.5">总提及</div>
  </div>
  <div class="bg-base-200 border border-base-300 rounded-lg px-4 py-2 text-center min-w-[80px]">
    <div class="text-lg font-bold text-success">${stats.activeGroups}</div>
    <div class="text-xs text-slate-400 mt-0.5">活跃群</div>
  </div>
  <div class="bg-base-200 border border-base-300 rounded-lg px-4 py-2 text-center min-w-[80px]">
    <div class="text-lg font-bold text-primary">${stats.stockCount}</div>
    <div class="text-xs text-slate-400 mt-0.5">股票数</div>
  </div>
  <div class="bg-base-200 border border-base-300 rounded-lg px-4 py-2 text-center min-w-[80px]">
    <div class="text-lg font-bold text-secondary">${stats.sectorCount}</div>
    <div class="text-xs text-slate-400 mt-0.5">板块数</div>
  </div>
`;

document.getElementById('statsBar').innerHTML = html;
```

- [ ] **Step 3: 提交**

```bash
git add frontend/app.js
git commit -m "refactor: update stats bar with Tailwind classes"
```

---

## Task 21: 更新 app.js - Modal 渲染

**Files:**
- Modify: `frontend/app.js`

- [ ] **Step 1: 搜索 modal 相关函数**

```bash
grep -n "modalOverlay\|showModal\|closeModal" frontend/app.js
```

- [ ] **Step 2: 更新 modal 打开/关闭逻辑**

找到 modal 操作代码，更新为：

```javascript
function showModal(title, stats, body) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalStats').innerHTML = stats;
  document.getElementById('modalBody').innerHTML = body;
  document.getElementById('modalOverlay').showModal();
}

function closeModal() {
  document.getElementById('modalOverlay').close();
}
```

- [ ] **Step 3: 更新 modal stats 渲染**

找到生成 modal stats 的代码，更新为：

```javascript
const statsHtml = `
  <div class="flex-1 min-w-[100px] text-center">
    <div class="text-xl font-bold text-success">${stats.mentions}</div>
    <div class="text-xs text-slate-400 mt-0.5">总提及</div>
  </div>
  <div class="flex-1 min-w-[100px] text-center">
    <div class="text-xl font-bold text-primary">${stats.groups}</div>
    <div class="text-xs text-slate-400 mt-0.5">活跃群</div>
  </div>
`;
```

- [ ] **Step 4: 更新 modal body 中的消息组样式**

找到生成消息组 HTML 的代码，更新为：

```javascript
const groupHtml = `
  <div class="mb-3">
    <div class="flex justify-between items-center px-3 py-2 bg-primary/10 rounded-lg mb-1.5">
      <span class="font-bold text-sm text-primary">📊 ${groupName}</span>
      <span class="text-xs text-slate-400">${messages.length} 条消息</span>
    </div>
    ${messages.map(m => `
      <div class="pl-3.5 ml-3 border-l-2 border-base-300 bg-white/5 rounded-r-lg py-2 px-3 my-1">
        <div class="text-xs text-slate-400 mb-1">${m.time}</div>
        <div class="text-sm text-slate-200 leading-relaxed">${m.content}</div>
      </div>
    `).join('')}
  </div>
`;
```

- [ ] **Step 5: 提交**

```bash
git add frontend/app.js
git commit -m "refactor: update modal with DaisyUI modal component and Tailwind classes"
```

---

## Task 22: 删除旧 CSS 文件

**Files:**
- Delete: `frontend/style.css`

- [ ] **Step 1: 删除旧的 style.css**

```bash
rm frontend/style.css
```

- [ ] **Step 2: 提交**

```bash
git add -A frontend/style.css
git commit -m "chore: remove old custom CSS file"
```

---

## Task 23: 生产环境 CSS 构建

**Files:**
- Modify: `frontend/dist/styles.css` (重新编译)

- [ ] **Step 1: 编译生产版本 CSS**

```bash
make css-prod
```

Expected: `frontend/dist/styles.css` 被重新编译并 minify

- [ ] **Step 2: 验证文件大小**

```bash
ls -lh frontend/dist/styles.css
```

Expected: 文件大小应 < 100KB（minified）

- [ ] **Step 3: 提交**

```bash
git commit -m "build: compile production CSS" --allow-empty
```

---

## Task 24: 集成测试

- [ ] **Step 1: 启动服务器**

```bash
make server
```

Expected: 服务器在 http://127.0.0.1:8765 启动

- [ ] **Step 2: 打开浏览器访问**

访问 http://127.0.0.1:8765

Expected: 页面正常加载，深色主题，所有组件显示正确

- [ ] **Step 3: 测试响应式布局**

浏览器开发者工具中测试：
- 移动端 (<640px): 股票单列，板块单列
- 平板 (640-1024px): 股票 2-3 列，板块 2-3 列
- 桌面 (>1024px): 股票 4 列，板块 4 列

Expected: 布局自动适配，无横向滚动条

- [ ] **Step 4: 测试所有功能**

- [ ] Tab 切换正常
- [ ] Mode 切换（回放/实时）正常
- [ ] 日期选择正常
- [ ] 时间轴滑块可拖动
- [ ] 播放/暂停/变速正常
- [ ] 点击板块卡片弹出 modal
- [ ] Modal 关闭正常

- [ ] **Step 5: 如有问题，修复并提交**

```bash
# 修复问题后
git add -A
git commit -m "fix: resolve integration issues"
```

---

## Task 25: 最终提交和清理

- [ ] **Step 1: 验证所有文件已提交**

```bash
git status
```

Expected: 工作区干净

- [ ] **Step 2: 查看 git log 确认提交历史**

```bash
git log --oneline -20
```

Expected: 看到所有重构提交

- [ ] **Step 3: 完成**

所有任务完成！前端已成功迁移到 Tailwind CSS + DaisyUI。
