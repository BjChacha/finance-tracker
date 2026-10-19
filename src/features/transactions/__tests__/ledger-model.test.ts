import { buildLedgerItems } from '../ledger-model';
import type { LedgerDay, TxListItem } from '../repository';

const tx = (id: string, dateKey: string): TxListItem => ({
	id,
	type: 'expense',
	amount: 1000,
	fee: 0,
	accountId: 'acc-1',
	toAccountId: null,
	categoryId: 'cat-1',
	date: Date.parse(`${dateKey}T12:00:00+08:00`),
	dateKey,
	note: '',
	currency: 'CNY',
	exchangeRate: 1_000_000,
	amountBaseCents: 1000,
	toAmount: null,
	categoryName: '餐饮',
	categoryIcon: 'utensils',
	categoryColor: '#F59E0B',
	parentCategoryName: null,
	projectId: null,
	projectName: null,
	projectIcon: null,
	projectColor: null,
	accountName: '现金',
	toAccountName: null,
});

const days: LedgerDay[] = [
	{ dateKey: '2026-10-02', income: 0, expense: 2000, count: 2 },
	{ dateKey: '2026-10-01', income: 5000, expense: 1000, count: 1 },
];

const rows = [
	tx('t1', '2026-10-02'),
	tx('t2', '2026-10-02'),
	tx('t3', '2026-10-01'),
];

const kinds = (items: ReturnType<typeof buildLedgerItems>) =>
	items.map((item) => `${item.kind}:${item.key}`);

describe('buildLedgerItems', () => {
	it('expands year, month, day and transactions when nothing is collapsed', () => {
		expect(kinds(buildLedgerItems(rows, new Map(), new Set()))).toEqual([
			'year:2026',
			'month:2026-10',
			'day:2026-10-02',
			'transaction:t1',
			'transaction:t2',
			'day:2026-10-01',
			'transaction:t3',
		]);
	});

	it('keeps the day header but hides only that day transactions when collapsed', () => {
		const items = buildLedgerItems(rows, new Map(), new Set(['2026-10-02']));
		expect(kinds(items)).toEqual([
			'year:2026',
			'month:2026-10',
			'day:2026-10-02',
			'day:2026-10-01',
			'transaction:t3',
		]);
		const day = items.find((item) => item.key === '2026-10-02');
		expect(day).toMatchObject({ kind: 'day', collapsed: true });
	});

	it('reports an expanded day as not collapsed', () => {
		const items = buildLedgerItems(rows, new Map(), new Set(['2026-10-01']));
		const collapsedDay = items.find((item) => item.key === '2026-10-01');
		const expandedDay = items.find((item) => item.key === '2026-10-02');
		expect(collapsedDay).toMatchObject({ collapsed: true });
		expect(expandedDay).toMatchObject({ collapsed: false });
	});

	it('still hides every transaction under a collapsed month', () => {
		expect(kinds(buildLedgerItems(rows, new Map(), new Set(['2026-10'])))).toEqual(
			['year:2026', 'month:2026-10'],
		);
	});

	it('still hides the whole year when the year is collapsed', () => {
		expect(kinds(buildLedgerItems(rows, new Map(), new Set(['2026'])))).toEqual([
			'year:2026',
		]);
	});

	it('uses SQL totals per header rather than the loaded page', () => {
		const groups = new Map([
			['2026', { income: 5000, expense: 3000, count: 3 }],
			['2026-10', { income: 5000, expense: 3000, count: 3 }],
			['2026-10-02', { income: 0, expense: 2000, count: 2 }],
		]);
		const items = buildLedgerItems(rows, groups, new Set());
		expect(items[0]).toMatchObject({ kind: 'year', income: 5000, expense: 3000, count: 3 });
		const day = items.find((item) => item.key === '2026-10-02');
		expect(day).toMatchObject({ income: 0, expense: 2000, count: 2 });
	});

	it('keeps day headers ordered by the row order', () => {
		const order = buildLedgerItems(rows, new Map(), new Set())
			.filter((item) => item.kind === 'day')
			.map((item) => item.key);
		expect(order).toEqual(['2026-10-02', '2026-10-01']);
	});
});
