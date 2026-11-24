import { fireEvent, render, screen } from '@testing-library/react-native';
import { MultiSeriesLineChart } from '../MultiSeriesLineChart';
import { zh } from '@/i18n/zh';

const series = [
  { id: 'food', name: '餐饮', color: '#F97316' },
  { id: 'traffic', name: '交通', color: '#0EA5E9' },
];

// values 单位是「分」：10000 分 = ¥100.00
const points = [
  { label: '9', detailLabel: '2026-09', values: [10000, 5000] },
  { label: '10', detailLabel: '2026-10', values: [20000, 8000] },
  { label: '11', detailLabel: '2026-11', values: [15000, 9000] },
];

it('渲染图例与默认选中点（最后一个周期）的读数', () => {
  render(<MultiSeriesLineChart series={series} points={points} />);
  // 图例
  expect(screen.getAllByText('餐饮').length).toBeGreaterThanOrEqual(1);
  expect(screen.getAllByText('交通').length).toBeGreaterThanOrEqual(1);
  // 默认选中最后一点，读数区显示该周期的日期与各序列金额
  expect(screen.getByText('2026-11')).toBeTruthy();
  expect(screen.getByText('餐饮 ¥150.00')).toBeTruthy();
  expect(screen.getByText('交通 ¥90.00')).toBeTruthy();
});

it('点图例回调序列 id（供上层切换显隐）', () => {
  const onToggleSeries = jest.fn();
  render(
    <MultiSeriesLineChart
      series={series}
      points={points}
      onToggleSeries={onToggleSeries}
    />,
  );
  fireEvent.press(screen.getByLabelText('餐饮'));
  expect(onToggleSeries).toHaveBeenCalledWith('food');
});

it('被隐藏的序列不出现在读数区，图例标记为已隐藏', () => {
  render(
    <MultiSeriesLineChart series={series} points={points} hiddenIds={['traffic']} />,
  );
  expect(screen.queryByText('交通 ¥90.00')).toBeNull();
  expect(screen.getByLabelText('交通 已隐藏')).toBeTruthy();
});

it('空数据展示空态', () => {
  render(<MultiSeriesLineChart series={series} points={[]} />);
  expect(screen.getByText(zh.common.empty)).toBeTruthy();
});

it('单个周期（点数为 1）也能渲染，不产生 NaN 读数', () => {
  render(
    <MultiSeriesLineChart
      series={series}
      points={[{ label: '11', detailLabel: '2026-11', values: [12345, 0] }]}
    />,
  );
  expect(screen.getByText('餐饮 ¥123.45')).toBeTruthy();
});
