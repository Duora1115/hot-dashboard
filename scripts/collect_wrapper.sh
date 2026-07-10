#!/usr/bin/env bash
# 热点采集智能调度器
# 交易时间(09:00-16:00)每5分钟执行
# 其他时间每30分钟执行

set -euo pipefail

# 确保 cron 环境下 HOME 和 PATH 正确
export HOME=/root
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/bin:/bin:/usr/local/bin

# lark-cli 在 OpenClaw 集成模式下需要此变量才能正确读取 profile 配置
export OPENCLAW_SERVICE_MARKER=openclaw

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR/.."
STATE_FILE="/tmp/hot_dashboard_last_run"
LOG_FILE="/root/.openclaw/workspace/logs/hot-dashboard/cron.log"

# 获取当前时间（北京时间）
HOUR=$(date +%H)
MIN=$(date +%M)
WEEKDAY=$(date +%u)  # 1-5=周一到周五，6=周六，7=周日

# 判断是否在交易时间（周一至周五 9:00-16:00）
is_trading_hours() {
    # 周末不开盘
    if [ "$WEEKDAY" -gt 5 ]; then
        return 1
    fi

    # 9:00-16:00
    if [ "$HOUR" -ge 9 ] && [ "$HOUR" -lt 16 ]; then
        return 0
    fi

    return 1
}

# 检查距离上次执行是否超过30分钟
should_run_off_hours() {
    if [ ! -f "$STATE_FILE" ]; then
        return 0
    fi
    LAST=$(cat "$STATE_FILE")
    NOW=$(date +%s)
    DIFF=$((NOW - LAST))
    if [ $DIFF -ge 1800 ]; then  # 30分钟 = 1800秒
        return 0
    fi
    return 1
}

# 判断是否该执行
if is_trading_hours; then
    # 开盘时间内 → 每5分钟都执行（由 cron */5 保证）
    RUN=true
else
    # 非开盘时间 → 每30分钟执行一次
    if should_run_off_hours; then
        RUN=true
    else
        RUN=false
    fi
fi

if [ "$RUN" = false ]; then
    # 非开盘时间且未到30分钟间隔，静默跳过
    exit 0
fi

# 记录执行时间
date +%s > "$STATE_FILE"

# 防止重叠执行（文件锁）
exec 200>"/tmp/hot_dashboard.lock"
if ! flock -n 200; then
    echo "[$(date '+%Y-%m-%d %H:%M')] 已有实例在运行，跳过" >> "$LOG_FILE"
    exit 0
fi

# 执行采集
cd "$PROJECT_DIR" || exit 1
python3 scripts/collect.py >> "$LOG_FILE" 2>&1
