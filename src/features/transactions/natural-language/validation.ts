import type { NaturalLanguageContext } from "./context";
import type { createFieldContract } from "./field-contract";
import { naturalLanguageAmountCandidates } from "./money";
import { auditAccountEvidence } from "./account-evidence";
import { atTimeOfDay, dayFromEvidence, periodFromEvidence, requiresDateConfirmation } from "./dates";

export type FieldDecision = ReturnType<
  ReturnType<typeof createFieldContract>["decode"]
>;

/** Produces a draft and review requirements. No persistence is performed here. */
export function validateNaturalLanguageDecision(
  text: string,
  context: NaturalLanguageContext,
  decision: FieldDecision,
) {
  const issues: string[] = [];
  const violations: string[] = [];
  const amounts = naturalLanguageAmountCandidates(text);
  const amountEvidence =
    amounts.find((candidate) => candidate.id === decision.amount) ?? null;
  // 金额以模型读到的数值为准（产品决策）；本地解析只作为证据与对账观测，不覆盖它。
  const modelCents = decision.amountCents ?? null;
  const amountCents = modelCents ?? amountEvidence?.cents ?? null;
  if (
    modelCents !== null &&
    // 只有「模型自己指了候选、却和自己的数值矛盾」才是真矛盾；
    // 它按语义算出新金额（AA、优惠、平摊）时对不上候选是预期行为。
    decision.amount !== null &&
    amountEvidence !== null &&
    amountEvidence.cents !== modelCents
  ) {
    console.warn("[natural-language] Model picked a candidate that contradicts its own amount", {
      model: modelCents,
      candidate: amountEvidence.cents,
      span: amountEvidence.text,
    });
  }
  const accounts = context.accounts.filter((row) => row.active !== false);
  const category = context.categories.find(
    (row) => !row.archived && row.id === decision.category,
  );
  if (amountCents === null) issues.push("amount_required");
  if (decision.type === null) issues.push("type_required");
  if (!category) issues.push("category_required");
  else if (category.type !== decision.type)
    violations.push("category_type_mismatch");
  if (decision.account === null) issues.push("account_required");
  for (const field of ["account", "to_account"] as const) {
    const selected = accounts.find((row) => row.id === decision[field]);
    if (decision[field] !== null && !selected)
      violations.push(`${field}_unknown`);
    if (selected) {
      if (
        ![selected.name, ...(selected.aliases ?? [])].some((alias) =>
          text.includes(alias),
        )
      )
        violations.push(`${field}_not_grounded`);
      if (accounts.filter((row) => row.name === selected.name).length > 1)
        violations.push(`${field}_ambiguous`);
    }
  }
  if (decision.type === "transfer") {
    if (decision.to_account === null) issues.push("destination_required");
    else if (decision.account === decision.to_account)
      violations.push("same_transfer_account");
  } else if (decision.to_account !== null)
    violations.push("unexpected_destination");
  if (decision.status !== "single") issues.push("not_clear_single");
  const day = dayFromEvidence(text);
  if (day === "unknown") issues.push("date_required");
  const nowMs = Date.parse(context.now);
  if (!Number.isFinite(nowMs)) throw new Error("Invalid current time");
  const offset =
    day === "today"
      ? 0
      : day === "yesterday"
        ? 1
        : day === "before_yesterday"
          ? 2
          : null;
  let dateMs = offset === null ? null : nowMs - offset * 86400000;
  const period = periodFromEvidence(text);
  if (dateMs !== null && period !== null) dateMs = atTimeOfDay(dateMs, period);
  const accountEvidence = auditAccountEvidence(text, context, decision);
  for (const field of accountEvidence.confirmationFields)
    issues.push(`${field}_confirmation_required`);
  if (
    decision.status === "single" &&
    decision.type === "transfer" &&
    !accountEvidence.directionVerified
  ) {
    issues.push(
      "account_direction_confirmation_required",
      "to_account_direction_confirmation_required",
    );
  }
  const dateConfirmation =
    decision.status === "single" && requiresDateConfirmation(text);
  if (dateConfirmation) {
    dateMs = null;
    issues.push("date_confirmation_required");
  }
  return {
    status: (violations.length
      ? "invalid"
      : issues.length
        ? "needs_input"
        : "preview") as "invalid" | "needs_input" | "preview",
    amountCents,
    amountEvidence,
    type: decision.type,
    categoryId:
      category && category.type === decision.type ? category.id : null,
    accountId: decision.account,
    toAccountId: decision.to_account,
    dateMs,
    note: typeof decision.note === "string" ? decision.note : "",
    issues,
    violations,
    accountEvidence,
    dateConfirmation,
  };
}
