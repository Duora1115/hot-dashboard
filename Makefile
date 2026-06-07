# Hot Dashboard Makefile

.PHONY: install server collect replay cron status

# 安装依赖
install:
	pip3 install -r requirements.txt

# 启动开发服务器
server:
	cd $$(pwd) && python3 -m uvicorn backend.server:app --host 127.0.0.1 --port 8765 --reload

# 生产服务器（后台运行）
server-prod:
	cd $$(pwd) && nohup python3 -m uvicorn backend.server:app --host 127.0.0.1 --port 8765 --workers 2 > /tmp/hot_dashboard_server.log 2>&1 &
	@echo "Server started on http://127.0.0.1:8765"

# 停止服务器
server-stop:
	-pkill -f "uvicorn backend.server"

# 手动采集一次
collect:
	python3 scripts/collect.py

# 历史回放
replay:
	@echo "用法: make replay DATE=2026-06-05"
	python3 scripts/replay.py $(DATE)

# 安装 cron
cron-install:
	@echo "安装 crontab..."
	@(crontab -l 2>/dev/null; cat deploy/crontab.example | grep -v '^#') | sort -u | crontab -
	@echo "Cron 已安装"

# 移除 cron
cron-remove:
	@echo "移除 crontab..."
	crontab -l | grep -v hot-dashboard | crontab -
	@echo "Cron 已移除"

# 安装 launchd (macOS)
launchd-install:
	@PLIST=$$(pwd)/deploy/com.hotdashboard.server.plist; \
	sed "s|\$${PROJECT_DIR}|$$(pwd)|g" $$PLIST > /tmp/com.hotdashboard.server.plist; \
	cp /tmp/com.hotdashboard.server.plist ~/Library/LaunchAgents/; \
	launchctl load ~/Library/LaunchAgents/com.hotdashboard.server.plist; \
	echo "launchd 服务已安装并启动"

launchd-remove:
	-launchctl unload ~/Library/LaunchAgents/com.hotdashboard.server.plist 2>/dev/null
	-rm ~/Library/LaunchAgents/com.hotdashboard.server.plist 2>/dev/null
	@echo "launchd 服务已移除"

# 查看状态
status:
	@echo "=== 数据文件 ==="
	@ls -la data/ 2>/dev/null || echo "data 目录不存在"
	@echo ""
	@echo "=== 服务器状态 ==="
	@curl -s http://127.0.0.1:8765/api/status 2>/dev/null || echo "服务器未运行"
	@echo ""
	@echo "=== 可用日期 ==="
	@curl -s http://127.0.0.1:8765/api/dates 2>/dev/null || echo "服务器未运行"
