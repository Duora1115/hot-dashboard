// 把一天内的多个快照合并成一个"日视图"快照。
// 快照语义是累计的，但任意单个快照可能为空或异常（采集抖动、去重回归等），
// 所以用"按代码/名称并集 + 取最大指标"的方式聚合，保证全天出现的股票/板块都不会丢。
import type { Snapshot, StockItem, SectorItem } from '@/types/api';

function mergeStocks(snapshots: Snapshot[]): StockItem[] {
  const map = new Map<string, StockItem>();
  for (const snap of snapshots) {
    for (const stk of snap.stk ?? []) {
      const cur = map.get(stk.c);
      if (!cur) {
        map.set(stk.c, { ...stk, sec: [...(stk.sec ?? [])] });
        continue;
      }
      cur.sc = Math.max(cur.sc, stk.sc);
      cur.mc = Math.max(cur.mc, stk.mc);
      cur.gc = Math.max(cur.gc, stk.gc);
      cur.ac = Math.max(cur.ac, stk.ac);
      cur.bu = Math.max(cur.bu, stk.bu);
      cur.be = Math.max(cur.be, stk.be);
      if (stk.ft && (!cur.ft || stk.ft < cur.ft)) cur.ft = stk.ft;
      if (stk.lt && stk.lt > cur.lt) cur.lt = stk.lt;
      cur.sec = Array.from(new Set([...(cur.sec ?? []), ...(stk.sec ?? [])]));
    }
  }
  return Array.from(map.values())
    .sort((a, b) => b.sc - a.sc || b.mc - a.mc)
    .slice(0, 10);
}

function mergeSectors(snapshots: Snapshot[]): SectorItem[] {
  const map = new Map<string, SectorItem>();
  for (const snap of snapshots) {
    for (const sec of snap.sec ?? []) {
      const cur = map.get(sec.n);
      if (!cur) {
        map.set(sec.n, { ...sec, gd: sec.gd ? [...sec.gd] : undefined });
        continue;
      }
      cur.sc = Math.max(cur.sc, sec.sc);
      cur.mc = Math.max(cur.mc, sec.mc);
      cur.gc = Math.max(cur.gc, sec.gc);
      // 保留热度最高那次快照的样本文本和群详情
      if (sec.txt && sec.sc >= cur.sc) {
        cur.txt = sec.txt;
        if (sec.gd) cur.gd = sec.gd;
      }
    }
  }
  return Array.from(map.values())
    .sort((a, b) => b.sc - a.sc)
    .slice(0, 8);
}

export function aggregateSnapshots(snapshots: Snapshot[]): Snapshot | null {
  const list = snapshots.filter((s) => s && Array.isArray(s.stk));
  if (list.length === 0) return null;

  let msg = 0;
  let grp = 0;
  const sd = { bu: 0, be: 0, ne: 0, eh: 0, el: 0 };
  const act: Record<string, number> = {};
  let lastWithData: Snapshot | null = null;

  for (const snap of list) {
    if ((snap.msg ?? 0) > msg) msg = snap.msg;
    if ((snap.grp ?? 0) > grp) grp = snap.grp;
    const s = snap.sd;
    if (s) {
      sd.bu = Math.max(sd.bu, s.bu ?? 0);
      sd.be = Math.max(sd.be, s.be ?? 0);
      sd.ne = Math.max(sd.ne, s.ne ?? 0);
      sd.eh = Math.max(sd.eh, s.eh ?? 0);
      sd.el = Math.max(sd.el, s.el ?? 0);
    }
    for (const [k, v] of Object.entries(snap.act ?? {})) {
      if (v > (act[k] ?? 0)) act[k] = v;
    }
    if ((snap.msg ?? 0) > 0) lastWithData = snap;
  }

  // 时间/情绪取最后一条有数据的快照（避免最后一条为空时展示空状态）
  const t = lastWithData?.t ?? list[list.length - 1].t;
  const sent = lastWithData?.sent ?? list[list.length - 1].sent ?? '观望为主';

  return { t, msg, grp, sent, sd, act, stk: mergeStocks(list), sec: mergeSectors(list) };
}
