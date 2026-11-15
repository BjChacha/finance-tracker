import type { TxFormInitialValues } from "../components/TransactionForm";
import { SMART_TAG } from "../tags";
import type { validateNaturalLanguageDecision } from "./validation";

type Preview = ReturnType<typeof validateNaturalLanguageDecision>;

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
    note: preview.note,
    // 机器识别的出处记在交易标签上，不再往备注里塞「【智能识别】」文本：
    // 备注保持为用户的原始语义，标签则是可查询的数据属性。
    tags: [SMART_TAG],
    currency: preview.currency,
  };
}
