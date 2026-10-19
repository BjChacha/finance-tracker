jest.mock('@/db/settings', () => ({
	getSetting: jest.fn(),
	setSetting: jest.fn(),
}));

// newId 依赖 expo-crypto（jest 环境不可用），桩为确定值以便断言。
jest.mock('@/lib/id', () => ({ newId: jest.fn(() => 'gen-id-1') }));

// 可链式 thenable 桩：drizzle 查询形如 db.select().from().where().limit()，最终 await 得到 rows。
const chainable = (rows: unknown[]) => {
	const chain = {
		from: () => chain,
		where: () => chain,
		limit: () => chain,
		then: (res: (v: unknown[]) => void) => Promise.resolve(rows).then(res),
	};
	return chain;
};

jest.mock('@/db/client', () => ({
	db: {
		select: jest.fn(() => chainable([])),
		insert: jest.fn(),
		update: jest.fn(),
		delete: jest.fn(),
	},
}));

// schema 桩：迁移里 eq/and 用其字段构造条件，但桩 db 的 where() 忽略实参。
jest.mock('@/db/schema', () => ({
	categories: { id: 'id', name: 'name', type: 'type', parentId: 'parent_id', archived: 'archived' },
	transactions: { categoryId: 'category_id' },
	importMappings: {
		id: 'id',
		adapterId: 'adapter_id',
		kind: 'kind',
		sourceLabel: 'source_label',
		targetId: 'target_id',
	},
}));

import { db } from '@/db/client';
import { getSetting, setSetting } from '@/db/settings';
import { newId } from '@/lib/id';
import { migrateCategoryConsolidationOnce } from '../consolidation';

describe('migrateCategoryConsolidationOnce', () => {
	const selectMock = db.select as jest.Mock;
	const insertMock = db.insert as jest.Mock;
	const updateMock = db.update as jest.Mock;
	const deleteMock = db.delete as jest.Mock;
	const getMock = getSetting as jest.Mock;
	const setMock = setSetting as jest.Mock;

	let updateSetMock: jest.Mock;
	let deleteWhereMock: jest.Mock;

	beforeEach(() => {
		jest.clearAllMocks();
		// mockReset 连默认实现一起清；必须立即恢复兜底，
		// 否则 Once 队列耗尽后 select() 返回 undefined，链式 .from() 直接炸。
		selectMock.mockReset().mockImplementation(() => chainable([]));
		insertMock.mockReset();
		updateMock.mockReset();
		deleteMock.mockReset();
		updateSetMock = jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) });
		updateMock.mockReturnValue({ set: updateSetMock });
		deleteWhereMock = jest.fn().mockResolvedValue(undefined);
		deleteMock.mockReturnValue({ where: deleteWhereMock });
		insertMock.mockReturnValue({ values: jest.fn().mockResolvedValue(undefined) });
	});

	it('已迁移（settings key=true）→ 立即返回，不查 db、不再写 settings', async () => {
		getMock.mockResolvedValueOnce(true);

		await migrateCategoryConsolidationOnce();

		expect(selectMock).not.toHaveBeenCalled();
		expect(setMock).not.toHaveBeenCalled();
	});

	it('被并分类不存在 → 跳过全部合并对，仅标记完成', async () => {
		getMock.mockResolvedValueOnce(null);

		await migrateCategoryConsolidationOnce();

		expect(updateSetMock).not.toHaveBeenCalled();
		expect(setMock).toHaveBeenCalledWith('categories.consolidation.v1', true);
	});

	it('正常合并：交易改指向、映射无冲突时改 targetId、归档被并分类', async () => {
		getMock.mockResolvedValueOnce(null);
		// 每对消耗 select：对①漏记支出 from/ensure/mappings、对②网络服务 from/to/mappings、对③漏记收入 from/ensure
		selectMock
			.mockImplementationOnce(() => chainable([{ id: 'c-louji' }]))
			.mockImplementationOnce(() => chainable([{ id: 'c-adjust' }]))
			.mockImplementationOnce(() => chainable([]))
			.mockImplementationOnce(() => chainable([{ id: 'c-net' }]))
			.mockImplementationOnce(() => chainable([{ id: 'c-sub' }]))
			.mockImplementationOnce(() => chainable([]))
			.mockImplementationOnce(() => chainable([{ id: 'c-income' }]))
			.mockImplementationOnce(() => chainable([]));

		await migrateCategoryConsolidationOnce();

		const setCalls = updateSetMock.mock.calls.map((call) => call[0]);
		expect(setCalls).toEqual([
			// 每对：transactions 改指向 + 归档父分类 + 归档子分类（无条件两连）
			{ categoryId: 'c-adjust' },
			{ archived: 1 },
			{ archived: 1 },
			{ categoryId: 'c-sub' },
			{ archived: 1 },
			{ archived: 1 },
			{ categoryId: 'gen-id-1' },
			{ archived: 1 },
			{ archived: 1 },
		]);
		expect(deleteWhereMock).not.toHaveBeenCalled();
		expect(setMock).toHaveBeenCalledWith('categories.consolidation.v1', true);
	});

	it('导入映射与唯一索引冲突 → 删除旧条目而非改指向', async () => {
		getMock.mockResolvedValueOnce(null);
		// 对①: from/ensure/mappings(1条)/dup(冲突)；对②③ from 走兜底 [] → 跳过
		selectMock
			.mockImplementationOnce(() => chainable([{ id: 'c-louji' }]))
			.mockImplementationOnce(() => chainable([{ id: 'c-adjust' }]))
			.mockImplementationOnce(() => chainable([{ id: 'm1', adapterId: 'bohe-csv' }]))
			.mockImplementationOnce(() => chainable([{ id: 'm-dup' }]));

		await migrateCategoryConsolidationOnce();

		expect(deleteMock).toHaveBeenCalledWith(expect.anything());
		const setCalls = updateSetMock.mock.calls.map((call) => call[0]);
		expect(setCalls).toEqual([{ categoryId: 'c-adjust' }, { archived: 1 }, { archived: 1 }]);
	});

	it('目标分类缺失（如「订阅」不存在）→ 跳过该对但不影响其他对', async () => {
		getMock.mockResolvedValueOnce(null);
		// Once 非空时优先于兜底，逐次消耗：
		// 对① from 不存在→跳过；对② from/to(订阅缺失→跳过)；对③ from/ensure(缺失→插入)
		selectMock
			.mockImplementationOnce(() => chainable([])) // 对① 漏记支出不存在
			.mockImplementationOnce(() => chainable([{ id: 'c-net' }])) // 对② 网络服务存在
			.mockImplementationOnce(() => chainable([])) // 对② 订阅不存在 → 跳过（不归档）
			.mockImplementationOnce(() => chainable([{ id: 'c-income' }])) // 对③ 漏记收入存在
			.mockImplementationOnce(() => chainable([])); // 对③ ensure 补记漏记(income) 缺失 → 插入

		await migrateCategoryConsolidationOnce();

		const setCalls = updateSetMock.mock.calls.map((call) => call[0]);
		expect(setCalls).toEqual([
			{ categoryId: 'gen-id-1' }, // transactions 改指向
			{ archived: 1 }, // 归档 漏记收入
			{ archived: 1 }, // 归档其子分类
		]);
		expect(insertMock).toHaveBeenCalled();
		expect(newId).toHaveBeenCalled();
		expect(setMock).toHaveBeenCalledWith('categories.consolidation.v1', true);
	});
});
