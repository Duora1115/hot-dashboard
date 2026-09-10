import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchPalaceMeta } from './api';

/** 200 响应桩：只需 fetchJson 用到的 ok / json 两个字段。 */
function okJson(body: unknown) {
  return { ok: true, json: async () => body } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchPalaceMeta', () => {
  it('索引缺失（200 + 空 coverage）时补齐所有字段', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okJson({ generated_at: '', coverage: {} })));

    const meta = await fetchPalaceMeta();

    expect(meta.generated_at).toBe('');
    expect(meta.coverage.from).toBe('');
    expect(meta.coverage.to).toBe('');
    expect(meta.coverage.groups).toBe(0);
    expect(Array.isArray(meta.coverage.missing_days)).toBe(true);
    expect(meta.coverage.missing_days).toEqual([]);
  });

  it('网络失败时返回同样完整的空结构', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('network down');
    }));

    const meta = await fetchPalaceMeta();

    expect(meta.generated_at).toBe('');
    expect(meta.coverage.from).toBe('');
    expect(meta.coverage.to).toBe('');
    expect(meta.coverage.groups).toBe(0);
    expect(meta.coverage.missing_days).toEqual([]);
  });
});
