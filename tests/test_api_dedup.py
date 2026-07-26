"""测试 API 端的消息去重逻辑"""
import pytest
from backend.server import _deduplicate_messages


def test_deduplicate_messages_removes_duplicates():
    """测试消息去重函数能够移除重复消息"""
    messages = [
        {"time": "11:37", "text": "消息A"},
        {"time": "11:37", "text": "消息A"},  # 重复
        {"time": "11:38", "text": "消息B"},
        {"time": "11:37", "text": "消息A"},  # 重复
    ]

    result = _deduplicate_messages(messages)

    # 应该只保留2条不同的消息
    assert len(result) == 2
    assert result[0]["time"] == "11:37"
    assert result[0]["text"] == "消息A"
    assert result[1]["time"] == "11:38"
    assert result[1]["text"] == "消息B"


def test_deduplicate_messages_preserves_order():
    """测试消息去重保持原有顺序"""
    messages = [
        {"time": "10:00", "text": "第一条"},
        {"time": "10:01", "text": "第二条"},
        {"time": "10:00", "text": "第一条"},  # 重复
        {"time": "10:02", "text": "第三条"},
    ]

    result = _deduplicate_messages(messages)

    assert len(result) == 3
    assert result[0]["text"] == "第一条"
    assert result[1]["text"] == "第二条"
    assert result[2]["text"] == "第三条"


def test_deduplicate_messages_empty_list():
    """测试空消息列表"""
    result = _deduplicate_messages([])
    assert result == []


def test_deduplicate_messages_no_duplicates():
    """测试没有重复的消息列表"""
    messages = [
        {"time": "10:00", "text": "消息A"},
        {"time": "10:01", "text": "消息B"},
        {"time": "10:02", "text": "消息C"},
    ]

    result = _deduplicate_messages(messages)

    assert len(result) == 3
    assert result == messages
