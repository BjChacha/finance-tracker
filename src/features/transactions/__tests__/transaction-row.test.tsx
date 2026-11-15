import { render, screen } from '@testing-library/react-native';
import { SMART_TAG } from '../tags';
import type { TxListItem } from '../repository';
import { TransactionRow } from '../components/TransactionRow';

jest.mock('@/components/navigation/resident-editor-sheet-host', () => ({
  useResidentEditor: () => ({ openTransaction: jest.fn(), openAccount: jest.fn() }),
}));
jest.mock('../hooks', () => ({ usePrefetchTransaction: () => jest.fn() }));

function tx(overrides: Partial<TxListItem> = {}): TxListItem {
  return {
    id: 'tx-1',
    type: 'expense',
    amount: 2800,
    fee: 0,
    accountId: 'acc-1',
    toAccountId: null,
    categoryId: 'cat-1',
    date: Date.parse('2026-11-15T12:00:00+08:00'),
    dateKey: '2026-11-15',
    note: '午饭',
    tags: [],
    currency: 'CNY',
    exchangeRate: 1_000_000,
    amountBaseCents: 2800,
    toAmount: null,
    categoryName: '餐饮',
    categoryIcon: 'utensils',
    categoryColor: '#F97316',
    parentCategoryName: null,
    projectId: null,
    projectName: null,
    projectIcon: null,
    projectColor: null,
    accountName: '现金',
    toAccountName: null,
    ...overrides,
  };
}

it('在条目标题旁展示交易标签', () => {
  render(<TransactionRow tx={tx({ tags: [SMART_TAG] })} />);

  expect(screen.getByText(SMART_TAG)).toBeTruthy();
  // 备注保持干净：出处在标签里，不再以文本混进备注
  expect(screen.getByText(/午饭/)).toBeTruthy();
});

it('没有标签的条目什么也不多显示', () => {
  render(<TransactionRow tx={tx()} />);

  expect(screen.queryByText(SMART_TAG)).toBeNull();
});
