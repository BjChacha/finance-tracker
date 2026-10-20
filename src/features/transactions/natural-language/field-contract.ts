import {
  mapNaturalLanguageContext,
  type NaturalLanguageContext,
  type NaturalLanguageTransactionType,
} from "./context";
import {
  naturalLanguageAmountCandidates,
  splitNaturalLanguageAmounts,
} from "./money";
import { parseModelFields } from "./strict-json";

const TYPES: readonly (string | null)[] = ["expense", "income", "transfer", null];
const MAX_NOTE_CHARACTERS = 24;

/** The note is a model refinement, never the raw sentence: reject control characters and cap it. */
function refineNote(value: string | null): string | null {
  if (value === null) return null;
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  return Array.from(cleaned).slice(0, MAX_NOTE_CHARACTERS).join("").trim();
}

/**
 * Candidate snapshot plus a lenient decoder for one remote completion.
 *
 * The decoder never fabricates identifiers: a value outside the request-local candidate set is
 * dropped to null, so business validation reports the field as missing instead of trusting the
 * model. Amount omission is the one derived case — a single candidate confirmed as `single`.
 */
export function createFieldContract(
  text: string,
  context: NaturalLanguageContext,
) {
  if (!text.trim() || Array.from(text).length > 200)
    throw new Error("Expected 1 to 200 characters");
  const mapping = mapNaturalLanguageContext(context);
  const { candidates, quantities } = splitNaturalLanguageAmounts(
    text,
    naturalLanguageAmountCandidates(text),
  );
  const accounts = mapping.context.accounts.filter(
    (row) =>
      [row.name, ...(row.aliases ?? [])].some((name) => text.includes(name)) &&
      mapping.context.accounts.filter((other) => other.name === row.name)
        .length === 1,
  );
  const categoryIds = mapping.context.categories.map((row) => row.id);

  /**
   * 模型直出的金额（分）。wire 契约只允许字符串，所以这里是形如 "1437" 的整数字符串。
   * 超出 9 位或 ≤ 0 一律视为没给：这些形状不可能是诚实的金额，留着只会污染账本。
   */
  function modelCents(raw: string | null | undefined): number | null {
    if (raw == null) return null;
    const trimmed = raw.trim();
    if (!/^[0-9]{1,9}$/.test(trimmed)) return null;
    const cents = Number(trimmed);
    return cents > 0 ? cents : null;
  }

  function oneOf(value: string | null, allowed: readonly string[]) {
    if (value === null) return null;
    return allowed.includes(value) ? value : null;
  }

  function decode(response: string) {
    const raw = parseModelFields(response);
    const amountIds = candidates.map((row) => row.id);
    // Only an omitted amount is derived; an explicit one must be a real candidate so the model
    // can never point the draft at a number the parser did not extract from the sentence.
    const derivedAmount =
      candidates.length === 1 && raw.status === "single" ? candidates[0].id : null;
    const amount =
      raw.amount == null ? derivedAmount : oneOf(raw.amount, amountIds);
    const value = {
      type: oneOf(
        raw.type ?? null,
        TYPES.filter((row): row is string => row !== null),
      ),
      amount,
      category: oneOf(raw.category ?? null, categoryIds),
      account: oneOf(
        raw.account ?? null,
        accounts.map((row) => row.id),
      ),
      to_account: oneOf(
        raw.to_account ?? null,
        accounts.map((row) => row.id),
      ),
      status: raw.status === "single" ? ("single" as const) : ("clarify" as const),
    };
    return {
      type: (value.type as NaturalLanguageTransactionType | null) ?? null,
      amount: value.amount,
      /** 金额以模型读到的数值为准；候选 ID 只做交叉核对与证据。 */
      amountCents: modelCents(raw.amountCents),
      category:
        value.category === null
          ? null
          : mapping.reverse.categories.get(value.category)!,
      account:
        value.account === null
          ? null
          : mapping.reverse.accounts.get(value.account)!,
      to_account:
        value.to_account === null
          ? null
          : mapping.reverse.accounts.get(value.to_account)!,
      status: value.status,
      note: refineNote(raw.note ?? null),
    };
  }

  return { decode, candidates, quantities, context: mapping.context };
}
