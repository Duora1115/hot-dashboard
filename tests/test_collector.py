"""测试 collector 模块的消息去重逻辑"""
import json
import tempfile
from pathlib import Path
from unittest.mock import patch, MagicMock
from backend import collector


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
                        {"message_id": "msg_a", "create_time": "2026-07-26 10:00", "content": "消息A"},
                        {"message_id": "msg_b", "create_time": "2026-07-26 10:01", "content": "消息B"},
                    ],
                    "has_more": True,
                    "page_token": "page2"
                }
            },
            # 第二页（包含重复的msg_b）
            {
                "data": {
                    "messages": [
                        {"message_id": "msg_b", "create_time": "2026-07-26 10:01", "content": "消息B"},  # 重复
                        {"message_id": "msg_c", "create_time": "2026-07-26 10:02", "content": "消息C"},
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
    """测试已缓存的消息不会重复返回"""
    with tempfile.TemporaryDirectory() as tmpdir:
        data_dir = Path(tmpdir)

        # 先写入缓存，模拟之前已经抓取过msg_a
        cache_file = data_dir / "msg_cache.json"
        cache_data = {
            "test_chat": {
                "msg_a": {"message_id": "msg_a", "create_time": "2026-07-26 10:00", "content": "消息A"}
            }
        }
        collector.save_cache(data_dir, cache_data)

        # 模拟API返回：msg_a（已在缓存中）、msg_b（新消息）
        mock_response = {
            "data": {
                "messages": [
                    {"message_id": "msg_a", "create_time": "2026-07-26 10:00", "content": "消息A"},
                    {"message_id": "msg_b", "create_time": "2026-07-26 10:01", "content": "消息B"},
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

        # 验证：msg_a已经在缓存中，不应该再次返回
        msg_ids = [m.get("message_id") for m in msgs]
        assert "msg_a" not in msg_ids, "已缓存的消息不应该再次返回"

        # 验证：只返回新消息msg_b
        assert len(msgs) == 1, f"期望1条新消息，实际返回{len(msgs)}条"
        assert msgs[0]["message_id"] == "msg_b"
