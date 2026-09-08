"""归因污染修复的单元测试（就近归因 / 关键词清理）"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from backend import collector


def test_settings_attribution_block():
    cfg = collector.load_config()
    assert cfg["attribution"]["window_chars"] == 30
    assert "农业" in cfg["attribution"]["ignore_link_texts"]


def test_settings_high_risk_keywords_cleaned():
    cfg = collector.load_config()
    bank = cfg["sectors"]["银行"]
    assert "红利" not in bank
    assert "高股息" not in bank
    assert "不良" not in bank
    # 移出的词被新板块承接
    assert "红利" in cfg["sectors"]["高股息"]
    assert "高股息" in cfg["sectors"]["高股息"]
    # 其余高危词
    assert "华为" not in cfg["sectors"]["AI算力"]
    assert "推理" not in cfg["sectors"]["AI算力"]
    assert "训练" not in cfg["sectors"]["AI算力"]
    assert "牛市" not in cfg["sectors"]["券商"]
