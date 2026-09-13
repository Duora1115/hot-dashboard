"""测试 collector 模块的消息去重逻辑"""
import json
import tempfile
from datetime import datetime
from pathlib import Path
from unittest.mock import patch, MagicMock
from backend import collector

# fetch_messages_incremental 只返回"今天"的消息，测试用动态日期
_TODAY = datetime.now().strftime("%Y-%m-%d")


def test_fetch_messages_incremental_no_duplicates():
    """测试增量抓取不会产生重复消息"""
    with tempfile.TemporaryDirectory() as tmpdir:
        data_dir = Path(tmpdir)

        # 模拟 lark-cli 返回的消息（包含重复）
        # 场景：第一页有消息A、B，第二页又有消息B（重复）、C
        mock_responses = [
            # 第一页
            {
                "data": {
                    "messages": [
                        {"message_id": "msg_a", "create_time": f"{_TODAY} 10:00", "content": "消息A"},
                        {"message_id": "msg_b", "create_time": f"{_TODAY} 10:01", "content": "消息B"},
                    ],
                    "has_more": True,
                    "page_token": "page2"
                }
            },
            # 第二页（包含重复的msg_b）
            {
                "data": {
                    "messages": [
                        {"message_id": "msg_b", "create_time": f"{_TODAY} 10:01", "content": "消息B"},  # 重复
                        {"message_id": "msg_c", "create_time": f"{_TODAY} 10:02", "content": "消息C"},
                    ],
                    "has_more": False,
                    "page_token": None
                }
            }
        ]

        call_count = [0]

        def mock_run(cmd, capture_output, text, timeout):
            result = MagicMock()
            result.returncode = 0
            result.stdout = json.dumps(mock_responses[call_count[0]])
            call_count[0] += 1
            return result

        with patch("subprocess.run", side_effect=mock_run):
            msgs = collector.fetch_messages_incremental("test_chat", data_dir, max_pages=3)

        # 验证：返回的消息不应该有重复
        msg_ids = [m.get("message_id") for m in msgs]
        assert len(msg_ids) == len(set(msg_ids)), f"发现重复消息: {msg_ids}"

        # 验证：应该返回3条不同的消息（A、B、C）
        assert len(msgs) == 3, f"期望3条消息，实际返回{len(msgs)}条"


def test_fetch_messages_incremental_cache_dedup():
    """测试已缓存的消息会随返回（累计语义），但不会重复出现"""
    with tempfile.TemporaryDirectory() as tmpdir:
        data_dir = Path(tmpdir)

        # 先写入缓存，模拟之前已经抓取过msg_a
        cache_data = {
            "test_chat": {
                "msg_a": {"message_id": "msg_a", "create_time": f"{_TODAY} 10:00", "content": "消息A"}
            }
        }
        collector.save_cache(data_dir, cache_data)

        # 模拟API返回：msg_a（已在缓存中）、msg_b（新消息）
        mock_response = {
            "data": {
                "messages": [
                    {"message_id": "msg_a", "create_time": f"{_TODAY} 10:00", "content": "消息A"},
                    {"message_id": "msg_b", "create_time": f"{_TODAY} 10:01", "content": "消息B"},
                ],
                "has_more": False,
                "page_token": None
            }
        }

        def mock_run(cmd, capture_output, text, timeout):
            result = MagicMock()
            result.returncode = 0
            result.stdout = json.dumps(mock_response)
            return result

        with patch("subprocess.run", side_effect=mock_run):
            msgs = collector.fetch_messages_incremental("test_chat", data_dir, max_pages=3)

        # 验证：返回今天全部消息（msg_a + msg_b），且不重复
        msg_ids = [m.get("message_id") for m in msgs]
        assert set(msg_ids) == {"msg_a", "msg_b"}, f"应返回全部今日消息，实际: {msg_ids}"
        assert len(msg_ids) == len(set(msg_ids)), f"返回的消息有重复: {msg_ids}"


def test_analyze_text_deduplicates_codes():
    """测试同一消息中多次提到的同一股票代码应该去重"""
    cfg = {"sectors": {}, "sentiments": {}, "actions": {}}
    # 模拟广和通消息：同一消息中出现3次广和通链接
    text = (
        "[广和通](https://wap.eastmoney.com/quote/stock/0.300638.html)，不属于回踩买点结构；\n"
        "[广和通](https://wap.eastmoney.com/quote/stock/0.300638.html)，属于模组的；\n"
        "想请教下[广和通](https://wap.eastmoney.com/quote/stock/0.300638.html)是出现回踩买点结构了吗？\n"
        "目前仅有[瑞芯微](https://wap.eastmoney.com/quote/stock/1.603893.html)出现突破买点结构。"
    )

    result = collector.analyze_text(text, cfg)

    # 广和通只应出现一次
    assert result["codes"].count("300638") == 1, (
        f"广和通代码应去重，实际出现{result['codes'].count('300638')}次: {result['codes']}"
    )
    # 瑞芯微正常出现一次
    assert result["codes"].count("603893") == 1


def test_compute_snapshot_counts_unique_messages_per_stock():
    """测试同一股票在同一条消息中被多次提及只计一次"""
    cfg = {
        "sectors": {},
        "sentiments": {"看多": ["推荐", "看好"]},
        "actions": {}
    }
    # 一条消息，同一股票被提及3次
    text = (
        "[广和通](https://wap.eastmoney.com/quote/stock/0.300638.html)看好，\n"
        "[广和通](https://wap.eastmoney.com/quote/stock/0.300638.html)看好，\n"
        "继续看好[广和通](https://wap.eastmoney.com/quote/stock/0.300638.html)"
    )
    msg = {
        "message_id": "msg_300638",
        "create_time": "2026-08-08 10:47",
        "content": text,
        "_analysis": collector.analyze_text(text, cfg),
    }

    all_analyzed = {"test_group": [msg]}
    snapshot = collector.compute_snapshot(all_analyzed, "2026-08-08 10:47", cfg)

    # 找到广和通股票
    target = next((s for s in snapshot["top10_stocks"] if s["code"] == "300638"), None)
    assert target is not None, "快照中应包含广和通"

    # mention_count 应为1（一条消息），而不是3（提到3次）
    assert target["mention_count"] == 1, (
        f"mention_count 应为1，实际为{target['mention_count']}"
    )
    # bull 应为1
    assert target["bull"] == 1, f"bull 应为1，实际为{target['bull']}"
    # group_details 中的消息数应为1
    total_msgs = sum(len(gd["messages"]) for gd in target["group_details"])
    assert total_msgs == 1, f"消息详情应只有1条，实际{total_msgs}条"


def test_compute_snapshot_dedups_duplicate_messages():
    """同一群中重复返回的同一条消息（相同内容+时间、不同 message_id）只计一次"""
    cfg = {
        "sectors": {},
        "sentiments": {"看多": ["买点"]},
        "actions": {}
    }
    text = (
        "[广和通](https://wap.eastmoney.com/quote/stock/0.300638.html)出现突破买点结构，看好"
    )
    base = {
        "create_time": "2026-08-08 10:47",
        "content": text,
        "_analysis": collector.analyze_text(text, cfg),
    }
    # 飞书分页把同一条消息返回了 3 次（带不同 message_id），内容与时间完全相同
    all_analyzed = {
        "test_group": [
            {**base, "message_id": "m_1"},
            {**base, "message_id": "m_2"},
            {**base, "message_id": "m_3"},
        ]
    }
    snapshot = collector.compute_snapshot(all_analyzed, "2026-08-08 10:47", cfg)

    target = next((s for s in snapshot["top10_stocks"] if s["code"] == "300638"), None)
    assert target is not None, "快照中应包含广和通"
    assert target["mention_count"] == 1, (
        f"重复消息应只计一次，实际 {target['mention_count']}"
    )
    assert target["bull"] == 1, f"看多应只计 1，实际 {target['bull']}"
    assert snapshot["total_messages"] == 1, (
        f"总消息数应为 1，实际 {snapshot['total_messages']}"
    )


def test_push_to_cloud_reports_ok_and_failed(tmp_path):
    """push_to_cloud 要回报每个端点的成败，供采集脚本打健康行。"""
    (tmp_path / "latest.json").write_text("{}", encoding="utf-8")
    (tmp_path / "day_2026-09-13.json").write_text("{}", encoding="utf-8")
    cfg = {
        "server": {"data_dir": str(tmp_path)},
        "cloud": {"enabled": True, "base_url": "http://example.invalid", "push_mode": "both"},
    }

    def fake_post(cfg, path, payload, label="", timeout=None):
        return label == "latest"

    with patch("backend.collector.post_to_cloud", side_effect=fake_post):
        summary = collector.push_to_cloud(cfg, "2026-09-13", tmp_path)

    assert summary["ok"] == ["latest"]
    assert summary["failed"] == ["day_2026-09-13"]
    assert summary["skipped"] == []


def test_push_to_cloud_disabled_reports_skipped(tmp_path):
    cfg = {"server": {"data_dir": str(tmp_path)}, "cloud": {"enabled": False}}

    summary = collector.push_to_cloud(cfg, "2026-09-13", tmp_path)

    assert summary["ok"] == [] and summary["failed"] == []
    assert summary["skipped"]


def test_collect_script_health_line_labels_cumulative_and_cloud_skip(capsys):
    """健康行要诚实：消息数是「今日累计」，云端禁用要有「跳过」而不是 ok0 fail0。"""
    import scripts.collect as sc

    def fake_collect(cfg, data_dir, stats=None):
        stats.update({"fetched": 10, "written": 10, "skipped_no_id": 0, "skipped_dup": 0})
        return {"time": "2026-09-13 10:00", "total_messages": 42, "active_groups": 7,
                "overall_sentiment": "偏多", "top10_stocks": [], "top8_sectors": [],
                "action_summary": {}, "sentiment_detail": {}}

    with patch.object(sc, "collect_live", fake_collect), \
         patch.object(sc, "push_to_cloud",
                      lambda *a, **k: {"ok": [], "failed": [], "skipped": ["cloud"]}):
        sc.main()

    out = capsys.readouterr().out
    assert "今日累计" in out
    assert "跳过1" in out, "云端禁用必须能一眼区别于推送失败"
