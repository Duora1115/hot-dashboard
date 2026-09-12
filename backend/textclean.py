"""群消息正文的展示层清洗。

群里的票几乎都写成 `[旭创](https://wap.eastmoney.com/quote/stock/0.300308.html)`，
一条链接六十多字符；飞书的转发/编辑还会在正文头上塞时间戳与「[编辑]」标记。
这些都不是用户想读的内容。

**只用于展示与晨报生成，不改存量落盘数据。**

规则要与前端 `src/lib/messageText.ts` 保持一致，两边各有一份测试，用例同表。
"""
import re

# `![Image](url)` 必须在普通链接之前处理：它内部含 `[Image](url)`。
_IMAGE_RE = re.compile(r"!\[[^\]]*\]\([^)]*\)")
_LINK_RE = re.compile(r"\[([^\]]+)\]\([^)]*\)")
# 飞书编辑标记：`2026-08-06 18:24:42 [编辑]` 单独成行。
_EDIT_HEADER_RE = re.compile(r"^\s*\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?\s*(?:\[编辑\])?\s*$", re.MULTILINE)
# `【讲师】 胖大叔 2026 09 10 23:50:19` 形态的前缀。
_LECTURER_RE = re.compile(r"^\s*【[^】]{1,6}】\s*\S{0,20}?\s*\d{4}\s+\d{2}\s+\d{2}\s+\d{2}:\d{2}:\d{2}\s*")
_HEADING_RE = re.compile(r"^\s*#{1,6}\s+", re.MULTILINE)
# `[中百](https://…` 截断：有方括号、有左圆括号，但到行尾都没有右圆括号。
_TRUNCATED_MD_LINK = re.compile(r"\[([^\]]+)\]\([^)]*$", re.MULTILINE)
# `[https://…` 连右方括号都没有（发帖端把链接截断了）——整段丢，留着也是一串地址。
_TRUNCATED_BARE_URL = re.compile(r"\[https?://[^\]\s]{0,200}$", re.MULTILINE | re.IGNORECASE)


def clean_message_text(text: str) -> str:
    """折叠链接、剥掉采集元数据与 markdown 记号，返回可直读的正文。

    **顺序有讲究**：两条截断链接规则必须排在最后。`[编辑]` 这种方括号记号会被
    「截断链接」误吃掉，先剥元数据行才能保住识别；反过来写就会把
    `2026-08-06 18:24:42 [编辑]` 变成 `2026-08-06 18:24:42 编辑`。
    """
    if not text:
        return ""
    out = _IMAGE_RE.sub("[图片]", text)
    out = _LINK_RE.sub(r"\1", out)
    out = _EDIT_HEADER_RE.sub("", out)
    out = _LECTURER_RE.sub("", out)
    out = _HEADING_RE.sub("", out)
    out = _TRUNCATED_MD_LINK.sub(r"\1", out)
    out = _TRUNCATED_BARE_URL.sub("", out)
    # 行内空白折叠、去掉因此产生的空行
    out = re.sub(r"[ \t　]+", " ", out)
    out = re.sub(r"\n\s*\n+", "\n", out)
    return out.strip()


def news_title_summary(text: str, title_limit: int = 40, summary_limit: int = 120) -> tuple[str, str]:
    """晨报卡片：标题取正文第一行，摘要取其余部分（不再让摘要以标题开头）。"""
    cleaned = clean_message_text(text)
    if not cleaned:
        return "", ""
    lines = [ln.strip() for ln in cleaned.split("\n") if ln.strip()]
    title = lines[0][:title_limit]
    rest = " ".join(lines[1:]).strip()
    return title, rest[:summary_limit]
