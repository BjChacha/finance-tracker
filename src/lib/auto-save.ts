import { useEffect, useRef, useState } from 'react';

export type AutoSaveStatus = 'idle' | 'waiting' | 'saving' | 'saved' | 'error';

export type AutoSaveState = {
  status: AutoSaveStatus;
  error: unknown;
};

type Snapshot<T> = {
  key: string;
  value: T;
};

type AutoSaveQueueOptions<T> = {
  save: (value: T) => Promise<void>;
  debounceMs?: number;
  serialize?: (value: T) => string;
};

const DEFAULT_DEBOUNCE_MS = 350;

export class AutoSaveQueue<T> {
  private readonly save: (value: T) => Promise<void>;
  private readonly debounceMs: number;
  private readonly serialize: (value: T) => string;
  private readonly listeners = new Set<(state: AutoSaveState) => void>();
  private active = true;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending: Snapshot<T> | null = null;
  private inFlight: Snapshot<T> | null = null;
  private drainPromise: Promise<boolean> | null = null;
  private lastSavedKey: string | null = null;
  private state: AutoSaveState = { status: 'idle', error: null };

  constructor({
    save,
    debounceMs = DEFAULT_DEBOUNCE_MS,
    serialize = JSON.stringify,
  }: AutoSaveQueueOptions<T>) {
    this.save = save;
    this.debounceMs = debounceMs;
    this.serialize = serialize;
  }

  getState(): AutoSaveState {
    return this.state;
  }

  subscribe(listener: (state: AutoSaveState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  reset(value: T): void {
    this.clearTimer();
    this.active = true;
    this.pending = null;
    this.lastSavedKey = this.serialize(value);
    this.setState({ status: 'idle', error: null });
  }

  schedule(value: T): void {
    if (!this.active) return;

    const snapshot = { value, key: this.serialize(value) };
    if (snapshot.key === this.inFlight?.key) {
      this.pending = null;
      this.clearTimer();
      return;
    }
    if (!this.inFlight && snapshot.key === this.lastSavedKey) {
      this.pending = null;
      this.clearTimer();
      this.setState({ status: 'saved', error: null });
      return;
    }
    if (snapshot.key === this.pending?.key) return;

    this.pending = snapshot;
    if (this.inFlight) return;

    this.clearTimer();
    this.setState({ status: 'waiting', error: null });
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.drain();
    }, this.debounceMs);
  }

  async flush(): Promise<boolean> {
    if (!this.active) return false;
    this.clearTimer();

    if (this.drainPromise) {
      const succeeded = await this.drainPromise;
      if (!succeeded) return false;
    }
    if (!this.pending) return this.state.status !== 'error';
    return this.drain();
  }

  async retry(): Promise<boolean> {
    if (!this.active || !this.pending) return false;
    this.clearTimer();
    this.setState({ status: 'waiting', error: null });
    return this.drain();
  }

  async cancel(): Promise<void> {
    this.active = false;
    this.clearTimer();
    this.pending = null;
    const currentDrain = this.drainPromise;
    if (currentDrain) await currentDrain;
    this.setState({ status: 'idle', error: null });
  }

  resume(): void {
    this.active = true;
  }

  private drain(): Promise<boolean> {
    if (this.drainPromise) return this.drainPromise;

    this.drainPromise = this.runDrain().finally(() => {
      this.drainPromise = null;
    });
    return this.drainPromise;
  }

  private async runDrain(): Promise<boolean> {
    while (this.active && this.pending) {
      const snapshot = this.pending;
      this.pending = null;
      this.inFlight = snapshot;
      this.setState({ status: 'saving', error: null });

      try {
        await this.save(snapshot.value);
        this.lastSavedKey = snapshot.key;
      } catch (error) {
        if (this.active && !this.pending) this.pending = snapshot;
        this.inFlight = null;
        if (this.active) this.setState({ status: 'error', error });
        return false;
      }

      this.inFlight = null;
    }

    if (this.active) this.setState({ status: 'saved', error: null });
    return true;
  }

  private clearTimer(): void {
    if (!this.timer) return;
    clearTimeout(this.timer);
    this.timer = null;
  }

  private setState(state: AutoSaveState): void {
    if (this.state.status === state.status && Object.is(this.state.error, state.error)) return;
    this.state = state;
    this.listeners.forEach((listener) => listener(state));
  }
}

type UseAutoSaveOptions<T> = AutoSaveQueueOptions<T> & {
  enabled: boolean;
  resetKey: string | number | null;
  initialValue: T | null;
  value: T | null;
};

export type AutoSaveController = AutoSaveState & {
  flush: () => Promise<boolean>;
  retry: () => Promise<boolean>;
  cancel: () => Promise<void>;
  resume: () => void;
};

export function useAutoSave<T>({
  enabled,
  resetKey,
  initialValue,
  value,
  save,
  debounceMs,
  serialize,
}: UseAutoSaveOptions<T>): AutoSaveController {
  const saveRef = useRef(save);
  saveRef.current = save;
  const queueRef = useRef<AutoSaveQueue<T> | null>(null);
  if (!queueRef.current) {
    queueRef.current = new AutoSaveQueue<T>({
      save: (snapshot) => saveRef.current(snapshot),
      debounceMs,
      serialize,
    });
  }
  const queue = queueRef.current;
  const [state, setState] = useState<AutoSaveState>(queue.getState());
  const initializedKeyRef = useRef<string | number | null>(null);

  useEffect(() => queue.subscribe(setState), [queue]);

  useEffect(() => {
    if (!enabled || resetKey === null || initialValue === null) return;
    if (initializedKeyRef.current === resetKey) return;
    initializedKeyRef.current = resetKey;
    queue.reset(initialValue);
  }, [enabled, initialValue, queue, resetKey]);

  useEffect(() => {
    if (!enabled || initializedKeyRef.current !== resetKey || value === null) return;
    queue.schedule(value);
  }, [enabled, queue, resetKey, value]);

  useEffect(
    () => () => {
      void queue.cancel();
    },
    [queue],
  );

  return {
    ...state,
    flush: () => queue.flush(),
    retry: () => queue.retry(),
    cancel: () => queue.cancel(),
    resume: () => {
      queue.resume();
      if (value !== null) queue.schedule(value);
    },
  };
}
