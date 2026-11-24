import { render, screen } from '@testing-library/react-native';
import { SankeyChart } from '../SankeyChart';
import { aggregateMoneyFlow, type FlowRow } from '../../sankey-model';
import { zh } from '@/i18n/zh';

const row = (
  accountId: string,
  accountName: string,
  categoryId: string,
  categoryName: string,
  total: number,
): FlowRow => ({
  accountId,
  accountName,
  accountColor: '#111111',
  categoryId,
  categoryName,
  categoryColor: '#222222',
  total,
});

const flow = aggregateMoneyFlow([
  row('cash', '现金', 'food', '餐饮', 300),
  row('card', '招商银行', 'traffic', '交通', 100),
]);

it('渲染两侧节点名称与合计说明', () => {
  render(<SankeyChart flow={flow} />);
  expect(screen.getByText('现金')).toBeTruthy();
  expect(screen.getByText('招商银行')).toBeTruthy();
  expect(screen.getByText('餐饮')).toBeTruthy();
  expect(screen.getByText('交通')).toBeTruthy();
  // 底部说明行给出账户/分类个数与合计金额
  expect(screen.getByText(/宽度表示金额/)).toBeTruthy();
});

it('暴露无障碍概述（读屏能听到流向规模）', () => {
  render(<SankeyChart flow={flow} />);
  expect(screen.getByLabelText(/资金流向：2 个账户 → 2 个分类/)).toBeTruthy();
});

it('无流量时展示空态而不是空白画布', () => {
  render(<SankeyChart flow={aggregateMoneyFlow([])} />);
  expect(screen.getByText(zh.common.empty)).toBeTruthy();
});

it('折叠出的「其他」节点带上被并入的项数', () => {
  const folded = aggregateMoneyFlow(
    [
      row('a', '账户A', 'x', '分类X', 500),
      row('b', '账户B', 'y', '分类Y', 400),
      row('c', '账户C', 'z', '分类Z', 300),
    ],
    { maxLeft: 1, maxRight: 1 },
  );
  render(<SankeyChart flow={folded} />);
  // 左 2 项、右 2 项被折叠
  expect(screen.getAllByText(/其他 2 项/).length).toBeGreaterThanOrEqual(1);
});
