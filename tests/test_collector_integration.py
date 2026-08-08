"""集成测试：验证整个消息处理流程不会产生重复"""
import json
import tempfile
from datetime import datetime
from pathlib import Path
from unittest.mock import patch, MagicMock
from backend import collector

# 用动态日期，避免 fetch_messages_incremental 的时间过滤导致测试失效
_TODAY = datetime.now().strftime("%Y-%m-%d")


def test_end_to_end_no_duplicate_messages():
    """端到端测试：从采集到快照计算，验证不会产生重复消息"""
    with tempfile.TemporaryDirectory() as tmpdir:
        data_dir = Path(tmpdir)

        # 模拟真实的飞书消息场景：
        # 同一个群的消息在分页中被重复返回
        mock_responses = [
            # 第一页：包含目标消息
            {
                "data": {
                    "messages": [
                        {
                            "message_id": "msg_dup_1",
                            "create_time": f"{_TODAY} 11:37",
                            "content": "【DW电子】国产算力周思考\n\n本周超节点经历大热...",
                            "msg_type": "text"
                        },
                        {
                            "message_id": "msg_other",
                            "create_time": f"{_TODAY} 11:30",
                            "content": "其他消息",
                            "msg_type": "text"
                        }
                    ],
                    "has_more": True,
                    "page_token": "page2"
                }
            },
            # 第二页：又返回了同一条消息（真实场景中的API行为）
            {
                "data": {
                    "messages": [
                        {
                            "message_id": "msg_dup_1",  # 重复！
                            "create_time": f"{_TODAY} 11:37",
                            "content": "【DW电子】国产算力周思考\n\n本周超节点经历大热...",
                            "msg_type": "text"
                        },
                        {
                            "message_id": "msg_dup_2",  # 又一条重复
                            "create_time": f"{_TODAY} 11:37",
                            "content": "【DW电子】国产算力周思考\n\n本周超节点经历大热...",
                            "msg_type": "text"
                        }
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

        # 模拟配置
        cfg = {
            "sectors": {"科技": ["算力", "超节点"]},
            "sentiments": {"看多": ["推荐", "看好"]},
            "actions": {"买入": ["推荐"]}
        }

        with patch("subprocess.run", side_effect=mock_run):
            # Step 1: 增量抓取
            msgs = collector.fetch_messages_incremental("test_chat", data_dir, max_pages=3)

            # 验证1：返回的消息不应该有重复
            msg_ids = [m.get("message_id") for m in msgs]
            assert len(msg_ids) == len(set(msg_ids)), f"增量抓取产生重复消息: {msg_ids}"

            # Step 2: 分析消息
            for m in msgs:
                text = m.get("content", "")
                if text and "_analysis" not in m:
                    m["_analysis"] = collector.analyze_text(text, cfg)

            # Step 3: 构建快照
            all_analyzed = {"test_group": msgs}
            snapshot = collector.compute_snapshot(all_analyzed, f"{_TODAY} 11:37", cfg)

            # 验证2：快照中的消息不应该有重复
            for stock in snapshot.get("top10_stocks", []):
                for group_detail in stock.get("group_details", []):
                    messages = group_detail.get("messages", [])
                    # 检查是否有重复的消息内容
                    msg_texts = [m.get("text") for m in messages]
                    # 允许相同内容的消息（如果它们确实是不同的消息ID）
                    # 但同一个message_id不应该出现多次
                    assert len(msg_texts) == len(set(msg_texts)), \
                        f"股票 {stock['code']} 的群消息有重复: {msg_texts}"

            # 验证3：特定股票的消息数量应该是正确的
            # 找到包含"688702"的股票
            target_stock = None
            for stock in snapshot.get("top10_stocks", []):
                if "688702" in stock.get("code", ""):
                    target_stock = stock
                    break

            if target_stock:
                total_messages = sum(
                    len(gd.get("messages", []))
                    for gd in target_stock.get("group_details", [])
                )
                # 由于我们去重了，实际消息数应该小于等于3（原始返回的消息数）
                # 而不是4或更多（如果有重复）
                assert total_messages <= 3, \
                    f"股票688702的消息数异常: {total_messages}（可能有重复）"


def test_real_world_scenario():
    """测试真实场景：多次调用增量抓取不会产生累积重复"""
    with tempfile.TemporaryDirectory() as tmpdir:
        data_dir = Path(tmpdir)

        # 第一次调用：返回消息A、B
        first_call_response = {
            "data": {
                "messages": [
                    {"message_id": "msg_a", "create_time": f"{_TODAY} 10:00", "content": "消息A"},
                    {"message_id": "msg_b", "create_time": f"{_TODAY} 10:01", "content": "消息B"},
                ],
                "has_more": False,
                "page_token": None
            }
        }

        # 第二次调用：返回消息B（重复）、C
        second_call_response = {
            "data": {
                "messages": [
                    {"message_id": "msg_b", "create_time": f"{_TODAY} 10:01", "content": "消息B"},
                    {"message_id": "msg_c", "create_time": f"{_TODAY} 10:02", "content": "消息C"},
                ],
                "has_more": False,
                "page_token": None
            }
        }

        call_count = [0]

        def mock_run(cmd, capture_output, text, timeout):
            result = MagicMock()
            result.returncode = 0
            if call_count[0] == 0:
                result.stdout = json.dumps(first_call_response)
            else:
                result.stdout = json.dumps(second_call_response)
            call_count[0] += 1
            return result

        with patch("subprocess.run", side_effect=mock_run):
            # 第一次抓取
            msgs1 = collector.fetch_messages_incremental("test_chat", data_dir, max_pages=3)
            ids1 = [m.get("message_id") for m in msgs1]

            # 第二次抓取（应该只返回新消息C）
            msgs2 = collector.fetch_messages_incremental("test_chat", data_dir, max_pages=3)
            ids2 = [m.get("message_id") for m in msgs2]

        # 验证：第一次返回A、B
        assert set(ids1) == {"msg_a", "msg_b"}, f"第一次抓取异常: {ids1}"

        # 验证：第二次只返回C（B已在缓存中）
        assert set(ids2) == {"msg_c"}, f"第二次抓取应该只返回新消息，实际: {ids2}"

        # 验证：两次抓取的消息合并后不应该有重复
        all_ids = ids1 + ids2
        assert len(all_ids) == len(set(all_ids)), f"累积抓取产生重复: {all_ids}"
