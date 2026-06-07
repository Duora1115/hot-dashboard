# 🔥 飞书群热点多维看板

从25个飞书投资群采集消息，多维度分析A股热点（股票/板块/情绪/操作），提供可视化Web看板。

## 功能

- **股票热点**: Top10排行，含热度评分、多空对比、关联板块
- **板块热度**: 热门板块排行，含提及次数、涉及群数
- **市场情绪**: 看多/看空/观望比例，极度亢奋/悲观标记
- **操作信号**: 买入/卖出/持有/风险提示信号统计
- **时间轴回放**: 拖动滑块查看全天热点演变，支持播放/变速
- **实时采集**: 盘中每5分钟、盘外每30分钟自动采集

## 架构

```
hot-dashboard/
├── backend/
│   ├── collector.py     # 采集引擎（抓取+分析）
│   └── server.py        # FastAPI 服务（API + 前端托管）
├── frontend/
│   ├── index.html       # 前端页面
│   ├── style.css        # 样式
│   └── app.js           # 前端逻辑
├── config/
│   └── settings.yaml    # 配置（群列表、板块词库、情绪词库）
├── scripts/
│   ├── collect.py       # 定时采集脚本（被 cron 调用）
│   └── replay.py        # 历史回放脚本
├── data/                # 数据存储（自动创建）
└── deploy/              # 部署配置（crontab, launchd）
```

## 快速开始

```bash
cd ~/git/hot-dashboard

# 1. 安装依赖
make install

# 2. 启动服务器
make server
# 访问 http://127.0.0.1:8765

# 3. 历史回放（测试用）
make replay DATE=2026-06-05

# 4. 手动采集一次
make collect
```

## 定时调度

### 方案A: Cron（推荐）
```bash
make cron-install    # 安装定时任务
make cron-remove     # 移除定时任务
```

### 方案B: macOS Launchd
```bash
make launchd-install  # 安装服务（自动重启）
make launchd-remove   # 移除服务
```

## API 文档

启动服务器后访问 http://127.0.0.1:8765/docs 查看 Swagger 文档。

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/status` | GET | 服务状态 |
| `/api/dates` | GET | 可用日期列表 |
| `/api/latest` | GET | 最新实时快照 |
| `/api/day/{date}` | GET | 指定日期完整数据 |
| `/api/collect` | POST | 手动触发采集 |
| `/api/replay/{date}` | POST | 触发历史回放 |

## 依赖

- Python 3.9+
- FastAPI + Uvicorn
- PyYAML
- lark-cli（飞书CLI，需提前授权）

## 配置

编辑 `config/settings.yaml` 可修改：
- 飞书群列表（chat_id + 名称）
- 板块关键词映射
- 情绪词库
- 操作意图词库
- 服务器地址/端口
