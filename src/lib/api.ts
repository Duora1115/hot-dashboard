import type {
  ApiStatus,
  DateInfo,
  Snapshot,
  DayData,
  StockMessagesResponse,
  MarketIndex,
  AdvanceDecline,
  ReportData,
  SentimentTimelineItem,
  ExtremeStats,
  DailyReport,
} from '@/types/api';

const API_BASE = '';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    cache: 'default',  // 让浏览器自动处理 Cache-Control 和 ETag/304
    ...options,
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

// GET /api/status
export async function fetchStatus(): Promise<ApiStatus> {
  return fetchJson<ApiStatus>('/api/status');
}

// GET /api/dates
export async function fetchDates(): Promise<DateInfo[]> {
  return fetchJson<DateInfo[]>('/api/dates');
}

// GET /api/latest
export async function fetchLatest(): Promise<Snapshot> {
  return fetchJson<Snapshot>('/api/latest');
}

// GET /api/day/{date}
export async function fetchDay(date: string): Promise<DayData> {
  return fetchJson<DayData>(`/api/day/${date}`);
}

// GET /api/day/{date}/meta
export async function fetchDayMeta(date: string): Promise<DayData['meta']> {
  return fetchJson<DayData['meta']>(`/api/day/${date}/meta`);
}

// GET /api/day/{date}/snapshots?start={start}&count={count}
export async function fetchDaySnapshots(
  date: string,
  start?: number,
  count?: number,
): Promise<Snapshot[]> {
  const params = new URLSearchParams();
  if (start !== undefined) params.append('start', String(start));
  if (count !== undefined) params.append('count', String(count));
  const qs = params.toString();
  return fetchJson<Snapshot[]>(`/api/day/${date}/snapshots${qs ? `?${qs}` : ''}`);
}

// GET /api/stock-messages/{date}?code={code}&time={time}
export async function fetchStockMessages(
  date: string,
  code: string,
  time?: string,
): Promise<StockMessagesResponse> {
  const params = new URLSearchParams();
  params.append('code', code);
  if (time) params.append('time', time);
  return fetchJson<StockMessagesResponse>(`/api/stock-messages/${date}?${params.toString()}`);
}

// POST /api/collect
export async function triggerCollect(): Promise<{ success: boolean }> {
  return fetchJson<{ success: boolean }>('/api/collect', { method: 'POST' });
}

// POST /api/replay/{date}
export async function triggerReplay(date: string): Promise<{ success: boolean }> {
  return fetchJson<{ success: boolean }>(`/api/replay/${date}`, { method: 'POST' });
}

// GET /api/market/indices
export async function fetchMarketIndices(): Promise<MarketIndex[]> {
  return fetchJson<MarketIndex[]>('/api/market/indices');
}

// GET /api/market/advance-decline
export async function fetchAdvanceDecline(): Promise<AdvanceDecline | null> {
  return fetchJson<AdvanceDecline | null>('/api/market/advance-decline');
}

// GET /api/report/{date}
export async function fetchReport(date: string): Promise<ReportData> {
  return fetchJson<ReportData>(`/api/report/${date}`);
}

// GET /api/day/{date}/sentiment-timeline
export async function fetchSentimentTimeline(date: string): Promise<SentimentTimelineItem[]> {
  return fetchJson<SentimentTimelineItem[]>(`/api/day/${date}/sentiment-timeline`);
}

// GET /api/day/{date}/extreme-stats
export async function fetchExtremeStats(date: string): Promise<ExtremeStats> {
  return fetchJson<ExtremeStats>(`/api/day/${date}/extreme-stats`);
}

// GET /api/daily-report/{date}
export async function fetchDailyReport(date: string): Promise<DailyReport | null> {
  try {
    return await fetchJson<DailyReport>(`/api/daily-report/${date}`);
  } catch {
    return null;
  }
}
