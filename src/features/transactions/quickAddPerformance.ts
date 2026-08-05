export type QuickAddFormReadiness = {
  formLaidOut: boolean;
  accountsFetched: boolean;
  projectsFetched: boolean;
  categoriesFetched: boolean;
  ratesFetched: boolean;
};

export function isQuickAddFormInteractive(readiness: QuickAddFormReadiness): boolean {
  return (
    readiness.formLaidOut &&
    readiness.accountsFetched &&
    readiness.projectsFetched &&
    readiness.categoriesFetched &&
    readiness.ratesFetched
  );
}

export type QuickAddPresentationReadiness = {
  handoffId: string | null | undefined;
  formInteractiveHandoffId: string | null;
  sheetEnteredHandoffId: string | null;
};

export function isQuickAddPresentationReady(
  readiness: QuickAddPresentationReadiness,
): boolean {
  return (
    readiness.handoffId !== null &&
    readiness.handoffId !== undefined &&
    readiness.formInteractiveHandoffId === readiness.handoffId &&
    readiness.sheetEnteredHandoffId === readiness.handoffId
  );
}
