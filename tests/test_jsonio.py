"""测试 jsonio 的原子写功能"""
import os
from backend.jsonio import dump_path, load_path, HAS_ORJSON


def test_dump_path_creates_file(tmp_path):
    p = tmp_path / "test.json"
    dump_path({"a": 1, "b": [1, 2, 3]}, p)
    assert p.exists()
    assert load_path(p) == {"a": 1, "b": [1, 2, 3]}


def test_dump_path_no_temp_leftover(tmp_path):
    """原子写不应留下 .tmp 残留文件"""
    p = tmp_path / "test.json"
    dump_path({"x": "y"}, p)
    leftovers = list(tmp_path.glob("*.tmp"))
    assert leftovers == [], f"发现残留临时文件: {leftovers}"


def test_dump_path_overwrites_existing(tmp_path):
    """重复写应正确覆盖旧内容"""
    p = tmp_path / "test.json"
    dump_path({"v": 1}, p)
    dump_path({"v": 2}, p)
    assert load_path(p) == {"v": 2}


def test_dump_path_nested_dir(tmp_path):
    """目标目录不存在时应自动创建"""
    p = tmp_path / "a" / "b" / "c" / "test.json"
    dump_path({"nested": True}, p)
    assert load_path(p) == {"nested": True}
