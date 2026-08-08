import { AutoSaveQueue } from '../auto-save';

describe('AutoSaveQueue', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('debounces snapshots and saves only the latest value', async () => {
    const save = jest.fn(async () => undefined);
    const queue = new AutoSaveQueue({ save, debounceMs: 350 });
    queue.reset({ name: 'original' });

    queue.schedule({ name: 'first' });
    queue.schedule({ name: 'latest' });
    jest.advanceTimersByTime(350);
    await queue.flush();

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ name: 'latest' });
  });

  it('does not notify subscribers repeatedly for the same saved snapshot', () => {
    const queue = new AutoSaveQueue({ save: async () => undefined });
    const listener = jest.fn();
    queue.subscribe(listener);
    queue.reset({ name: 'same' });

    queue.schedule({ name: 'same' });
    queue.schedule({ name: 'same' });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(queue.getState().status).toBe('saved');
  });

  it('serializes writes and retains a newer snapshot during an active write', async () => {
    let resolveFirst: (() => void) | undefined;
    const save = jest
      .fn<Promise<void>, [{ value: number }]>()
      .mockImplementationOnce(
        () => new Promise<void>((resolve) => {
          resolveFirst = resolve;
        }),
      )
      .mockResolvedValue(undefined);
    const queue = new AutoSaveQueue({ save, debounceMs: 350 });
    queue.reset({ value: 0 });

    queue.schedule({ value: 1 });
    jest.advanceTimersByTime(350);
    await Promise.resolve();
    queue.schedule({ value: 2 });
    queue.schedule({ value: 3 });

    expect(save).toHaveBeenCalledTimes(1);
    resolveFirst?.();
    await queue.flush();

    expect(save.mock.calls).toEqual([[{ value: 1 }], [{ value: 3 }]]);
  });

  it('flushes a pending snapshot without waiting for debounce', async () => {
    const save = jest.fn(async () => undefined);
    const queue = new AutoSaveQueue({ save, debounceMs: 350 });
    queue.reset('before');
    queue.schedule('after');

    await expect(queue.flush()).resolves.toBe(true);
    expect(save).toHaveBeenCalledWith('after');
  });

  it('retains a failed snapshot and retries it', async () => {
    const save = jest
      .fn<Promise<void>, [string]>()
      .mockRejectedValueOnce(new Error('failed'))
      .mockResolvedValue(undefined);
    const queue = new AutoSaveQueue({ save, debounceMs: 350 });
    queue.reset('before');
    queue.schedule('after');

    await expect(queue.flush()).resolves.toBe(false);
    expect(queue.getState().status).toBe('error');
    await expect(queue.retry()).resolves.toBe(true);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('cancels pending writes and waits for an active write', async () => {
    let resolveSave: (() => void) | undefined;
    const save = jest.fn(
      () => new Promise<void>((resolve) => {
        resolveSave = resolve;
      }),
    );
    const queue = new AutoSaveQueue({ save, debounceMs: 350 });
    queue.reset(0);
    queue.schedule(1);
    jest.advanceTimersByTime(350);
    await Promise.resolve();
    queue.schedule(2);

    const cancellation = queue.cancel();
    expect(save).toHaveBeenCalledTimes(1);
    resolveSave?.();
    await cancellation;
    jest.runAllTimers();

    expect(save).toHaveBeenCalledTimes(1);
    expect(queue.getState().status).toBe('idle');
  });
});
