import { fireEvent, render, screen } from '@testing-library/react-native';

// DateTimePicker 原生组件在 jest 下不可用；替换为可触发回调的桩
jest.mock('@react-native-community/datetimepicker', () => {
  const React = require('react');
  const { View } = require('react-native');
  const MockPicker = (props: {
    onValueChange?: (event: unknown, selected?: Date) => void;
    testID?: string;
  }) => {
    return (
      <View
        testID={props.testID ?? 'mock-date-time-picker'}
        onTouchEnd={() => props.onValueChange?.(null, new Date('2026-10-01T00:00:00'))}
      />
    );
  };
  return { __esModule: true, default: MockPicker };
});

import { DatePickerField } from '../date-picker';

describe('DatePickerField', () => {
  const onPick = jest.fn();

  function setup(overrides?: { value?: string; clearable?: boolean; onClear?: () => void }) {
    return render(
      <DatePickerField
        value={overrides?.value ?? '2026-11-08'}
        onPick={onPick}
        clearable={overrides?.clearable}
        onClear={overrides?.onClear}
        placeholder="长期"
      />,
    );
  }

  it('显示当前值；空值显示占位', () => {
    setup();
    expect(screen.getByText('2026-11-08')).toBeTruthy();

    setup({ value: '' });
    expect(screen.getByText('长期')).toBeTruthy();
  });

  it('clearable 且有值时展示清除按钮，点击触发 onClear', () => {
    const onClear = jest.fn();
    setup({ clearable: true, onClear });
    fireEvent.press(screen.getByLabelText('关闭'));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('非 clearable 不展示清除按钮', () => {
    setup();
    expect(screen.queryByLabelText('关闭')).toBeNull();
  });
});
