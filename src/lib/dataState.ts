import type { DateInfo, Snapshot } from '@/types/api';

/**
 * 一条快照里到底有没有内容。
 *
 * 原来 `Dashboard.tsx` / `Replay.tsx` 的守卫是 `if (!currentSnapshot)` —— 判的是
 * 「快照对象在不在」。每天 00:00 到首次有效采集之间，当日快照存在但全空，
 * 守卫不成立，页面照常渲染出 4 个 0 统计和空白内容区，没有任何提示。
 */
export function hasContent(snap: Snapshot | null | undefined): boolean {
  if (!snap) return false;
  return (
    (snap.msg ?? 0) > 0 ||
    (snap.grp ?? 0) > 0 ||
    (snap.stk?.length ?? 0) > 0 ||
    (snap.sec?.length ?? 0) > 0
  );
}

/**
 * 一条快照的时间戳是否属于某一天。
 *
 * 快照的 `t` 形如 "2026-07-09 01:30"，日期部分就是前 10 个字符。`refreshData`
 * 在实时模式下拿全局最新快照（今天）去刷新「当前选中日」的视图 —— 用户停在
 * 历史日期时 latest 必然比历史那天末尾的新，若不校验就把它拼进那天的快照数组，
 * 全天聚合会掺进今天的数字，仪表盘随之漂移。
 */
export function isSameDay(
  ts: string | null | undefined,
  date: string | null | undefined,
): boolean {
  if (!ts || !date) return false;
  return ts.slice(0, 10) === date;
}

/**
 * 从倒序的可用日期里挑前 `count` 个「有数据」的日期。
 * 一个都没有时退回原来的前 `count` 个（让页面照常渲染空状态，而不是永远转圈）。
 */
export function pickDefaultDate(dates: DateInfo[], count = 1): string[] {
  const nonEmpty = dates.filter((d) => (d.message_count ?? 0) > 0);
  const source = nonEmpty.length > 0 ? nonEmpty : dates;
  return source.slice(0, count).map((d) => d.date);
}
