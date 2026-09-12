"""消息正文清洗：采集元数据前缀 + markdown 残留。用例取自线上真实数据。"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.textclean import clean_message_text, news_title_summary


def test_folds_complete_markdown_link():
    assert clean_message_text("看[中百](https://wap.eastmoney.com/quote/stock/1.600857.html)封死") \
        == "看中百封死"


def test_folds_image_to_placeholder():
    assert clean_message_text("图![Image](img_v3_abc)完了") == "图[图片]完了"


def test_strips_feishu_edit_header():
    raw = "2026-08-06 18:24:42 [编辑]\n \n缺成这雕样了。\n"
    assert clean_message_text(raw) == "缺成这雕样了。"


def test_strips_lecturer_timestamp_prefix():
    raw = "【讲师】 胖大叔 2026 09 10 23:50:19 2026年9月10日周四复盘 今日兑现了亚盛集团"
    assert clean_message_text(raw).startswith("2026年9月10日周四复盘")


def test_strips_markdown_heading_marker():
    assert clean_message_text("### 橙子不糊涂的科技花园") == "橙子不糊涂的科技花园"


def test_strips_truncated_link_keeps_visible_text():
    """截断的链接（没有右括号）也要折掉，只留显示文字。"""
    assert clean_message_text("看[中百](https://wap.eastmoney.com/quote") == "看中百"


def test_truncated_link_whose_text_is_a_url_is_dropped():
    """显示文字本身就是 URL 时整段丢 —— 留着就是一串没用的地址。"""
    assert clean_message_text("### 橙子不糊涂的科技花园[https://wap.eastmoney.") \
        == "橙子不糊涂的科技花园"


def test_truncated_link_does_not_swallow_following_lines():
    """截断链接的 ``[^)]*`` 会匹配换行，把后面几行正文一起吃掉 —— 那是内容丢失。"""
    raw = "看[中百](https://wap.eastmoney.com/quote\n明天再说，这票还有戏\n第三行"
    assert clean_message_text(raw) == "看中百\n明天再说，这票还有戏\n第三行"


def test_keeps_plain_text_untouched():
    assert clean_message_text("中百这个拉板的话新华还有救") == "中百这个拉板的话新华还有救"


def test_news_title_is_first_line_and_summary_is_the_rest():
    text = "累死了，每个馆都至少足球场那么大\n白天全靠东鹏特饮续命，晚上补了一顿牛肉火锅。"
    title, summary = news_title_summary(text)
    assert title == "累死了，每个馆都至少足球场那么大"
    assert summary.startswith("白天全靠东鹏特饮")
    assert not summary.startswith(title), "摘要不能以标题开头（原来 title=text[:40] summary=text[:80]）"


def test_news_single_line_gives_empty_summary():
    title, summary = news_title_summary("一句话消息")
    assert title == "一句话消息"
    assert summary == ""
