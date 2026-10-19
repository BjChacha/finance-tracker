import catalogData from "./semantic-catalog.json";

export type NaturalLanguageTransactionType = "expense" | "income" | "transfer";
export type NaturalLanguageAccount = {
  id: string;
  name: string;
  active?: boolean;
  aliases?: readonly string[];
};
export type NaturalLanguageCategory = {
  id: string;
  name: string;
  type: NaturalLanguageTransactionType;
  parentId?: string | null;
  archived?: boolean;
  examples?: readonly string[];
};
export type NaturalLanguageContext = {
  now: string;
  accounts: readonly NaturalLanguageAccount[];
  categories: readonly NaturalLanguageCategory[];
};

const catalog: Readonly<Record<string, string>> = catalogData;

function segment(name: string): string {
  if (!name.trim()) throw new Error("Candidate names must be nonempty");
  return name
    .replace(/\\/g, "\\\\")
    .replace(/\//g, "\\/")
    .replace(/#/g, "\\#")
    .replace(/</g, "\uff1c")
    .replace(/>/g, "\uff1e");
}

function identifiers<T extends { id: string }>(
  rows: readonly T[],
): Map<string, T> {
  const result = new Map<string, T>();
  for (const row of rows) {
    if (!row.id || result.has(row.id))
      throw new Error("Invalid or duplicate candidate identifier");
    result.set(row.id, row);
  }
  return result;
}

function categoryPath(
  row: NaturalLanguageCategory,
  byId: ReadonlyMap<string, NaturalLanguageCategory>,
): string {
  const names: string[] = [];
  const seen = new Set<string>();
  let current = row;
  while (true) {
    if (seen.has(current.id)) throw new Error("Cyclic category hierarchy");
    seen.add(current.id);
    names.push(segment(current.name));
    if (current.parentId == null) return names.reverse().join("/");
    const parent = byId.get(current.parentId);
    if (!parent) throw new Error("Category parent must be active");
    current = parent;
  }
}

function labelMapping(ids: readonly string[], paths: readonly string[]) {
  const counts = new Map<string, number>();
  for (const path of paths) counts.set(path, (counts.get(path) ?? 0) + 1);
  const forward = new Map<string, string>();
  const reverse = new Map<string, string>();
  paths.forEach((path, index) => {
    const label = counts.get(path) === 1 ? path : `${path}#${index}`;
    if (reverse.has(label)) throw new Error("Candidate labels must be unique");
    forward.set(ids[index], label);
    reverse.set(label, ids[index]);
  });
  return { forward, reverse };
}

/** Wire labels are request-local aliases, never persistent category or account IDs. */
export function mapNaturalLanguageContext(context: NaturalLanguageContext) {
  const accounts = context.accounts.filter((row) => row.active !== false);
  const categories = context.categories.filter((row) => !row.archived);
  identifiers(accounts);
  const byId = identifiers(categories);
  const accountMapping = labelMapping(
    accounts.map((row) => row.id),
    accounts.map((row) => {
      const path = segment(row.name);
      return Object.hasOwn(catalog, `account/${path}`)
        ? catalog[`account/${path}`]
        : path;
    }),
  );
  const categoryMapping = labelMapping(
    categories.map((row) => row.id),
    categories.map((row) => {
      const path = categoryPath(row, byId);
      const key = `${row.type}/${path}`;
      return Object.hasOwn(catalog, key) ? catalog[key] : path;
    }),
  );
  return {
    context: {
      ...context,
      accounts: accounts.map((row) => ({
        ...row,
        id: accountMapping.forward.get(row.id)!,
      })),
      categories: categories.map((row) => ({
        ...row,
        id: categoryMapping.forward.get(row.id)!,
        ...(row.parentId != null
          ? { parentId: categoryMapping.forward.get(row.parentId)! }
          : {}),
      })),
    },
    reverse: {
      accounts: accountMapping.reverse,
      categories: categoryMapping.reverse,
    },
  };
}
