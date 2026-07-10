#!/usr/bin/env bash
# 热点采集 + 推送（供 OpenClaw cron 或手动调用）

set -euo pipefail

PROJECT_DIR="/root/git/hot-dashboard"
LOG_DIR="/root/.openclaw/workspace/logs/hot-dashboard"
LATEST_LOG="$LOG_DIR/latest_collect.log"

mkdir -p "$LOG_DIR"

cd "$PROJECT_DIR" || exit 1

# 执行采集，捕获输出
OUTPUT=$(python3 scripts/collect.py 2>&1)

# 保存完整输出
echo "$OUTPUT" > "$LATEST_LOG"

# 提取 NOTIFY 标记间内容
if echo "$OUTPUT" | grep -q "---NOTIFY_START---" && echo "$OUTPUT" | grep -q "---NOTIFY_END---"; then
    # 有标记 → 提取并输出（供 OpenClaw 读取后推送）
    echo "$OUTPUT" | sed -n '/---NOTIFY_START---/,/---NOTIFY_END---/p' | sed '1d;$d'
    exit 0
else
    # 无标记 → 输出错误信息
    echo "采集完成，但未找到 NOTIFY 标记。原始输出："
    echo "$OUTPUT" | head -20
    exit 1
fi
