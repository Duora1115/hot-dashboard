#!/usr/bin/env bash
# 每日收盘后重建观点宫殿索引。
# 档案由实时采集（每 5 分钟）持续追加，这里只做派生索引的重建。
set -euo pipefail

export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR/.."
LOG_FILE="${PALACE_LOG:-/tmp/hot_dashboard_palace.log}"

cd "$PROJECT_DIR" || exit 1
echo "[$(date '+%Y-%m-%d %H:%M')] 开始重建 palace 索引" >> "$LOG_FILE"
python3 scripts/build_palace.py >> "$LOG_FILE" 2>&1
echo "[$(date '+%Y-%m-%d %H:%M')] 完成" >> "$LOG_FILE"
