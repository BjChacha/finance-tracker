import { createRegistry } from '../core/registry';
import { boheCsvAdapter } from './bohe-csv';
import { genericCsvAdapter } from './generic-csv';

/**
 * 全局适配器注册表。
 *
 * 新增第三方账单适配器：在本目录添加 1 个实现 ImportAdapter 的文件，
 * 然后在下方注册 1 行即可被向导自动发现（detect 按 confidence 排序）。
 */
export const adapterRegistry = createRegistry();

adapterRegistry.register(boheCsvAdapter);
adapterRegistry.register(genericCsvAdapter);
// 第三方适配器在此注册（一行一个），例如：
// adapterRegistry.register(alipayCsvAdapter);
// adapterRegistry.register(wechatBillAdapter);
