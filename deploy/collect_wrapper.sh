#!/usr/bin/env bash
# 采集 + 观点宫殿档案推送（machine A 每 5 分钟由 cron 调用）。
#
# 为什么档案同步要限频（PALACE_MIN_INTERVAL）：
#   `sync.py --palace` 会把整份 data/archive/*.jsonl 全量重推一遍
#   （当前 5.4 万行 / 约 12.9 MB），推完还会在云端触发一次全量重建
#   （本地实测约 13 秒 CPU）。而档案是只追加的，这两个数字只会越来越大。
#   如果每 5 分钟跑一次，就是约 155 MB/小时上行 + 持续吃掉约 4% 单核，
#   且成本随档案增长无上限。下限把实际推送压到约每 30 分钟一次。
#   别"优化"掉 --min-interval：它挡的是随档案增长的成本，不是当前数字。
#
# 故意不加 set -e：采集本身失败也不该中止整个 wrapper（下面还有同步要跑）。

# 自定位：从脚本自身路径推出项目根，不依赖调用者的 cwd。环境变量可覆盖。
PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
LOG_FILE="${LOG_FILE:-$PROJECT_DIR/logs/collect.log}"
PALACE_MIN_INTERVAL="${PALACE_MIN_INTERVAL:-1800}"

mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null

cd "$PROJECT_DIR" || exit 1

# 采集：失败留下痕迹即可，不中断（后面还有同步要跑）。
"$PYTHON_BIN" scripts/collect.py >> "$LOG_FILE" 2>&1

# 档案推送：--min-interval 在 Python 侧限频，间隔没到的 run 会打印一行原因后直接退出。
# || true：同步失败不能被当成这次采集失败。
"$PYTHON_BIN" scripts/sync.py --palace --min-interval "$PALACE_MIN_INTERVAL" >> "$LOG_FILE" 2>&1 || true
