import { act, render } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { useQuickActionsBootstrap } from '../useQuickActions';

const mockReplace = jest.fn();
const mockDismissAll = jest.fn();
const mockCanDismiss = jest.fn(() => false);
const mockDismissResidentEditor = jest.fn();
let mockPathname = '/';
let mockParams: { handoffId?: string } = {};

let mockPendingLaunch: {
  amountCents: number;
  currency: string;
  type: 'expense' | 'income';
  handoffId: string;
} | null = null;
let mockLaunchListener:
  | ((launch: NonNullable<typeof mockPendingLaunch>) => void)
  | null = null;

jest.mock('expo-router', () => ({
  useRouter: () => ({
    replace: mockReplace,
    dismissAll: mockDismissAll,
    canDismiss: mockCanDismiss,
    navigate: jest.fn(),
  }),
  usePathname: () => mockPathname,
  useGlobalSearchParams: () => mockParams,
  useRootNavigationState: () => ({ key: 'root' }),
}));

jest.mock('expo-quick-actions', () => ({
  initial: null,
  setItems: jest.fn(async () => {}),
  addListener: jest.fn(() => ({ remove: jest.fn() })),
}));

jest.mock('@/components/navigation/resident-editor-sheet-host', () => ({
  useResidentEditorDismiss: () => mockDismissResidentEditor,
}));

jest.mock('@/lib/quickKeypad', () => ({
  getPendingQuickAddLaunch: () => mockPendingLaunch,
  addQuickAddLaunchListener: (listener: (launch: never) => void) => {
    mockLaunchListener = listener as never;
    return {
      remove() {
        mockLaunchListener = null;
      },
    };
  },
}));

function Harness() {
  useQuickActionsBootstrap();
  return null;
}

const LAUNCH = {
  amountCents: 1234,
  currency: 'CNY',
  type: 'expense' as const,
  handoffId: 'handoff-1',
};

describe('useQuickActionsBootstrap (android)', () => {
  beforeAll(() => {
    Object.defineProperty(Platform, 'OS', { get: () => 'android', configurable: true });
  });

  beforeEach(() => {
    mockPendingLaunch = null;
    mockLaunchListener = null;
    mockPathname = '/';
    mockParams = {};
    mockReplace.mockClear();
    mockDismissAll.mockClear();
    mockCanDismiss.mockClear().mockReturnValue(false);
    mockDismissResidentEditor.mockClear();
  });

  it('collapses the resident editor before replacing the stack', () => {
    mockPendingLaunch = LAUNCH;
    const order: string[] = [];
    mockDismissResidentEditor.mockImplementation(() => order.push('dismiss'));
    mockReplace.mockImplementation(() => order.push('replace'));

    render(<Harness />);

    expect(mockDismissResidentEditor).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['dismiss', 'replace']);
    expect(mockDismissAll).not.toHaveBeenCalled();
    expect(mockCanDismiss).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/quick-add-transaction',
      params: {
        amount: '1234',
        currency: 'CNY',
        type: 'expense',
        handoffId: 'handoff-1',
      },
    });
  });

  it('replaces directly even when the router could dismiss a stacked route', () => {
    mockPendingLaunch = LAUNCH;
    mockCanDismiss.mockReturnValue(true);

    render(<Harness />);

    expect(mockDismissAll).not.toHaveBeenCalled();
    expect(mockCanDismiss).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledTimes(1);
  });

  it('does not mutate navigation when the matching deep link is already active', () => {
    mockPendingLaunch = LAUNCH;
    mockPathname = '/quick-add-transaction';
    mockParams = { handoffId: LAUNCH.handoffId };

    const view = render(<Harness />);

    expect(mockDismissResidentEditor).not.toHaveBeenCalled();
    expect(mockDismissAll).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();

    mockPathname = '/';
    mockParams = {};
    view.rerender(<Harness />);

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('routes once when the same handoff arrives twice', () => {
    mockPendingLaunch = LAUNCH;
    render(<Harness />);
    expect(mockReplace).toHaveBeenCalledTimes(1);

    act(() => mockLaunchListener?.(LAUNCH));

    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockDismissResidentEditor).toHaveBeenCalledTimes(1);
  });

  it('routes a new handoff after the previous one', () => {
    mockPendingLaunch = LAUNCH;
    render(<Harness />);

    act(() =>
      mockLaunchListener?.({
        ...LAUNCH,
        amountCents: 5678,
        handoffId: 'handoff-2',
      }),
    );

    expect(mockReplace).toHaveBeenCalledTimes(2);
    expect(mockDismissResidentEditor).toHaveBeenCalledTimes(2);
  });

  it('does nothing when no launch is pending', () => {
    render(<Harness />);

    expect(mockDismissResidentEditor).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
