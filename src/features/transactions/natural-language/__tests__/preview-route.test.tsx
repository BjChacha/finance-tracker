import { act, fireEvent, render, screen } from "@testing-library/react-native";
import copy from "../labels.json";
import NaturalLanguageTransactionScreen from "../../../../../app/natural-language-transaction";
import { ParseError } from "../deepseek";
import { loadNaturalLanguageContext } from "../load-context";
import { parseTransactionText } from "../remote-parser";

const mockForm = jest.fn();
const mockSheet = jest.fn();
let mockSource: string | undefined;
let mockIdSeq = 0;

// newId depends on expo-crypto (unavailable under Jest); a counter keeps each
// parse's idempotency key unique and assertable.
jest.mock("@/lib/id", () => ({
  newId: () => `gen-id-${++mockIdSeq}`,
}));

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ source: mockSource }),
  useRouter: () => ({
    back: jest.fn(),
    replace: jest.fn(),
    canGoBack: () => true,
  }),
}));
jest.mock("@/components/Icon", () => ({ Icon: () => null }));
jest.mock("@/theme", () => ({
  motion: { fast: 80 },
  useTheme: () => ({
    colors: {
      primary: "#F59E0B",
      onPrimary: "#1C1917",
      text: "#FAFAF9",
      textSecondary: "#A8A29E",
      card: "#1C1917",
      border: "#292524",
      background: "#0C0A09",
      warning: "#EAB308",
      expense: "#EF4444",
    },
  }),
}));
jest.mock("@/components/navigation/secondary-sheet-screen", () => ({
  SecondarySheetScreen: (props: { children: React.ReactNode }) => {
    mockSheet(props);
    return props.children;
  },
  SheetHeaderIconButton: () => null,
}));
jest.mock("@/features/transactions/components/TransactionForm", () => ({
  TransactionForm: (props: unknown) => {
    mockForm(props);
    return null;
  },
}));
jest.mock("@/features/transactions/hooks", () => ({
  useCreateTransaction: () => ({ isPending: false, mutateAsync: jest.fn() }),
}));
jest.mock("../load-context", () => ({ loadNaturalLanguageContext: jest.fn() }));
jest.mock("../remote-parser", () => ({ parseTransactionText: jest.fn() }));

const snapshot = {
  context: { now: "2026-10-18T00:00:00Z", accounts: [], categories: [] },
  accountCurrencies: new Map<string, string>(),
};

const preview = (overrides: Record<string, unknown> = {}) => ({
  status: "preview" as const,
  amountCents: 2800,
  amountEvidence: null,
  currency: "CNY",
  type: "expense" as const,
  categoryId: "cat-food",
  accountId: "acc-cash",
  toAccountId: null,
  dateMs: Date.parse("2026-10-18T00:00:00+08:00"),
  note: "午饭",
  issues: [] as string[],
  violations: [] as string[],
  accountEvidence: {},
  dateConfirmation: false,
  ...overrides,
});

function type(text: string) {
  fireEvent.changeText(screen.getByLabelText(copy.title), text);
}

async function submit() {
  await act(async () => {
    fireEvent.press(screen.getByLabelText(copy.submit));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSource = undefined;
  jest.mocked(loadNaturalLanguageContext).mockResolvedValue(snapshot);
});

it("parses the typed sentence once and prefills the shared form", async () => {
  jest
    .mocked(parseTransactionText)
    .mockResolvedValue({ preview: preview() } as never);
  render(<NaturalLanguageTransactionScreen />);
  type("午饭 28");
  await submit();
  expect(parseTransactionText).toHaveBeenCalledTimes(1);
  expect(parseTransactionText).toHaveBeenCalledWith(
    "午饭 28",
    snapshot.context,
    expect.objectContaining({ signal: expect.anything() }),
  );
  const props = mockForm.mock.calls.at(-1)?.[0];
  expect(props.initialValues).toEqual({
    type: "expense",
    amount: 2800,
    accountId: "acc-cash",
    toAccountId: null,
    categoryId: "cat-food",
    dateMs: Date.parse("2026-10-18T00:00:00+08:00"),
    note: "【智能识别】午饭",
    currency: "CNY",
  });
  // Reuses the shared form's account prediction instead of inventing its own default.
  expect(props.prefillPolicy).toBe("suggest");
  // Saving is no longer gated behind a manual confirmation step.
  expect(props.saveBlockedReason).toBeUndefined();
});

it("explains that the account was predicted when the sentence does not name one", async () => {
  jest
    .mocked(parseTransactionText)
    .mockResolvedValue({ preview: preview({ accountId: null }) } as never);
  render(<NaturalLanguageTransactionScreen />);
  type("午饭 28");
  await submit();
  expect(mockForm.mock.calls.at(-1)?.[0].initialValues.accountId).toBeUndefined();
  expect(screen.getByText(copy.reviewPredictedAccount)).toBeTruthy();
});

it("keeps the neutral banner when the sentence names the account", async () => {
  jest
    .mocked(parseTransactionText)
    .mockResolvedValue({ preview: preview() } as never);
  render(<NaturalLanguageTransactionScreen />);
  type("午饭 28");
  await submit();
  expect(screen.getByText(copy.review)).toBeTruthy();
  expect(screen.queryByText(copy.reviewPredictedAccount)).toBeNull();
});

it("refuses to invent a note when the model returns none", async () => {
  jest
    .mocked(parseTransactionText)
    .mockResolvedValue({ preview: preview({ note: "" }) } as never);
  render(<NaturalLanguageTransactionScreen />);
  type("午饭 28");
  await submit();
  expect(mockForm.mock.calls.at(-1)?.[0].initialValues.note).toBe("");
});

it("mints a fresh idempotency key per parse instead of a constant client tag", async () => {
  jest
    .mocked(parseTransactionText)
    .mockResolvedValue({ preview: preview() } as never);
  render(<NaturalLanguageTransactionScreen />);
  type("午饭 28");
  await submit();
  const first = mockForm.mock.calls.at(-1)?.[0].clientTag;
  // Back to the composer and parse again: a second preview must not reuse the tag,
  // otherwise the unique client_tag index silently collapses the save into the
  // first transaction (onConflictDoNothing returns the existing row id).
  await act(async () => {
    fireEvent.press(screen.getByLabelText(copy.editText));
  });
  type("打车 15");
  await submit();
  const second = mockForm.mock.calls.at(-1)?.[0].clientTag;
  expect(first).toMatch(/^natural-language:/);
  expect(second).toMatch(/^natural-language:/);
  expect(first).not.toBe(second);
});

it("asks for an explicit date when the sentence has none", async () => {
  jest
    .mocked(parseTransactionText)
    .mockResolvedValue({ preview: preview({ dateMs: null }) } as never);
  render(<NaturalLanguageTransactionScreen />);
  type("午饭 28");
  await submit();
  expect(screen.getByText(copy.dateReview)).toBeTruthy();
  expect(mockForm.mock.calls.at(-1)?.[0].dateSelectionRequiredMessage).toBe(
    copy.dateReview,
  );
});

it("explains a clarification instead of opening the form", async () => {
  jest
    .mocked(parseTransactionText)
    .mockResolvedValue({
      preview: preview({ status: "needs_input", type: null }),
    } as never);
  render(<NaturalLanguageTransactionScreen />);
  type("午餐18元，公交2元");
  await submit();
  expect(screen.getByText(copy.clarifyTitle)).toBeTruthy();
  expect(screen.getByText(copy.clarify)).toBeTruthy();
  expect(mockForm).not.toHaveBeenCalled();
});

it("maps a transport failure to actionable copy and retries the same text", async () => {
  jest
    .mocked(parseTransactionText)
    .mockRejectedValueOnce(new ParseError("rate_limited", "429"))
    .mockResolvedValueOnce({ preview: preview() } as never);
  render(<NaturalLanguageTransactionScreen />);
  type("午饭 28");
  await submit();
  expect(screen.getByText(copy.failures.rate_limited)).toBeTruthy();
  await act(async () => {
    fireEvent.press(screen.getByLabelText(copy.retry));
  });
  expect(parseTransactionText).toHaveBeenCalledTimes(2);
  expect(mockForm).toHaveBeenCalled();
});

it("keeps the sentence when the user goes back to editing", async () => {
  jest
    .mocked(parseTransactionText)
    .mockResolvedValue({
      preview: preview({ status: "needs_input", type: null }),
    } as never);
  render(<NaturalLanguageTransactionScreen />);
  type("午餐18元，公交2元");
  await submit();
  await act(async () => {
    fireEvent.press(screen.getByLabelText(copy.editText));
  });
  expect(screen.getByLabelText(copy.title).props.value).toBe("午餐18元，公交2元");
});

it("marks the launcher entry and starts the desktop scrim at the sheet value", async () => {
  mockSource = "launcher";
  render(<NaturalLanguageTransactionScreen />);
  expect(mockSheet.mock.calls.at(-1)?.[0]).toMatchObject({
    title: copy.title,
    initialScrimOpacity: 0.38,
  });
});
