jest.mock('@/db/settings', () => ({
  getSetting: jest.fn(),
  getSettingSync: jest.fn(),
  setSetting: jest.fn(),
}));

import { fetchLiveRates, isStale } from '../repository';

/** 构造 fetch Response 的最小桩（避免依赖 Node 的 Response 全局）。 */
function res(body: string, status = 200) {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => body,
    json: async () => JSON.parse(body),
  };
}

describe('currency/repository', () => {
  describe('isStale', () => {
    it('null 视作陈旧', () => {
      expect(isStale(null)).toBe(true);
    });
    it('fetchedAt 缺失视作陈旧', () => {
      expect(isStale({ fetchedAt: null })).toBe(true);
    });
    it('近期未过期', () => {
      expect(isStale({ fetchedAt: Date.now() - 60_000 })).toBe(false);
    });
    it('超过 24h 视作陈旧', () => {
      expect(isStale({ fetchedAt: Date.now() - 25 * 3600_000 })).toBe(true);
    });
  });

  describe('fetchLiveRates（多源链）', () => {
    const realFetch = global.fetch;
    afterEach(() => {
      global.fetch = realFetch;
    });

    function byUrl(
      routes: { match: RegExp; body: string; status?: number }[],
    ): typeof fetch {
      return (async (url) => {
        const u = url.toString();
        for (const r of routes) {
          if (r.match.test(u)) return res(r.body, r.status ?? 200) as unknown as Response;
        }
        return res('', 404) as unknown as Response;
      }) as typeof fetch;
    }

    it('open.er-api：rates 取倒数得 rateToCNY', async () => {
      global.fetch = byUrl([
        { match: /er-api/, body: JSON.stringify({ rates: { USD: 0.14, EUR: 0.13 } }) },
      ]);
      const r = await fetchLiveRates();
      expect(r.USD).toBeCloseTo(1 / 0.14, 5);
      expect(r.EUR).toBeCloseTo(1 / 0.13, 5);
    });

    it('新浪优先：中行折算价 ÷100，且不触达境外源', async () => {
      let erCalled = false;
      global.fetch = (async (url) => {
        const u = url.toString();
        if (/sinajs/.test(u)) {
          return res(
            'var hq_str_USDCNY="美元,712.41,712.41,718.85,718.85,715.99,718.85,718.85,2024-01-01,10:00:00";',
          ) as unknown as Response;
        }
        if (/er-api/.test(u)) {
          erCalled = true;
          return res('{}') as unknown as Response;
        }
        return res('', 404) as unknown as Response;
      }) as typeof fetch;
      const r = await fetchLiveRates();
      expect(erCalled).toBe(false);
      expect(r.USD).toBeCloseTo(7.1599, 4);
    });

    it('链式回落：sina 空结果 → 腾讯成功', async () => {
      let sinaCalled = false;
      let qqCalled = false;
      global.fetch = (async (url) => {
        const u = url.toString();
        if (/sinajs/.test(u)) {
          sinaCalled = true;
          return res('var hq_str_USDCNY="";') as unknown as Response;
        }
        if (/qt\.gtimg/.test(u)) {
          qqCalled = true;
          return res('v_fx_susdcny="7.20,7.21,xxx";') as unknown as Response;
        }
        return res('', 404) as unknown as Response;
      }) as typeof fetch;
      const r = await fetchLiveRates();
      expect(sinaCalled).toBe(true);
      expect(qqCalled).toBe(true);
      expect(r.USD).toBeCloseTo(7.205, 3); // (7.20 + 7.21) / 2
    });

    it('全部源失败时抛错', async () => {
      global.fetch = byUrl([{ match: /.*/, body: '', status: 500 }]);
      await expect(fetchLiveRates()).rejects.toThrow(/汇率源/);
    });
  });
});
