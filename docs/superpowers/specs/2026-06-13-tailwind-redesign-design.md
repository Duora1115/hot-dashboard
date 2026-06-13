# 前端 Tailwind CSS + DaisyUI 重构设计

**日期**: 2026-06-13
**状态**: 设计中

## 概述

将现有前端从自定义 CSS 迁移到 Tailwind CSS 框架 + DaisyUI 组件库，实现全面的视觉现代化重构。

## 目标

1. 使用 Tailwind CSS utility-first 方式重写所有样式
2. 引入 DaisyUI 组件库加速开发
3. 保持深色主题（dark theme）
4. 使用 Tailwind 响应式系统替代手动 mobile/desktop 模式切换
5. 重构核心组件的视觉设计，提升现代感和用户体验

## 非目标

- 不改变前端功能逻辑（app.js 保持不变）
- 不改变后端 API 接口
- 不引入前端框架（Vue/React 等）

---

## 1. 构建流程

### 1.1 Tailwind 集成方式

使用 **Tailwind CLI** 方式集成（非 CDN，非 Webpack/Vite）。

### 1.2 项目结构调整

```
frontend/
├── src/
│   └── styles.css          # Tailwind 源文件（@tailwind 指令）
├── dist/                   # 编译输出（加入 .gitignore）
│   └── styles.css
├── index.html              # 引用 dist/styles.css
├── app.js                  # 保持不变
└── style.css               # 删除（被 Tailwind 替代）
```

### 1.3 依赖安装

```bash
npm init -y
npm install -D tailwindcss daisyui
```

### 1.4 Makefile 新增命令

```makefile
css:          # 编译 Tailwind CSS（开发）
	npx tailwindcss -i frontend/src/styles.css -o frontend/dist/styles.css

css-watch:    # Watch 模式开发
	npx tailwindcss -i frontend/src/styles.css -o frontend/dist/styles.css --watch

css-prod:     # 生产构建（minify）
	npx tailwindcss -i frontend/src/styles.css -o frontend/dist/styles.css --minify
```

### 1.5 tailwind.config.js

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
        "primary": "#60a5fa",      // 蓝色，链接、强调
        "secondary": "#a855f7",    // 紫色，标签
        "accent": "#fbbf24",       // 金色，时间高亮
        "neutral": "#1e293b",      // 深色背景
        "base-100": "#0f172a",     // 主背景
        "base-200": "#1e293b",     // 卡片背景
        "base-300": "#334155",     // 边框
        "info": "#60a5fa",
        "success": "#22c55e",      // 看多/买入
        "warning": "#eab308",      // 观望
        "error": "#ef4444",        // 看空/卖出
      }
    }]
  }
}
```

### 1.6 源文件 frontend/src/styles.css

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

---

## 2. 配色方案

### 2.1 主色调（DaisyUI dark 主题自定义）

| 语义 | 颜色值 | 用途 |
|------|--------|------|
| primary | `#60a5fa` | 链接、强调色、代码 |
| secondary | `#a855f7` | 标签、板块标记 |
| accent | `#fbbf24` | 时间高亮、金色 |
| success | `#22c55e` | 看多、买入信号、高分 |
| warning | `#eab308` | 观望、中等热度 |
| error | `#ef4444` | 看空、卖出信号、低分 |
| base-100 | `#0f172a` | 页面主背景 |
| base-200 | `#1e293b` | 卡片背景 |
| base-300 | `#334155` | 边框、分隔线 |
| neutral | `#1e293b` | 中性色背景 |

### 2.2 文字颜色

| 用途 | Tailwind 类 |
|------|-------------|
| 主文字 | `text-white` / `text-base-content` |
| 次要文字 | `text-slate-400` |
| 标签文字 | `text-slate-500` |

---

## 3. 响应式策略

### 3.1 断点定义

使用 Tailwind 默认断点，mobile-first 设计：

| 断点 | 宽度 | 布局调整 |
|------|------|---------|
| 默认 | <640px | 单列布局，卡片堆叠 |
| `sm:` | ≥640px | 股票 2 列，板块 2 列 |
| `md:` | ≥768px | 股票 3 列，板块 3 列，信号 4 列 |
| `lg:` | ≥1024px | 板块 4 列，更大间距 |
| `xl:` | ≥1280px | 股票 4 列，最大宽度居中 |

### 3.2 移除的功能

- **📱 视图切换按钮** - 不再需要，完全自动响应式
- **手动 `.mobile-mode` class** - 全部用 Tailwind 响应式类替代
- **HTML 中的 `btnViewToggle` 按钮** - 删除

### 3.3 各组件响应式行为

| 组件 | 移动端 (<640px) | 平板 (640-1024px) | 桌面 (>1024px) |
|------|-----------------|-------------------|----------------|
| 股票列表 | 单列卡片 | 2-3 列网格 | 4 列网格 |
| 板块网格 | 单列卡片 | 2-3 列网格 | 4 列网格 |
| 操作信号 | 2 列网格 | 4 列网格 | 4 列网格 |
| Stats 栏 | flex-wrap 换行 | 单行排列 | 单行排列 |
| Tab 栏 | 横向滚动 | 居中排列 | 居中排列 |
| Modal | 全屏宽度 | max-width 600px | max-width 600px |
| Header | 垂直堆叠 | 水平排列 | 水平排列 |

---

## 4. 组件设计详细规格

### 4.1 Header 和控制栏

**布局**: 居中对齐，垂直堆叠

```html
<div class="text-center mb-4">
  <h1 class="text-xl md:text-2xl font-bold text-white">🔥 飞书投资群 · 多维热点看板</h1>
  <div class="text-sm text-primary mt-1">2026-06-13 周五</div>
</div>
```

**控制按钮**: flex 布局，gap-2，使用 `btn` 类

```html
<div class="flex gap-2 justify-center flex-wrap mb-3">
  <button class="btn btn-sm btn-outline">▶ 播放</button>
  <button class="btn btn-sm btn-outline">1x</button>
  <button class="btn btn-sm btn-outline">⏭</button>
  <button class="btn btn-sm btn-outline">⏮</button>
  <button class="btn btn-sm btn-outline">🔄 采集</button>
</div>
```

### 4.2 Tab 导航栏

**样式**: 胶囊按钮风格，外层容器包裹

```html
<div class="flex gap-1.5 justify-center p-1 bg-base-200 rounded-xl border border-base-300 mb-4 mx-auto max-w-lg">
  <button class="btn btn-sm btn-primary">📈 股票热点</button>
  <button class="btn btn-sm btn-ghost">🏭 板块热度</button>
  <button class="btn btn-sm btn-ghost">💭 市场情绪</button>
  <button class="btn btn-sm btn-ghost">⚡ 操作信号</button>
</div>
```

### 4.3 Stats 统计栏

**布局**: flex 居中，flex-wrap 自动换行

```html
<div class="flex gap-2 justify-center flex-wrap my-3">
  <div class="bg-base-200 border border-base-300 rounded-lg px-4 py-2 text-center min-w-[80px]">
    <div class="text-lg font-bold text-white">156</div>
    <div class="text-xs text-slate-400 mt-0.5">总提及</div>
  </div>
  <!-- 更多 stat 卡片 -->
</div>
```

### 4.4 时间轴滑块

**样式**: 渐变进度条，圆形滑块

```html
<div class="my-3">
  <div class="flex justify-between text-xs text-slate-400 mb-1">
    <span>09:30</span>
    <span>15:00</span>
  </div>
  <input type="range" class="range range-primary range-sm w-full" />
  <div class="text-center text-base font-bold text-accent mt-2">13:45</div>
</div>
```

### 4.5 股票列表（卡片网格）

**布局**: 响应式网格

```html
<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
  <!-- 每张卡片 -->
  <div class="bg-base-200 border border-base-300 rounded-lg p-3 hover:border-primary transition-colors cursor-pointer">
    <div class="flex justify-between items-center mb-2">
      <span class="text-xs text-slate-400 font-semibold">#1</span>
      <span class="text-xl font-bold text-success">85</span>
    </div>
    <div class="text-sm font-bold text-white mb-0.5">宁德时代</div>
    <div class="text-xs text-primary font-mono mb-2">300750</div>
    <div class="flex gap-1 flex-wrap mb-2">
      <span class="badge badge-success badge-sm">看多</span>
      <span class="badge badge-info badge-sm">新能源</span>
    </div>
    <div class="h-1 bg-base-300 rounded-full overflow-hidden">
      <div class="h-full w-[85%] bg-gradient-to-r from-success to-green-700 rounded-full"></div>
    </div>
    <div class="text-xs text-slate-400 mt-1.5">提及 28 次 · 5 个群</div>
  </div>
</div>
```

**热度颜色映射**:
- 高分 (≥80): `text-success` + 绿色渐变
- 中分 (60-79): `text-warning` + 黄色渐变
- 低分 (<60): `text-error` + 红色渐变

### 4.6 板块热度卡片

**布局**: 响应式网格

```html
<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
  <div class="bg-base-200 border border-base-300 rounded-lg p-3 hover:border-primary transition-colors cursor-pointer">
    <div class="text-base font-bold text-white mb-1">新能源</div>
    <div class="text-xs text-slate-400 mb-2">提及 45 次 · 8 个群</div>
    <div class="h-1 bg-base-300 rounded-full overflow-hidden">
      <div class="h-full w-[90%] bg-gradient-to-r from-primary to-blue-700 rounded-full"></div>
    </div>
  </div>
</div>
```

### 4.7 市场情绪面板

**布局**: 居中，三段式进度条

```html
<div class="text-center mb-4">
  <div class="text-lg font-bold text-success mb-2">偏多 (Bullish)</div>
  <div class="flex h-6 bg-base-200 border border-base-300 rounded-lg overflow-hidden max-w-md mx-auto">
    <div class="w-[55%] h-full bg-gradient-to-r from-success to-green-700"></div>
    <div class="w-[25%] h-full bg-slate-500"></div>
    <div class="w-[20%] h-full bg-gradient-to-r from-error to-red-700"></div>
  </div>
  <div class="flex justify-between max-w-md mx-auto mt-1.5 text-xs text-slate-400">
    <span>看多 55%</span>
    <span>观望 25%</span>
    <span>看空 20%</span>
  </div>
</div>
```

### 4.8 操作信号网格

**布局**: 响应式网格

```html
<div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
  <div class="bg-base-200 border border-base-300 rounded-lg p-4 text-center">
    <div class="text-2xl mb-1.5">🟢</div>
    <div class="text-3xl font-bold text-success">12</div>
    <div class="text-xs text-slate-400 mt-1">买入信号</div>
  </div>
  <!-- 更多信号卡片 -->
</div>
```

### 4.9 Modal 弹窗

**实现**: 使用 DaisyUI modal 组件

```html
<dialog id="modalOverlay" class="modal">
  <div class="modal-box w-11/12 max-w-2xl bg-base-200 border border-base-300">
    <form method="dialog">
      <button class="btn btn-sm btn-circle btn-ghost absolute right-3 top-3">✕</button>
    </form>
    <h2 class="text-lg font-bold text-white mb-4">🏭 新能源板块详情</h2>
    
    <!-- Stats -->
    <div class="flex gap-3 mb-4 flex-wrap">
      <div class="flex-1 min-w-[100px] text-center">
        <div class="text-xl font-bold text-success">45</div>
        <div class="text-xs text-slate-400 mt-0.5">总提及</div>
      </div>
      <!-- 更多 stats -->
    </div>
    
    <!-- 消息列表 -->
    <div class="overflow-y-auto max-h-[50vh]">
      <!-- 消息组 -->
      <div class="mb-3">
        <div class="flex justify-between items-center px-3 py-2 bg-primary/10 rounded-lg mb-1.5">
          <span class="font-bold text-sm text-primary">📊 A股价值投资群</span>
          <span class="text-xs text-slate-400">8 条消息</span>
        </div>
        <div class="pl-3.5 ml-3 border-l-2 border-base-300 bg-white/5 rounded-r-lg py-2 px-3 my-1">
          <div class="text-xs text-slate-400 mb-1">10:23</div>
          <div class="text-sm text-slate-200 leading-relaxed">新能源板块今天强势拉升...</div>
        </div>
      </div>
    </div>
  </div>
  <form method="dialog" class="modal-backdrop">
    <button>close</button>
  </form>
</dialog>
```

### 4.10 Footer

```html
<div class="text-center text-xs text-slate-500 mt-4 opacity-60">
  数据来源：25个飞书投资群 | 每5分钟更新 | 仅供参考
</div>
```

---

## 5. HTML 结构变更

### 5.1 index.html 主要修改

1. **替换 CSS 引用**:
   ```html
   <!-- Before -->
   <link rel="stylesheet" href="/static/style.css">
   <!-- After -->
   <link rel="stylesheet" href="/static/dist/styles.css">
   ```

2. **移除视图切换按钮**:
   ```html
   <!-- 删除 -->
   <button class="view-toggle" id="btnViewToggle" onclick="toggleViewMode()" title="切换桌面/移动视图">📱</button>
   ```

3. **所有 class 替换为 Tailwind utility classes**

### 5.2 app.js 修改

1. **移除 `toggleViewMode()` 函数** - 不再需要手动切换
2. **移除 `.mobile-mode` class 操作** - 全部由 Tailwind 响应式处理
3. **动态生成的 HTML 需要使用 Tailwind classes** - 更新 `renderStocks()`, `renderSectors()`, `renderSentiment()`, `renderActions()` 等函数中的 HTML 模板

### 5.3 删除文件

- `frontend/style.css` - 被 Tailwind 替代

---

## 6. 后端服务调整

### 6.1 静态文件服务

FastAPI 后端需要正确服务 `frontend/dist/` 目录：

```python
# server.py 中的静态文件挂载
app.mount("/static/dist", StaticFiles(directory="frontend/dist"), name="static-dist")
```

### 6.2 Makefile 更新

```makefile
server: css   # 启动服务器前先编译 CSS
	python -m uvicorn backend.server:app --reload

css:
	npx tailwindcss -i frontend/src/styles.css -o frontend/dist/styles.css
```

---

## 7. 迁移步骤

1. 安装 Tailwind CSS 和 DaisyUI 依赖
2. 创建 `tailwind.config.js` 和 `frontend/src/styles.css`
3. 编译 CSS 并更新 `index.html` 引用
4. 逐步重写 `index.html` 中的 class 为 Tailwind utility classes
5. 更新 `app.js` 中动态生成的 HTML 模板
6. 移除 `style.css` 和视图切换逻辑
7. 更新 Makefile 和后端静态文件服务
8. 测试所有页面和响应式行为

---

## 8. 测试要点

- [ ] 所有 4 个 Tab 面板正常显示
- [ ] 股票列表在不同屏幕宽度下列数正确
- [ ] 板块卡片响应式布局正常
- [ ] 情绪面板进度条宽度正确
- [ ] 操作信号网格响应式正常
- [ ] Modal 弹窗打开/关闭正常
- [ ] 时间轴滑块可拖动
- [ ] 播放/暂停/变速功能正常
- [ ] 日期选择和切换正常
- [ ] 移动端（<640px）布局正确
- [ ] 平板（640-1024px）布局正确
- [ ] 桌面（>1024px）布局正确
- [ ] 深色主题配色一致
- [ ] hover 动效正常
- [ ] CSS 编译流程正常（dev + prod）

---

## 9. 性能考虑

- Tailwind CSS 在生产环境构建时会自动 tree-shaking，只包含用到的 utility classes
- DaisyUI 组件按需引入，不会增加额外负担
- 预计最终 CSS 文件大小 < 50KB（gzip 后）

---

## 10. 浏览器兼容性

- Tailwind CSS 支持所有现代浏览器
- DaisyUI 组件使用标准 HTML/CSS，兼容性好
- 需要 CSS Grid 和 Flexbox 支持（IE11 不支持，但项目不需要兼容 IE）
