import type { Account, Category } from "@/db/schema";
import type { NaturalLanguageContext } from "./context";

type AccountCandidate = Pick<Account, "id" | "name" | "archived" | "currency">;
type CategoryCandidate = Pick<
  Category,
  "id" | "name" | "type" | "parentId" | "archived"
>;

/** Read-only snapshot; corrupt or archived ancestry must never become a selectable category. */
export function createApplicationContext(
  accounts: readonly AccountCandidate[],
  categories: readonly CategoryCandidate[],
  now = new Date(),
) {
  const activeAccounts = accounts.filter((row) => row.archived === 0);
  const byId = new Map(categories.map((row) => [row.id, row]));
  const activeCategories = categories.filter((row) => {
    const seen = new Set<string>();
    let current: CategoryCandidate | undefined = row;
    while (current) {
      if (
        current.archived !== 0 ||
        current.type !== row.type ||
        seen.has(current.id)
      )
        return false;
      seen.add(current.id);
      if (current.parentId === null) return true;
      current = byId.get(current.parentId);
    }
    return false;
  });
  const context: NaturalLanguageContext = {
    now: now.toISOString(),
    accounts: activeAccounts.map(({ id, name }) => ({ id, name })),
    categories: activeCategories.map(({ id, name, type, parentId }) => ({
      id,
      name,
      type,
      parentId,
    })),
  };
  return {
    context,
    accountCurrencies: new Map(
      activeAccounts.map((row) => [row.id, row.currency]),
    ),
  };
}

export type ApplicationContext = ReturnType<typeof createApplicationContext>;
