import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react-native';
import { showDialog, showToast } from '@/components/dialog';
import { zh } from '@/i18n/zh';
import { invalidateTransactionData } from '../invalidate';
import {
  countLegacySmartNoteTransactions,
  getSmartTagMigrationDecision,
  migrateLegacySmartNotes,
  setSmartTagMigrationDecision,
} from '../smart-tag-migration';
import { SMART_TAG } from '../tags';
import { SmartTagMigrationRunner } from '../SmartTagMigrationRunner';

jest.mock('@/components/dialog', () => ({ showDialog: jest.fn(), showToast: jest.fn() }));
jest.mock('../invalidate', () => ({ invalidateTransactionData: jest.fn(async () => undefined) }));
jest.mock('../smart-tag-migration', () => ({
  getSmartTagMigrationDecision: jest.fn(),
  countLegacySmartNoteTransactions: jest.fn(),
  migrateLegacySmartNotes: jest.fn(),
  setSmartTagMigrationDecision: jest.fn(async () => undefined),
}));

const copy = zh.tx.smartTagMigration;
const dialog = jest.mocked(showDialog);
const decision = jest.mocked(getSmartTagMigrationDecision);
const countLegacy = jest.mocked(countLegacySmartNoteTransactions);
const migrate = jest.mocked(migrateLegacySmartNotes);
const recordDecision = jest.mocked(setSmartTagMigrationDecision);
const invalidate = jest.mocked(invalidateTransactionData);

/** 挂载 runner 并跑过启动延时 */
async function mountRunner() {
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <SmartTagMigrationRunner />
    </QueryClientProvider>,
  );
  await act(async () => {
    jest.advanceTimersByTime(1000);
  });
}

function buttonsOf(index = 0) {
  return dialog.mock.calls[index]![2]!;
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  decision.mockResolvedValue(null);
  countLegacy.mockResolvedValue(0);
  migrate.mockResolvedValue(0);
});

afterEach(() => {
  jest.useRealTimers();
});

it('没有任何旧备注时静默收尾，只记下「无历史数据」不再复查', async () => {
  await mountRunner();

  expect(dialog).not.toHaveBeenCalled();
  expect(recordDecision).toHaveBeenCalledWith('none');
});

it('已经做过决定就不再询问', async () => {
  decision.mockResolvedValue('declined');

  await mountRunner();

  expect(countLegacy).not.toHaveBeenCalled();
  expect(dialog).not.toHaveBeenCalled();
});

it('检测到旧备注时询问用户，并说明标签名与影响范围', async () => {
  countLegacy.mockResolvedValue(3);

  await mountRunner();

  expect(dialog).toHaveBeenCalledTimes(1);
  expect(dialog.mock.calls[0]![0]).toBe(copy.title);
  expect(dialog.mock.calls[0]![1]).toBe(copy.message(3, SMART_TAG));
  expect(buttonsOf().map((button) => button.text)).toEqual([copy.later, copy.convert]);
  // 必须显式选择：关闭遮罩不留半途状态
  expect(dialog.mock.calls[0]![3]).toEqual({ cancelable: false });
});

it('选择「暂不转换」只记决定，不改写任何数据', async () => {
  countLegacy.mockResolvedValue(2);
  await mountRunner();

  await act(async () => {
    buttonsOf()[0]!.onPress!();
  });

  expect(migrate).not.toHaveBeenCalled();
  expect(recordDecision).toHaveBeenCalledWith('declined');
});

it('选择「立即转换」执行迁移、刷新缓存并提示结果', async () => {
  countLegacy.mockResolvedValue(2);
  migrate.mockResolvedValue(2);
  await mountRunner();

  await act(async () => {
    buttonsOf()[1]!.onPress!();
  });

  expect(migrate).toHaveBeenCalledTimes(1);
  expect(recordDecision).toHaveBeenCalledWith('converted');
  expect(invalidate).toHaveBeenCalledTimes(1);
  expect(showToast).toHaveBeenCalledWith(copy.done(2, SMART_TAG));
});

it('迁移失败时报错，且不记录「已转换」', async () => {
  countLegacy.mockResolvedValue(1);
  migrate.mockRejectedValue(new Error('disk full'));
  await mountRunner();

  await act(async () => {
    buttonsOf()[1]!.onPress!();
  });

  expect(recordDecision).not.toHaveBeenCalledWith('converted');
  expect(showDialog).toHaveBeenLastCalledWith(zh.common.error, 'disk full');
});
