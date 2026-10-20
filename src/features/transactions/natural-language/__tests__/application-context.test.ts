import { createApplicationContext } from "../application-context";
import { naturalLanguagePreviewValues } from "../preview-values";
import { validateNaturalLanguageDecision } from "../validation";

const now = new Date("2026-10-18T12:00:00+08:00");
const categories = [
  {
    id: "food",
    name: "Food",
    type: "expense" as const,
    parentId: null,
    archived: 0,
  },
  {
    id: "lunch",
    name: "Lunch",
    type: "expense" as const,
    parentId: "food",
    archived: 0,
  },
];

it("uses current IDs and keeps identically named accounts distinct", () => {
  const result = createApplicationContext(
    [
      { id: "cash-1", name: "Cash", currency: "CNY", archived: 0 },
      { id: "cash-2", name: "Cash", currency: "USD", archived: 0 },
      { id: "old", name: "Old", currency: "CNY", archived: 1 },
    ],
    categories,
    now,
  );
  expect(result.context.accounts.map((row) => row.id)).toEqual([
    "cash-1",
    "cash-2",
  ]);
  expect(result.context.categories.map((row) => row.id)).toEqual([
    "food",
    "lunch",
  ]);
  expect(result.accountCurrencies.get("cash-2")).toBe("USD");
  expect(result.context.now).toBe(now.toISOString());
});

it("excludes archived, orphaned, cyclic and cross-type category ancestry", () => {
  const result = createApplicationContext(
    [],
    [
      ...categories,
      { id: "old", name: "Old", type: "expense", parentId: null, archived: 1 },
      {
        id: "child",
        name: "Child",
        type: "expense",
        parentId: "old",
        archived: 0,
      },
      {
        id: "orphan",
        name: "Orphan",
        type: "expense",
        parentId: "missing",
        archived: 0,
      },
      {
        id: "cycle",
        name: "Cycle",
        type: "expense",
        parentId: "cycle",
        archived: 0,
      },
      {
        id: "wrong",
        name: "Wrong",
        type: "income",
        parentId: "food",
        archived: 0,
      },
    ],
    now,
  );
  expect(result.context.categories.map((row) => row.id)).toEqual([
    "food",
    "lunch",
  ]);
});

function preview() {
  const { context } = createApplicationContext(
    [{ id: "cash", name: "Cash", currency: "CNY", archived: 0 }],
    categories,
    now,
  );
  return validateNaturalLanguageDecision("Cash lunch 30", context, {
    status: "single",
    type: "expense",
    amount: null,
    amountCents: null,
    category: "lunch",
    account: "cash",
    to_account: null,
    note: "lunch",
  });
}

it("clears only ambiguous fields and never replaces them with defaults", () => {
  const result = naturalLanguagePreviewValues({
    ...preview(),
    amountCents: 3000,
    issues: ["account_confirmation_required"],
    dateMs: null,
  });
  expect(result).toEqual({
    type: "expense",
    amount: 3000,
    toAccountId: null,
    categoryId: "lunch",
    note: "\u3010\u667a\u80fd\u8bc6\u522b\u3011lunch",
    currency: "CNY",
  });
  expect(result).not.toHaveProperty("accountId");
  expect(result).not.toHaveProperty("dateMs");
});

it("requires re-entry for uncertain transaction eligibility", () => {
  expect(
    naturalLanguagePreviewValues({
      ...preview(),
      issues: ["not_clear_single"],
    }),
  ).toBeNull();
});

it("does not prefill a guessed transfer direction", () => {
  const result = naturalLanguagePreviewValues({
    ...preview(),
    type: "transfer",
    accountId: "cash",
    toAccountId: "bank",
    issues: [
      "account_direction_confirmation_required",
      "to_account_direction_confirmation_required",
    ],
  });
  expect(result?.accountId).toBeUndefined();
  expect(result?.toAccountId).toBeNull();
});
