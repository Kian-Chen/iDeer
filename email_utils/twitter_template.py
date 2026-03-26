from datetime import datetime
from html import escape


def _escape_text(text: str) -> str:
    return escape(str(text or ""), quote=True)


def _escape_with_breaks(text: str) -> str:
    return _escape_text(text).replace("\n", "<br>")


def _shorten(text: str, limit: int) -> str:
    text = str(text or "").strip()
    if len(text) <= limit:
        return text
    return text[: limit - 3].rstrip() + "..."


def _format_count(value: int) -> str:
    try:
        number = int(value or 0)
    except (TypeError, ValueError):
        return "0"
    if number >= 1_000_000:
        return f"{number / 1_000_000:.1f}M".rstrip("0").rstrip(".")
    if number >= 1_000:
        return f"{number / 1_000:.1f}K".rstrip("0").rstrip(".")
    return str(number)


def _metric_chip(label: str, value: int) -> str:
    if not value:
        return ""
    return (
        '<span style="display:inline-flex;align-items:center;padding:4px 10px;'
        'border-radius:999px;background:#f3f4f6;color:#475467;font-size:12px;'
        f'font-weight:600;">{label} {_format_count(value)}</span>'
    )


def _format_created_at(created_at: str) -> str:
    if not created_at:
        return ""
    try:
        dt = datetime.fromisoformat(created_at)
        return dt.astimezone().strftime("%Y-%m-%d %H:%M")
    except ValueError:
        return created_at


def get_category_badge(category: str) -> str:
    """Return a colored badge for tweet category."""
    colors = {
        "观点": ("#7c3aed", "#ede9fe"),
        "新闻": ("#dc2626", "#fef2f2"),
        "讨论": ("#2563eb", "#eff6ff"),
        "分享": ("#059669", "#ecfdf5"),
        "公告": ("#d97706", "#fffbeb"),
        "日常": ("#6b7280", "#f3f4f6"),
    }
    fg, bg = colors.get(category, ("#6b7280", "#f3f4f6"))
    return (
        f'<span style="display:inline-block;padding:2px 10px;border-radius:12px;'
        f'font-size:12px;font-weight:600;color:{fg};background-color:{bg};">'
        f'{category}</span>'
    )


def format_engagement(likes: int, retweets: int, replies: int) -> str:
    """Format engagement metrics as compact chips."""
    parts = [
        _metric_chip("点赞", likes),
        _metric_chip("转发", retweets),
        _metric_chip("回复", replies),
    ]
    return " ".join(part for part in parts if part)


def get_tweet_block_html(
    author_username: str,
    author_name: str,
    rate: str,
    text: str,
    summary: str,
    category: str,
    tweet_url: str,
    likes: int = 0,
    retweets: int = 0,
    replies: int = 0,
    is_retweet: bool = False,
    is_reply: bool = False,
    is_quote: bool = False,
    quoted_text: str = "",
    quoted_author: str = "",
    created_at: str = "",
    key_points: list[str] | None = None,
    score: float = 0.0,
) -> str:
    """Render a single tweet card as an HTML block."""
    type_parts = []
    if is_retweet:
        type_parts.append("转推")
    elif is_reply:
        type_parts.append("回复")
    elif is_quote:
        type_parts.append("引用")
    else:
        type_parts.append("原创")

    author_display = _escape_text(author_name or author_username)
    username_display = _escape_text(author_username)
    created_display = _escape_text(_format_created_at(created_at))
    badge = get_category_badge(category)
    type_badge = (
        '<span style="display:inline-block;padding:2px 10px;border-radius:12px;'
        'font-size:12px;font-weight:600;color:#0f766e;background-color:#ecfeff;">'
        f'{_escape_text(type_parts[0])}</span>'
    )
    score_badge = (
        '<span style="display:inline-block;padding:2px 10px;border-radius:12px;'
        'font-size:12px;font-weight:600;color:#1d4ed8;background-color:#dbeafe;">'
        f'相关度 {score:.1f}/10</span>'
    )

    display_text = _escape_with_breaks(_shorten(text, 240))
    summary_html = _escape_with_breaks(summary)
    engagement = format_engagement(likes, retweets, replies)
    key_points = key_points or []
    key_points_html = ""
    if key_points:
        items = "".join(
            f'<li style="margin:0 0 6px 0;">{_escape_text(point)}</li>'
            for point in key_points[:3]
            if str(point).strip()
        )
        if items:
            key_points_html = (
                '<tr><td style="padding:4px 0 10px 0;">'
                '<div style="font-size:13px;font-weight:700;color:#344054;margin-bottom:8px;">关键要点</div>'
                '<ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.7;color:#475467;">'
                f"{items}</ul></td></tr>"
            )

    quote_block = ""
    if is_quote and quoted_text:
        qt_display = _escape_with_breaks(_shorten(quoted_text, 180))
        quote_block = f"""
    <tr>
        <td style="padding:4px 0 10px 0;">
            <div style="border-left:3px solid #93c5fd;padding:10px 12px;background:#f8fbff;border-radius:8px;">
                <div style="font-size:12px;color:#1d4ed8;font-weight:700;">引用 @{_escape_text(quoted_author)}</div>
                <div style="font-size:13px;color:#475467;line-height:1.6;margin-top:4px;">{qt_display}</div>
            </div>
        </td>
    </tr>"""

    original_block = f"""
    <tr>
        <td style="padding:4px 0 10px 0;">
            <div style="font-size:13px;font-weight:700;color:#344054;margin-bottom:8px;">原文摘录</div>
            <div style="font-size:13px;color:#475467;line-height:1.7;background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:12px 14px;">
                {display_text}
            </div>
        </td>
    </tr>"""

    block_template = f"""
    <table border="0" cellpadding="0" cellspacing="0" width="100%"
           style="font-family:Arial,sans-serif;border:1px solid #dbe7f3;border-radius:16px;padding:18px 18px 14px 18px;background-color:#ffffff;box-shadow:0 10px 28px rgba(15,23,42,0.06);">
    <tr>
        <td style="padding-bottom:8px;">
            <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;">
                <div>
                    <div style="font-size:16px;font-weight:700;color:#0f172a;">{author_display}</div>
                    <div style="font-size:13px;color:#667085;">@{username_display}</div>
                </div>
                <div style="font-size:12px;color:#98a2b3;">{created_display}</div>
            </div>
        </td>
    </tr>
    <tr>
        <td style="padding:0 0 10px 0;">
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
                {type_badge}
                {badge}
                {score_badge}
                <span style="font-size:13px;color:#475467;">{rate}</span>
            </div>
        </td>
    </tr>
    <tr>
        <td style="padding:0 0 12px 0;">
            <div style="font-size:14px;font-weight:700;color:#111827;margin-bottom:8px;">中文摘要</div>
            <div style="font-size:14px;color:#1f2937;line-height:1.8;background:#f5faff;border:1px solid #dbeafe;border-radius:12px;padding:12px 14px;">
                {summary_html}
            </div>
        </td>
    </tr>
    {key_points_html}
    {original_block}
    {quote_block}
    <tr>
        <td style="padding-top:2px;">
            <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;">
                <div style="display:flex;gap:8px;flex-wrap:wrap;">{engagement}</div>
                <a href="{_escape_text(tweet_url)}"
                   style="display:inline-block;text-decoration:none;font-size:13px;font-weight:700;color:#fff;background-color:#1d9bf0;padding:9px 16px;border-radius:999px;">
                   打开原帖
                </a>
            </div>
        </td>
    </tr>
    </table>
"""
    return block_template
