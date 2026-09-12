import { readableText } from './palace';

const EDIT_HEADER = /^\s*\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?\s*(?:\[编辑\])?\s*$/gm;
const LECTURER_PREFIX = /^\s*【[^】]{1,6}】\s*\S{0,20}?\s*\d{4}\s+\d{2}\s+\d{2}\s+\d{2}:\d{2}:\d{2}\s*/;
const HEADING = /^\s*#{1,6}\s+/gm;
// 用 [^\n)]* 而非 [^)]*：后者会匹配换行，把后面几行正文一起吞掉。
const TRUNCATED_MD_LINK = /\[([^\]]+)\]\([^\n)]*$/gm;
const TRUNCATED_BARE_URL = /\[https?:\/\/[^\]\s]{0,200}$/gim;

/**
 * 群消息正文的展示层清洗。规则与后端 `backend/textclean.py` 一一对应，
 * 两边各有一份测试、用例同表。
 *
 * **顺序有讲究**：两条截断链接规则必须排在最后。`[编辑]` 这种方括号记号会被
 * 「截断链接」误吃掉（它没有圆括号，旧规则用可选的 `\(` 就把它当成链接了），
 * 先剥元数据行才能保住识别。
 *
 * **只用于展示**，不改存量落盘数据。
 */
export function cleanMessageText(text: string): string {
  if (!text) return '';
  let out = readableText(text);                     // 先折完整链接与图片
  out = out.replace(EDIT_HEADER, '');
  out = out.replace(LECTURER_PREFIX, '');
  out = out.replace(HEADING, '');
  out = out.replace(TRUNCATED_MD_LINK, '$1');
  out = out.replace(TRUNCATED_BARE_URL, '');
  return out
    .replace(/[ \t　]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

export interface DurableMessage {
  ts: string;
  group: string;
  text: string;
  id?: string;
}

/**
 * 只留中文骨架：去掉拉丁字母片段、空白与标点。
 *
 * 拼音替代把「封」写成 `feng`，直接比字符会因为长度差 3 被判成不相似；
 * 剥掉拉丁片段后两条的骨架高度重合（`中百封死` vs `中百死`）。
 */
function skeleton(text: string): string {
  return text.replace(/[a-zA-Z]+/g, '').replace(/[\s\p{P}\p{S}]/gu, '');
}

/** 拼音替代版的特征：连续的 2 个以上拉丁字母片段。 */
function latinRuns(text: string): number {
  return (text.match(/[a-zA-Z]{2,}/g) ?? []).length;
}

/**
 * 最长公共子序列比 `2*LCS/(len1+len2)`。
 *
 * 必须用 LCS 而不是逐位比较：`中百买了次日…` vs `中百买le次日…` 剥掉 `le` 之后
 * 整段是错位的，逐位比只有 3/9，LCS 有 0.95。串很短（≤120 字符），O(n·m) 足够。
 */
function similarity(a: string, b: string): number {
  const s1 = skeleton(a);
  const s2 = skeleton(b);
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1;
  const dp: number[] = new Array(s2.length + 1).fill(0);
  for (let i = 1; i <= s1.length; i++) {
    let prev = 0;
    for (let j = 1; j <= s2.length; j++) {
      const tmp = dp[j];
      dp[j] = s1[i - 1] === s2[j - 1] ? prev + 1 : Math.max(dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return (2 * dp[s2.length]) / (s1.length + s2.length);
}

/**
 * 同群 + 同时间戳 + 文本近似 → 只保留「中文占优」的那条。
 *
 * 群里为了过审会把同一句话再发一遍拼音版（`中百feng死` / `中百封死`），
 * 两条都落库、时间戳还一样，历史讨论里就并排出现两遍。
 * 后端现有去重按精确文本比对，抓不到这种。
 *
 * 阈值定在 0.8，实测：`中百封死`/`中百feng死` = 0.86 判重；
 * `中百封死`/`科技拉完中百秒板` = 0.33 不判重（同秒的不同消息不该被吞）。
 */
export function dedupeNearDuplicates<T extends DurableMessage>(
  items: T[],
  threshold = 0.8,
): T[] {
  const out: T[] = [];
  for (const item of items) {
    const dup = out.find(
      (kept) =>
        kept.ts === item.ts &&
        kept.group === item.group &&
        similarity(kept.text, item.text) >= threshold,
    );
    if (!dup) {
      out.push(item);
      continue;
    }
    // 拼音版多几个拉丁字母片段 —— 留下更「中文」的那条
    if (latinRuns(item.text) < latinRuns(dup.text)) {
      out[out.indexOf(dup)] = item;
    }
  }
  return out;
}
