import {
  isQuickAddFormInteractive,
  isQuickAddPresentationReady,
  type QuickAddFormReadiness,
} from '../quickAddPerformance';

const READY: QuickAddFormReadiness = {
  formLaidOut: true,
  accountsFetched: true,
  projectsFetched: true,
  categoriesFetched: true,
  ratesFetched: true,
};

describe('isQuickAddFormInteractive', () => {
  it('returns true when the form is laid out and all required queries completed', () => {
    expect(isQuickAddFormInteractive(READY)).toBe(true);
  });

  it.each(Object.keys(READY) as (keyof QuickAddFormReadiness)[])(
    'returns false when %s is false',
    (key) => {
      expect(isQuickAddFormInteractive({ ...READY, [key]: false })).toBe(false);
    },
  );
});

describe('isQuickAddPresentationReady', () => {
  it('requires the form and sheet signals for the same handoff', () => {
    expect(
      isQuickAddPresentationReady({
        handoffId: 'handoff-1',
        formInteractiveHandoffId: 'handoff-1',
        sheetEnteredHandoffId: 'handoff-1',
      }),
    ).toBe(true);
  });

  it.each([
    { formInteractiveHandoffId: null, sheetEnteredHandoffId: 'handoff-1' },
    { formInteractiveHandoffId: 'handoff-1', sheetEnteredHandoffId: null },
    { formInteractiveHandoffId: 'handoff-old', sheetEnteredHandoffId: 'handoff-1' },
    { formInteractiveHandoffId: 'handoff-1', sheetEnteredHandoffId: 'handoff-old' },
  ])('rejects incomplete or stale presentation state: %o', (signals) => {
    expect(
      isQuickAddPresentationReady({ handoffId: 'handoff-1', ...signals }),
    ).toBe(false);
  });
});
