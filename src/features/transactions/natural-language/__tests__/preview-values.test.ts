import type { validateNaturalLanguageDecision } from "../validation";
import { naturalLanguagePreviewValues } from "../preview-values";

type Preview = ReturnType<typeof validateNaturalLanguageDecision>;

// validateNaturalLanguageDecision 的最小返回形状：preview-values 只读这些字段
function previewOf(overrides: Partial<Preview>): Preview {
  return {
    status: "needs_input",
    amountCents: 299,
    amountEvidence: null,
    currency: "CNY",
    type: "expense",
    categoryId: null,
    accountId: null,
    toAccountId: null,
    dateMs: Date.parse("2026-10-18T12:00:00+08:00"),
    note: "streaming",
    issues: ["category_required"],
    violations: [],
    accountEvidence: {
      mentions: [],
      directionVerified: false,
      confirmationFields: [],
    },
    dateConfirmation: false,
    ...overrides,
  } as Preview;
}

it("prefills the recognized currency instead of hardcoded CNY", () => {
  const values = naturalLanguagePreviewValues(previewOf({ currency: "USD" }));
  expect(values?.currency).toBe("USD");
  expect(values?.amount).toBe(299);
});

it("keeps CNY for RMB sentences", () => {
  const values = naturalLanguagePreviewValues(previewOf({ currency: "CNY" }));
  expect(values?.currency).toBe("CNY");
});
