import { zh } from '@/i18n/zh';
import {
  dismissDialog,
  getDialogSnapshot,
  resetDialogStore,
  showDialog,
  showToast,
} from '../dialog-store';

afterEach(() => {
  resetDialogStore();
  jest.useRealTimers();
});

it('shows a single acknowledgement button when no buttons are supplied', () => {
  showDialog('Saved');
  const { dialog } = getDialogSnapshot();
  expect(dialog?.title).toBe('Saved');
  expect(dialog?.buttons).toEqual([{ text: zh.common.gotIt }]);
});

it('queues a second dialog instead of replacing the visible one', () => {
  const first = jest.fn();
  const second = jest.fn();
  showDialog('First', undefined, [{ text: 'OK', onPress: first }]);
  showDialog('Second', undefined, [{ text: 'OK', onPress: second }]);
  expect(getDialogSnapshot().dialog?.title).toBe('First');

  dismissDialog(0);
  expect(first).toHaveBeenCalledTimes(1);
  expect(second).not.toHaveBeenCalled();
  expect(getDialogSnapshot().dialog?.title).toBe('Second');

  dismissDialog(0);
  expect(second).toHaveBeenCalledTimes(1);
  expect(getDialogSnapshot().dialog).toBeNull();
});

it('treats a backdrop dismissal as cancel and runs no button handler', () => {
  const onPress = jest.fn();
  const onDismiss = jest.fn();
  showDialog('Delete?', undefined, [{ text: 'Delete', onPress }], { onDismiss });

  dismissDialog(null);

  expect(onPress).not.toHaveBeenCalled();
  expect(onDismiss).toHaveBeenCalledTimes(1);
  expect(getDialogSnapshot().dialog).toBeNull();
});

it('lets a button handler open the next dialog without racing the queue', () => {
  showDialog('Restore?', undefined, [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Restore',
      style: 'destructive',
      onPress: () => showDialog('Restored'),
    },
  ]);

  dismissDialog(1);

  expect(getDialogSnapshot().dialog?.title).toBe('Restored');
});

it('auto-dismisses a toast after its duration', () => {
  jest.useFakeTimers();
  showToast('Saved', 1500);
  expect(getDialogSnapshot().toast?.text).toBe('Saved');

  jest.advanceTimersByTime(1499);
  expect(getDialogSnapshot().toast?.text).toBe('Saved');

  jest.advanceTimersByTime(1);
  expect(getDialogSnapshot().toast).toBeNull();
});

it('replaces the running toast and restarts its timer', () => {
  jest.useFakeTimers();
  showToast('First', 1000);
  jest.advanceTimersByTime(600);
  showToast('Second', 1000);

  jest.advanceTimersByTime(600);
  expect(getDialogSnapshot().toast?.text).toBe('Second');

  jest.advanceTimersByTime(400);
  expect(getDialogSnapshot().toast).toBeNull();
});
