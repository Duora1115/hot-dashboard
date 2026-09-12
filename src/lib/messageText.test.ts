import { describe, expect, it } from 'vitest';
import { cleanMessageText, dedupeNearDuplicates } from './messageText';

describe('cleanMessageText', () => {
  it('折叠完整链接', () => {
    expect(cleanMessageText('看[中百](https://wap.eastmoney.com/quote/stock/1.600857.html)封死'))
      .toBe('看中百封死');
  });

  it('图片折成 [图片]', () => {
    expect(cleanMessageText('图![Image](img_v3_abc)完了')).toBe('图[图片]完了');
  });

  it('剥掉飞书编辑头', () => {
    expect(cleanMessageText('2026-08-06 18:24:42 [编辑]\n \n缺成这雕样了。'))
      .toBe('缺成这雕样了。');
  });

  it('剥掉【讲师】时间戳前缀', () => {
    const raw = '【讲师】 胖大叔 2026 09 10 23:50:19 2026年9月10日周四复盘 今日兑现了亚盛集团';
    expect(cleanMessageText(raw).startsWith('2026年9月10日周四复盘')).toBe(true);
  });

  it('截断的链接只留显示文字', () => {
    expect(cleanMessageText('看[中百](https://wap.eastmoney.com/quote')).toBe('看中百');
  });

  it('剥掉 markdown 标题记号与显示文字是 URL 的截断链接', () => {
    expect(cleanMessageText('### 橙子不糊涂的科技花园[https://wap.eastmoney.'))
      .toBe('橙子不糊涂的科技花园');
  });

  it('纯方括号记号不会被当成截断链接吃掉', () => {
    // 旧规则用可选的 `\(` 匹配，会把 `[编辑]` 折成 `编辑`，元数据行就认不出来了
    expect(cleanMessageText('2026-08-06 18:24:42 [编辑]\n缺成这雕样了。')).toBe('缺成这雕样了。');
  });

  it('普通正文原样保留', () => {
    expect(cleanMessageText('中百这个拉板的话新华还有救')).toBe('中百这个拉板的话新华还有救');
  });
});

describe('dedupeNearDuplicates', () => {
  // 600857 在 2026-09-10 的真实数据：同秒、同群、不同 id，一条拼音一条中文
  const pairs = [
    { ts: '2026-09-10 13:06', group: '006_帝凌枫', text: '中百封死', id: 'a' },
    { ts: '2026-09-10 13:06', group: '006_帝凌枫', text: '中百feng死', id: 'b' },
    { ts: '2026-09-10 11:55', group: '006_帝凌枫', text: '中百买了次日也拿不住', id: 'c' },
    { ts: '2026-09-10 11:55', group: '006_帝凌枫', text: '中百买le次日也拿不住', id: 'd' },
  ];

  it('同秒同群的拼音版被去掉，保留中文那条', () => {
    const out = dedupeNearDuplicates(pairs);
    expect(out.map((m) => m.id)).toEqual(['a', 'c']);
  });

  it('不同群即使同文本也保留', () => {
    const out = dedupeNearDuplicates([
      { ts: '2026-09-10 13:06', group: 'A', text: '中百封死' },
      { ts: '2026-09-10 13:06', group: 'B', text: '中百封死' },
    ]);
    expect(out).toHaveLength(2);
  });

  it('同群但时间不同则保留（真的重复发过）', () => {
    const out = dedupeNearDuplicates([
      { ts: '2026-09-10 09:45', group: 'A', text: '长光华芯进了' },
      { ts: '2026-07-17 09:34', group: 'A', text: '长光华芯进了' },
    ]);
    expect(out).toHaveLength(2);
  });

  it('差异过大的同秒消息都保留', () => {
    const out = dedupeNearDuplicates([
      { ts: '2026-09-10 13:06', group: 'A', text: '中百封死' },
      { ts: '2026-09-10 13:06', group: 'A', text: '科技拉完中百秒板' },
    ]);
    expect(out).toHaveLength(2);
  });
});
