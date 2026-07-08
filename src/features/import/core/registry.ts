import type { DetectResult, ImportAdapter, ImportFileContext } from './types';

/** detectAll 的单个候选结果 */
export interface DetectionCandidate extends DetectResult {
  adapter: ImportAdapter;
}

export interface AdapterRegistry {
  register(adapter: ImportAdapter): void;
  getAll(): ImportAdapter[];
  get(id: string): ImportAdapter | undefined;
  /**
   * 并发探测全部适配器，按 confidence 降序返回 confidence > 0 的候选。
   * 单个适配器 detect 抛错时忽略该适配器（不影响其余候选）。
   */
  detectAll(ctx: ImportFileContext): Promise<DetectionCandidate[]>;
}

export function createRegistry(): AdapterRegistry {
  const adapters = new Map<string, ImportAdapter>();
  return {
    register(adapter) {
      if (adapters.has(adapter.id)) {
        throw new Error(`适配器 id 重复注册：${adapter.id}`);
      }
      adapters.set(adapter.id, adapter);
    },
    getAll() {
      return [...adapters.values()];
    },
    get(id) {
      return adapters.get(id);
    },
    async detectAll(ctx) {
      const results = await Promise.all(
        [...adapters.values()].map(async (adapter): Promise<DetectionCandidate | null> => {
          try {
            const result = await adapter.detect(ctx);
            return result.confidence > 0 ? { adapter, ...result } : null;
          } catch {
            return null; // 单个适配器探测失败不影响整体
          }
        }),
      );
      return results
        .filter((r): r is DetectionCandidate => r !== null)
        .sort((a, b) => b.confidence - a.confidence);
    },
  };
}
