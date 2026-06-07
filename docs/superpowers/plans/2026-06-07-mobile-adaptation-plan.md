# 移动端页面适配实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为飞书群热点看板添加移动端页面，支持桌面/移动端内切换，保持单一 URL

**Architecture:** 单 HTML 文件，通过 `<html>` 上的 `mobile-mode` 类切换 CSS 样式层。数据获取逻辑不变，render() 根据模式分发到不同渲染函数。用户选择通过 localStorage 持久化。

**Tech Stack:** HTML/CSS/JS (vanilla), FastAPI (unchanged backend)

---

## 文件映射

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/index.html` | 修改 | 添加右上角切换按钮 |
| `frontend/style.css` | 重写 | 分三层：Base / Desktop(`:root:not(.mobile-mode)`) / Mobile(`:root.mobile-mode`) |
| `frontend/app.js` | 修改 | 添加 `detectMobile()`, `toggleViewMode()`, 各面板的 `renderXxxMobile()` 函数, 修改 `render()` 分发逻辑 |

---

### Task 1: HTML 添加切换按钮

**Files:**
- Modify: `frontend/index.html` (header section, lines 10-19)

- [ ] **Step 1: 在 header 中添加切换按钮**

修改 `frontend/index.html` 的 header 部分，在 `<h1>` 旁边添加切换按钮：

```html
<div class="header">
  <h1>🔥 飞书投资群 · 多维热点看板</h1>
  <div class="date" id="dateLabel">连接中...</div>
  <button class="view-toggle" id="btnViewToggle" onclick="toggleViewMode()" title="切换桌面/移动视图">📱</button>
  <div class="controls">
    <button class="btn" id="btnPlay" onclick="togglePlay()">▶ 播放</button>
    <button class="btn" id="btnSpeed" onclick="cycleSpeed()">1x</button>
    <button class="btn" onclick="jumpLatest()">⏭</button>
    <button class="btn" onclick="jumpFirst()">⏮</button>
    <button class="btn" id="btnCollect" onclick="triggerCollect()">🔄 采集</button>
  </div>
</div>
```

- [ ] **Step 2: 验证 HTML 语法正确**

在浏览器打开 `http://127.0.0.1:8765` 确认页面正常加载，切换按钮可见。

- [ ] **Step 3: Commit**

```bash
git add frontend/index.html
git commit -m "feat: 添加桌面/移动视图切换按钮"
```

---

### Task 2: CSS 重构 — Base + Desktop 层

**Files:**
- Modify: `frontend/style.css` (full rewrite)

- [ ] **Step 1: 重写 CSS，分三层结构**

将 `frontend/style.css` 重写为：

```css
/* ========== Base: 通用变量、重置、基础组件 ========== */
*{margin:0;padding:0;box-sizing:border-box}
:root{--bg:#0d1117;--card:#161b22;--border:#30363d;--text:#e6edf3;--text2:#8b949e;--accent:#58a6ff;--green:#3fb950;--red:#f85149;--yellow:#d29922;--gold:#f0b429;--purple:#bc8cff;--orange:#f0883e}
body{background:var(--bg);color:var(--text);font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;padding:10px;min-height:100vh}

/* 通用组件 */
.btn{background:var(--card);border:1px solid var(--border);color:var(--text);padding:4px 10px;border-radius:5px;cursor:pointer;font-size:11px;transition:background .2s}
.btn:hover{background:rgba(88,166,255,.1)}
.btn.active{background:rgba(88,166,255,.2);border-color:var(--accent)}
.stat{background:var(--card);border:1px solid var(--border);border-radius:4px;padding:4px 8px;text-align:center;min-width:60px}
.stat .val{font-size:14px;font-weight:700}.stat .label{font-size:9px;color:var(--text2)}
.tag{display:inline-block;padding:1px 3px;border-radius:2px;font-size:9px;margin:1px}
.tag-g{background:rgba(63,185,80,.15);color:var(--green)}
.tag-r{background:rgba(248,81,73,.15);color:var(--red)}
.tag-b{background:rgba(88,166,255,.15);color:var(--accent)}
.tag-s{background:rgba(188,140,255,.15);color:var(--purple)}
.pbar{width:40px;height:3px;background:var(--border);border-radius:2px;overflow:hidden;display:inline-block;vertical-align:middle;margin-left:2px}
.pbar .fill{height:100%;background:var(--accent);border-radius:2px}
.panel{display:none}.panel.active{display:block}
.empty{text-align:center;padding:24px 8px;color:var(--text2);font-size:12px}
.loading{text-align:center;padding:24px;color:var(--accent)}
.footer{text-align:center;color:var(--text2);font-size:9px;margin-top:12px;opacity:.6}
.empty{font-size:12px}

/* 视图切换按钮 */
.view-toggle{position:fixed;top:10px;right:10px;z-index:999;background:var(--card);border:1px solid var(--border);color:var(--text);width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;transition:background .2s}
.view-toggle:hover{background:rgba(88,166,255,.15)}

/* ========== Desktop: :root:not(.mobile-mode) ========== */
:root:not(.mobile-mode) .header{text-align:center;margin-bottom:8px}
:root:not(.mobile-mode) h1{font-size:18px;font-weight:700}
:root:not(.mobile-mode) .date{color:var(--accent);font-size:12px;margin-top:2px}
:root:not(.mobile-mode) .controls{display:flex;gap:4px;justify-content:center;margin:4px 0 6px;flex-wrap:wrap}
:root:not(.mobile-mode) .mode-bar{display:flex;gap:4px;justify-content:center;margin-bottom:6px}
:root:not(.mobile-mode) .mode-btn{background:var(--card);border:1px solid var(--border);color:var(--text2);padding:3px 12px;border-radius:4px;cursor:pointer;font-size:11px}
:root:not(.mobile-mode) .mode-btn.active{background:rgba(88,166,255,.2);border-color:var(--accent);color:var(--text)}
:root:not(.mobile-mode) .date-picker{display:flex;gap:4px;justify-content:center;margin-bottom:8px;align-items:center}
:root:not(.mobile-mode) .date-picker select{background:var(--card);border:1px solid var(--border);color:var(--text);padding:3px 8px;border-radius:4px;font-size:11px}
:root:not(.mobile-mode) .tabs{display:flex;gap:2px;justify-content:center;margin-bottom:8px;border-bottom:1px solid var(--border)}
:root:not(.mobile-mode) .tab{padding:5px 12px;cursor:pointer;font-size:11px;color:var(--text2);border-bottom:2px solid transparent;transition:all .2s}
:root:not(.mobile-mode) .tab:hover{color:var(--text)}
:root:not(.mobile-mode) .tab.active{color:var(--accent);border-bottom-color:var(--accent)}
:root:not(.mobile-mode) .stats{display:flex;gap:5px;justify-content:center;margin:5px 0;flex-wrap:wrap}
:root:not(.mobile-mode) .timeline{margin:5px 0}
:root:not(.mobile-mode) .tl-label{display:flex;justify-content:space-between;font-size:9px;color:var(--text2);margin-bottom:1px}
:root:not(.mobile-mode) input[type=range]{width:100%;accent-color:var(--accent);height:4px}
:root:not(.mobile-mode) .cur-time{text-align:center;font-size:13px;font-weight:600;color:var(--gold);margin:2px 0 6px}
:root:not(.mobile-mode) table{width:100%;border-collapse:collapse}
:root:not(.mobile-mode) th{background:var(--card);padding:5px 4px;text-align:left;font-size:9px;color:var(--text2);border-bottom:1px solid var(--border)}
:root:not(.mobile-mode) td{padding:5px 4px;border-bottom:1px solid var(--border);font-size:11px;vertical-align:middle}
:root:not(.mobile-mode) tr:hover{background:rgba(88,166,255,.04)}
:root:not(.mobile-mode) .code{font-family:"SF Mono",monospace;font-weight:600;color:var(--accent)}
:root:not(.mobile-mode) .sc-h{color:var(--green);font-weight:700}
:root:not(.mobile-mode) .sc-m{color:var(--yellow);font-weight:700}
:root:not(.mobile-mode) .sc-l{color:var(--text2);font-weight:700}
:root:not(.mobile-mode) .sector-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:5px}
:root:not(.mobile-mode) .sector-card{background:var(--card);border:1px solid var(--border);border-radius:5px;padding:7px}
:root:not(.mobile-mode) .sector-card .sn{font-weight:700;font-size:13px;margin-bottom:2px}
:root:not(.mobile-mode) .sector-card .info{font-size:10px;color:var(--text2)}
:root:not(.mobile-mode) .sector-card .bar{height:3px;background:var(--border);border-radius:2px;margin-top:3px;overflow:hidden}
:root:not(.mobile-mode) .sector-card .bar .fill{height:100%;border-radius:2px}
:root:not(.mobile-mode) .sent-box{text-align:center;margin-bottom:10px}
:root:not(.mobile-mode) .sent-label{font-size:13px;font-weight:700;margin-bottom:4px}
:root:not(.mobile-mode) .sent-meter{display:flex;height:16px;background:var(--card);border:1px solid var(--border);border-radius:3px;overflow:hidden;margin:4px auto;max-width:280px}
:root:not(.mobile-mode) .sent-bar{height:100%}
:root:not(.mobile-mode) .sent-bull{background:var(--green)}
:root:not(.mobile-mode) .sent-bear{background:var(--red)}
:root:not(.mobile-mode) .sent-neu{background:var(--text2)}
:root:not(.mobile-mode) .sent-labels{display:flex;justify-content:space-between;max-width:280px;margin:0 auto;font-size:9px;color:var(--text2)}
:root:not(.mobile-mode) .action-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:5px;margin-bottom:8px}
:root:not(.mobile-mode) .action-card{background:var(--card);border:1px solid var(--border);border-radius:5px;padding:8px;text-align:center}
:root:not(.mobile-mode) .action-card .icon{font-size:20px;margin-bottom:3px}
:root:not(.mobile-mode) .action-card .count{font-size:20px;font-weight:700}
:root:not(.mobile-mode) .action-card .label{font-size:10px;color:var(--text2)}
:root:not(.mobile-mode) .sector-card{cursor:pointer;transition:border-color .2s}
:root:not(.mobile-mode) .sector-card:hover{border-color:var(--accent)}

/* Desktop modal */
:root:not(.mobile-mode) .modal-overlay{display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.6);z-index:1000;overflow-y:auto;padding:20px}
:root:not(.mobile-mode) .modal-overlay.show{display:flex;align-items:flex-start;justify-content:center}
:root:not(.mobile-mode) .modal-content{background:var(--card);border:1px solid var(--border);border-radius:8px;width:min(640px,95vw);max-height:80vh;display:flex;flex-direction:column}
:root:not(.mobile-mode) .modal-header{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid var(--border)}
:root:not(.mobile-mode) .modal-header h2{font-size:16px;font-weight:700}
:root:not(.mobile-mode) .modal-close{background:none;border:none;color:var(--text2);font-size:24px;cursor:pointer;padding:0 4px;line-height:1}
:root:not(.mobile-mode) .modal-close:hover{color:var(--text)}
:root:not(.mobile-mode) .modal-stats{display:flex;gap:8px;padding:10px 16px;border-bottom:1px solid var(--border)}
:root:not(.mobile-mode) .modal-body{overflow-y:auto;padding:12px 16px}
:root:not(.mobile-mode) .msg-group{margin-bottom:10px}
:root:not(.mobile-mode) .msg-group-header{display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:rgba(88,166,255,.08);border-radius:5px;margin-bottom:4px}
:root:not(.mobile-mode) .msg-group-header .gn{font-weight:700;font-size:12px;color:var(--accent)}
:root:not(.mobile-mode) .msg-group-header .gc{font-size:10px;color:var(--text2)}
:root:not(.mobile-mode) .msg-item{padding:6px 10px;margin:3px 0 3px 12px;border-left:2px solid var(--border);background:rgba(255,255,255,.02);border-radius:0 4px 4px 0}
:root:not(.mobile-mode) .msg-item .mt{font-size:9px;color:var(--text2);margin-bottom:2px}
:root:not(.mobile-mode) .msg-item .mx{font-size:11px;line-height:1.5;word-break:break-all}

/* ========== Mobile: :root.mobile-mode ========== */
/* (将在 Task 3 中添加) */
```

- [ ] **Step 2: 启动服务器，验证桌面版样式未变化**

```bash
make server
```

浏览器打开 `http://127.0.0.1:8765`，确认桌面版布局、Tab、时间轴、表格等与之前完全一致。点击切换按钮暂无反应（JS 还未添加）。

- [ ] **Step 3: Commit**

```bash
git add frontend/style.css
git commit -m "refactor: CSS 分三层结构（Base + Desktop + Mobile 预留）"
```

---

### Task 3: CSS 添加移动端样式层

**Files:**
- Modify: `frontend/style.css` (append mobile section at end)

- [ ] **Step 1: 追加移动端覆盖样式**

在 CSS 文件末尾（替换 `/* (将在 Task 3 中添加) */` 注释）追加：

```css
/* Mobile overrides */
:root.mobile-mode {
  --card: #161b22;
}

:root.mobile-mode body {
  padding: 8px 6px;
}

:root.mobile-mode .header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin-bottom: 6px;
}

:root.mobile-mode h1 {
  font-size: 14px;
  flex: 1 1 100%;
  order: 1;
}

:root.mobile-mode .date {
  font-size: 10px;
  order: 2;
  flex: 1 1 auto;
}

:root.mobile-mode .controls {
  order: 3;
  flex: 1 1 auto;
  justify-content: flex-start;
  gap: 3px;
  margin: 2px 0 4px;
}

:root.mobile-mode .btn {
  padding: 3px 6px;
  font-size: 10px;
}

:root.mobile-mode .mode-bar {
  margin-bottom: 4px;
}

:root.mobile-mode .mode-btn {
  padding: 2px 8px;
  font-size: 10px;
}

:root.mobile-mode .date-picker {
  margin-bottom: 6px;
}

:root.mobile-mode .date-picker select {
  flex: 1;
  font-size: 10px;
  padding: 2px 6px;
}

:root.mobile-mode .date-picker .btn {
  display: none;
}

:root.mobile-mode .tabs {
  justify-content: flex-start;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  margin-bottom: 6px;
  padding-bottom: 2px;
  scrollbar-width: none;
}

:root.mobile-mode .tabs::-webkit-scrollbar {
  display: none;
}

:root.mobile-mode .tab {
  padding: 4px 10px;
  font-size: 10px;
  white-space: nowrap;
  flex-shrink: 0;
}

:root.mobile-mode .stats {
  justify-content: space-around;
  margin: 4px 0;
}

:root.mobile-mode .stat {
  padding: 3px 6px;
  min-width: 50px;
  flex: 1;
}

:root.mobile-mode .stat .val {
  font-size: 12px;
}

:root.mobile-mode .stat .label {
  font-size: 8px;
}

:root.mobile-mode .timeline {
  margin: 4px 0;
}

:root.mobile-mode .tl-label {
  font-size: 8px;
}

:root.mobile-mode .cur-time {
  font-size: 11px;
  margin: 1px 0 4px;
}

/* 移动端股票卡片（替代表格） */
:root.mobile-mode .stock-card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 8px 10px;
  margin-bottom: 5px;
}

:root.mobile-mode .stock-card .rank {
  font-size: 10px;
  color: var(--text2);
  font-weight: 700;
}

:root.mobile-mode .stock-card .name-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 2px 0;
}

:root.mobile-mode .stock-card .code {
  font-family: "SF Mono", monospace;
  font-size: 11px;
  color: var(--accent);
  font-weight: 600;
}

:root.mobile-mode .stock-card .name {
  font-size: 12px;
  margin-left: 4px;
}

:root.mobile-mode .stock-card .score {
  font-size: 16px;
  font-weight: 700;
}

:root.mobile-mode .stock-card .heat-bar {
  width: 100%;
  height: 3px;
  background: var(--border);
  border-radius: 2px;
  margin: 3px 0;
  overflow: hidden;
}

:root.mobile-mode .stock-card .heat-bar .fill {
  height: 100%;
  border-radius: 2px;
}

:root.mobile-mode .stock-card .meta {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  align-items: center;
}

/* 隐藏桌面表格，显示移动端卡片容器 */
:root.mobile-mode #panel-stocks table {
  display: none;
}

:root.mobile-mode #stockMobile {
  display: block;
}

:root:not(.mobile-mode) #stockMobile {
  display: none;
}

/* 板块单列 */
:root.mobile-mode .sector-grid {
  grid-template-columns: 1fr;
  gap: 4px;
}

:root.mobile-mode .sector-card {
  padding: 8px 10px;
}

:root.mobile-mode .sector-card .sn {
  font-size: 14px;
}

/* 情绪居中放大 */
:root.mobile-mode .sent-box {
  margin-bottom: 8px;
}

:root.mobile-mode .sent-label {
  font-size: 15px;
}

:root.mobile-mode .sent-meter {
  height: 20px;
  max-width: 100%;
}

:root.mobile-mode .sent-labels {
  max-width: 100%;
  font-size: 10px;
}

/* 信号 2 列 */
:root.mobile-mode .action-grid {
  grid-template-columns: repeat(2, 1fr);
  gap: 4px;
  margin-bottom: 6px;
}

/* 情绪和信号的详情表改为可展开卡片 */
:root.mobile-mode #panel-sentiment table {
  display: none;
}

:root.mobile-mode #panel-actions table {
  display: none;
}

:root.mobile-mode .sent-detail-cards {
  display: block;
}

:root.mobile-mode .act-detail-cards {
  display: block;
}

:root:not(.mobile-mode) .sent-detail-cards,
:root:not(.mobile-mode) .act-detail-cards {
  display: none;
}

:root.mobile-mode .detail-card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 6px 10px;
  margin-bottom: 4px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

:root.mobile-mode .detail-card .dc-label {
  font-size: 11px;
}

:root.mobile-mode .detail-card .dc-value {
  font-size: 13px;
  font-weight: 700;
}

/* Modal 移动端适配 */
:root.mobile-mode .modal-overlay {
  display: none;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, .7);
  z-index: 1000;
  overflow-y: auto;
  padding: 10px;
}

:root.mobile-mode .modal-overlay.show {
  display: flex;
  align-items: center;
  justify-content: center;
}

:root.mobile-mode .modal-content {
  width: 95vw;
  max-height: 85vh;
  border-radius: 8px;
}

:root.mobile-mode .modal-header h2 {
  font-size: 14px;
}

:root.mobile-mode .modal-stats {
  padding: 8px 12px;
  gap: 4px;
}

:root.mobile-mode .modal-body {
  padding: 8px 12px;
}

:root.mobile-mode .msg-group-header .gn {
  font-size: 11px;
}

:root.mobile-mode .msg-item .mx {
  font-size: 12px;
}

:root.mobile-mode .footer {
  font-size: 8px;
  margin-top: 8px;
}

/* 切换按钮在移动端放大 */
:root.mobile-mode .view-toggle {
  top: 8px;
  right: 8px;
  width: 28px;
  height: 28px;
  font-size: 12px;
}
```

- [ ] **Step 2: 验证 CSS 无语法错误**

```bash
# 检查 CSS 文件是否被正确写入
wc -l frontend/style.css
```

确认行数 > 100。

- [ ] **Step 3: Commit**

```bash
git add frontend/style.css
git commit -m "feat: 添加移动端 CSS 覆盖样式层"
```

---

### Task 4: JS 添加模式切换与移动端渲染

**Files:**
- Modify: `frontend/app.js`

- [ ] **Step 1: 添加模式检测与切换函数**

在 `app.js` 顶部状态区域（line 9 之后）添加：

```javascript
/* Hot Dashboard - Frontend Application */

// ========== 状态 ==========
let data = null, idx = 0, playing = false, speed = 1, timer = null;
let activeTab = 'stocks', mode = 'replay';
const speeds = [1, 2, 5, 10];
let si = 0;
let liveTimer = null;
const API = window.location.origin;

// ========== 视图模式切换 ==========
function detectMobile() {
  var saved = localStorage.getItem('viewMode');
  if (saved) {
    document.documentElement.classList.toggle('mobile-mode', saved === 'mobile');
  } else {
    document.documentElement.classList.toggle('mobile-mode', window.innerWidth <= 768);
  }
  updateViewToggleBtn();
}

function toggleViewMode() {
  var isMobile = document.documentElement.classList.toggle('mobile-mode');
  localStorage.setItem('viewMode', isMobile ? 'mobile' : 'desktop');
  updateViewToggleBtn();
  render();
}

function updateViewToggleBtn() {
  var btn = document.getElementById('btnViewToggle');
  if (!btn) return;
  var isMobile = document.documentElement.classList.contains('mobile-mode');
  btn.textContent = isMobile ? '🖥' : '📱';
  btn.title = isMobile ? '切换到桌面版' : '切换到移动版';
}

// ========== 初始化 ==========
document.addEventListener('DOMContentLoaded', () => {
  detectMobile();
  fetchAvailableDates();
  setupTabs();
});
```

- [ ] **Step 2: 修改 render() 函数，分发到移动端渲染**

替换现有的 `render()` 函数（约 line 217-235）：

```javascript
// ========== 渲染 ==========
function render() {
  if (!data || !data.snapshots || !data.snapshots[idx]) return;
  var snap = data.snapshots[idx];
  document.getElementById('curTime').textContent = snap.t.split(' ')[1];

  document.getElementById('statsBar').innerHTML =
    '<div class="stat"><div class="val" style="color:var(--accent)">' + snap.msg + '</div><div class="label">消息</div></div>' +
    '<div class="stat"><div class="val" style="color:var(--accent)">' + snap.grp + '</div><div class="label">群</div></div>' +
    '<div class="stat"><div class="val" style="color:var(--green)">' + (snap.sd ? snap.sd.bu : '-') + '</div><div class="label">看多</div></div>' +
    '<div class="stat"><div class="val" style="color:var(--red)">' + (snap.sd ? snap.sd.be : '-') + '</div><div class="label">看空</div></div>' +
    '<div class="stat"><div class="val" style="color:var(--gold)">' + snap.sent + '</div><div class="label">情绪</div></div>';

  var maxS = snap.stk && snap.stk.length > 0 ? snap.stk[0].sc : 1;

  var isMobile = document.documentElement.classList.contains('mobile-mode');

  if (activeTab === 'stocks') {
    if (isMobile) renderStocksMobile(snap, maxS);
    else renderStocks(snap, maxS);
  } else if (activeTab === 'sectors') {
    if (isMobile) renderSectorsMobile(snap);
    else renderSectors(snap);
  } else if (activeTab === 'sentiment') {
    if (isMobile) renderSentimentMobile(snap);
    else renderSentiment(snap);
  } else if (activeTab === 'actions') {
    if (isMobile) renderActionsMobile(snap);
    else renderActions(snap);
  }
}
```

- [ ] **Step 3: 添加股票移动端渲染函数**

在 `renderStocks()` 函数之后添加：

```javascript
function renderStocksMobile(snap, maxS) {
  var container = document.getElementById('stockMobile');
  if (!snap.stk || !snap.stk.length) {
    container.innerHTML = '<div class="empty">暂无热点</div>';
    return;
  }
  var h = '';
  snap.stk.forEach(function (it, i) {
    var r = i + 1, rd = r;
    if (r === 1) rd = '🥇'; else if (r === 2) rd = '🥈'; else if (r === 3) rd = '🥉';
    var sc = 'sc-l';
    if (it.sc >= 60) sc = 'sc-h'; else if (it.sc >= 30) sc = 'sc-m';
    var p = Math.min(100, it.sc / maxS * 100);
    var bullTag = it.bu > it.be ? '<span class="tag tag-g">多' + it.bu + '</span>' :
      it.be > it.bu ? '<span class="tag tag-r">空' + it.be + '</span>' :
        '<span class="tag tag-b">均</span>';
    var actTag = it.ac > 0 ? '<span class="tag tag-r">操' + it.ac + '</span>' : '';
    var secTags = it.sec.slice(0, 3).map(function (s) { return '<span class="tag tag-s">' + s + '</span>'; }).join(' ');
    var nm = it.n || '-';
    h += '<div class="stock-card">' +
      '<div class="name-row"><div><span class="rank">' + rd + '</span> <span class="code">' + it.c + '</span><span class="name">' + nm + '</span></div><span class="' + sc + '">' + it.sc + '</span></div>' +
      '<div class="heat-bar"><div class="fill" style="width:' + p + '%;background:' + (it.sc >= 60 ? 'var(--green)' : it.sc >= 30 ? 'var(--yellow)' : 'var(--text2)') + '"></div></div>' +
      '<div class="meta">' +
      '<span class="tag tag-b">' + it.mc + '提及</span>' +
      '<span class="tag tag-b">' + it.gc + '群</span>' +
      bullTag + actTag + secTags +
      '</div></div>';
  });
  container.innerHTML = h;
}
```

- [ ] **Step 4: 添加板块移动端渲染函数**

在 `renderSectors()` 函数之后添加：

```javascript
function renderSectorsMobile(snap) {
  currentSectors = snap.sec || [];
  var grid = document.getElementById('sectorGrid');
  if (!currentSectors.length) {
    grid.innerHTML = '<div class="empty">暂无板块数据</div>';
    return;
  }
  var maxSc = currentSectors[0].sc || 1;
  var colors = ['var(--accent)', 'var(--green)', 'var(--purple)', 'var(--yellow)', 'var(--orange)', 'var(--red)', 'var(--text2)'];
  var h = '';
  currentSectors.forEach(function (it, i) {
    var pct = Math.min(100, it.sc / maxSc * 100);
    var bg = colors[i % colors.length];
    h += '<div class="sector-card" onclick="openSectorModal(' + i + ')">' +
      '<div class="sn">' + it.n + '</div>' +
      '<div class="info">' + it.mc + '次提及 · ' + it.gc + '个群</div>' +
      '<div class="bar"><div class="fill" style="width:' + pct + '%;background:' + bg + '"></div></div>' +
      '<div class="info" style="margin-top:3px;opacity:.7">' + (it.txt || '') + '</div></div>';
  });
  grid.innerHTML = h;
}
```

- [ ] **Step 5: 添加情绪移动端渲染函数（含可展开卡片替代表格）**

在 `renderSentiment()` 函数之后添加：

```javascript
function renderSentimentMobile(snap) {
  var sd = snap.sd;
  if (!sd) return;
  var total = sd.bu + sd.be + sd.ne || 1;
  var bp = Math.round(sd.bu / total * 100), ep = Math.round(sd.be / total * 100), np = 100 - bp - ep;
  document.getElementById('sentLabel').textContent = snap.sent;
  document.getElementById('sentMeter').innerHTML =
    '<div class="sent-bar sent-bull" style="width:' + bp + '%"></div>' +
    '<div class="sent-bar sent-neu" style="width:' + np + '%"></div>' +
    '<div class="sent-bar sent-bear" style="width:' + ep + '%"></div>';
  // 详情卡片替代表格
  var items = [
    { n: '看多', v: sd.bu, c: 'var(--green)' }, { n: '看空', v: sd.be, c: 'var(--red)' },
    { n: '观望', v: sd.ne, c: 'var(--yellow)' }, { n: '极度亢奋', v: sd.eh, c: 'var(--gold)' },
    { n: '极度悲观', v: sd.el, c: 'var(--red)' }
  ];
  var ch = '';
  items.forEach(function (it) {
    ch += '<div class="detail-card"><span class="dc-label" style="color:' + it.c + '">' + it.n + '</span>' +
      '<span class="dc-value" style="color:' + it.c + '">' + it.v + ' (' + Math.round(it.v / total * 100) + '%)</span></div>';
  });
  var dc = document.getElementById('sentDetailCards');
  if (dc) dc.innerHTML = ch;
}
```

- [ ] **Step 6: 添加信号移动端渲染函数（含可展开卡片替代表格）**

在 `renderActions()` 函数之后添加：

```javascript
function renderActionsMobile(snap) {
  var act = snap.act || {};
  var total = 0;
  for (var k in act) total += act[k];
  if (!total) total = 1;
  var icons = { '买入信号': '🟢', '卖出信号': '🔴', '持有建议': '🟡', '风险提示': '⚠️' };
  var grid = document.getElementById('actionGrid'), gh = '';
  for (var k in act) {
    gh += '<div class="action-card"><div class="icon">' + (icons[k] || '📊') + '</div>' +
      '<div class="count">' + act[k] + '</div><div class="label">' + k + '</div></div>';
  }
  grid.innerHTML = gh;
  // 详情卡片替代表格
  var ch = '';
  for (var k in act) {
    ch += '<div class="detail-card"><span class="dc-label">' + k + '</span>' +
      '<span class="dc-value">' + act[k] + ' (' + Math.round(act[k] / total * 100) + '%)</span></div>';
  }
  var dc = document.getElementById('actDetailCards');
  if (dc) dc.innerHTML = ch;
}
```

- [ ] **Step 7: Commit**

```bash
git add frontend/app.js
git commit -m "feat: 添加移动端视图切换与渲染函数"
```

---

### Task 5: HTML 添加移动端容器元素

**Files:**
- Modify: `frontend/index.html` (stock panel and sentiment/action panels)

- [ ] **Step 1: 添加移动端容器元素**

在 `frontend/index.html` 中修改以下面板：

股票面板（line 42），添加 `#stockMobile` 容器：

```html
<div class="panel active" id="panel-stocks">
  <table><thead><tr><th>#</th><th>代码</th><th>名称</th><th>热度</th><th>提及</th><th>群</th><th>多空</th><th>板块</th><th>操作</th></tr></thead><tbody id="stockBody"></tbody></table>
  <div id="stockMobile"></div>
</div>
```

情绪面板（line 53-54），在表格前添加详情卡片容器：

```html
<div class="panel" id="panel-sentiment">
  <div class="sent-box">
    <div class="sent-label" id="sentLabel">--</div>
    <div class="sent-meter" id="sentMeter"></div>
    <div class="sent-labels"><span>看多</span><span>观望</span><span>看空</span></div>
  </div>
  <div class="stats" id="sentDetails"></div>
  <div class="sent-detail-cards" id="sentDetailCards"></div>
  <table><thead><tr><th>情绪类型</th><th>匹配数</th><th>占比</th></tr></thead><tbody id="sentBody"></tbody></table>
</div>
```

信号面板（line 57-58），在表格前添加详情卡片容器：

```html
<div class="panel" id="panel-actions">
  <div class="action-grid" id="actionGrid"></div>
  <div class="act-detail-cards" id="actDetailCards"></div>
  <table><thead><tr><th>信号类型</th><th>数量</th><th>占比</th><th>示例关键词</th></tr></thead><tbody id="actBody"></tbody></table>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/index.html
git commit -m "feat: 添加移动端容器元素（股票卡片、情绪/信号详情卡片）"
```

---

### Task 6: 手动验证与修复

- [ ] **Step 1: 启动服务器**

```bash
make server
```

- [ ] **Step 2: 桌面版验证**

浏览器打开 `http://127.0.0.1:8765`，确认：
- 桌面版布局与之前完全一致（表格、Grid、情绪仪表等）
- 右上角切换按钮显示为 📱
- Tab 切换、时间轴播放、日期选择正常
- 板块卡片点击弹窗正常

- [ ] **Step 3: 移动端验证**

Chrome DevTools 打开 Device Mode，选择 iPhone 14 视口：
- 页面自动切换为移动端布局
- 标题栏紧凑，控制按钮缩小
- Tab 栏可横向滚动
- 股票面板显示为卡片列表（非表格）
- 板块面板单列全宽卡片
- 情绪面板仪表居中放大，详情为卡片
- 信号面板 2 列 Grid，详情为卡片
- 点击右上角 🖥 切换回桌面版
- 刷新页面后模式被记住
- 切换模式不触发数据重新请求

- [ ] **Step 4: 修复发现的问题**

根据验证结果修复任何布局或功能问题。

- [ ] **Step 5: Commit 修复**

```bash
git add -A
git commit -m "fix: 修复移动端布局细节问题"
```
