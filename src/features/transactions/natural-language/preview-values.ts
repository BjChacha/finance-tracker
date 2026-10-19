import type { TxFormInitialValues } from "../components/TransactionForm";
import type { validateNaturalLanguageDecision } from "./validation";

type Preview = ReturnType<typeof validateNaturalLanguageDecision>;

/** Marks a note as machine-refined so it is never mistaken for something the user typed. */
const SMART_NOTE_PREFIX = "\u3010\u667a\u80fd\u8bc6\u522b\u3011";

/** Keep recognized fields, but clear fields that require an explicit user selection. */
export function naturalLanguagePreviewValues(
  preview: Preview,
): Partial<TxFormInitialValues> | null {
  if (!preview.type || preview.issues.includes("not_clear_single")) return null;
  const flagged = (field: string) =>
    [...preview.issues, ...preview.violations].some((issue) =>
      issue.startsWith(`${field}_`),
    );
  const sourceFlagged =
    flagged("account") || preview.violations.includes("same_transfer_account");
  const destinationFlagged =
    flagged("to_account") ||
    preview.violations.includes("same_transfer_account");
  return {
    type: preview.type,
    ...(preview.amountCents !== null ? { amount: preview.amountCents } : {}),
    ...(preview.accountId && !sourceFlagged
      ? { accountId: preview.accountId }
      : {}),
    toAccountId:
      preview.type === "transfer" && !destinationFlagged
        ? preview.toAccountId
        : null,
    categoryId: flagged("category") ? null : preview.categoryId,
    ...(preview.dateMs !== null ? { dateMs: preview.dateMs } : {}),
    note: preview.note ? `${SMART_NOTE_PREFIX}${preview.note}` : "",
    currency: "CNY",
  };
}
