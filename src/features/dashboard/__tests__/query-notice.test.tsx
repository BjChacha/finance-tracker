import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryNotice } from '../components';
import { dashboardText as copy } from '../labels';

it('ignores queries that were never started because they are disabled', () => {
  render(
    <QueryNotice
      queries={[{ isPending: true, isError: false, refetch: jest.fn(), fetchStatus: 'idle' }]}
    />,
  );
  expect(screen.queryByText(copy.loading)).toBeNull();
});

it('still shows the loading notice while a request is in flight', () => {
  render(
    <QueryNotice
      queries={[
        { isPending: true, isError: false, refetch: jest.fn(), fetchStatus: 'fetching' },
      ]}
    />,
  );
  expect(screen.getByText(copy.loading)).toBeTruthy();
});

it('reports failures and retries only the failed queries', () => {
  const failing = { isPending: false, isError: true, refetch: jest.fn(), fetchStatus: 'idle' };
  const healthy = { isPending: false, isError: false, refetch: jest.fn(), fetchStatus: 'idle' };
  render(<QueryNotice queries={[failing, healthy]} />);
  expect(screen.getByText(copy.error)).toBeTruthy();
  fireEvent.press(screen.getByText(copy.retry));
  expect(failing.refetch).toHaveBeenCalledTimes(1);
  expect(healthy.refetch).not.toHaveBeenCalled();
});
