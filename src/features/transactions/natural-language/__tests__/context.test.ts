import fixture from "./context-parity.json";
import {
  mapNaturalLanguageContext,
  type NaturalLanguageContext,
} from "../context";

const empty: NaturalLanguageContext = {
  now: "2026-10-18T12:00:00+08:00",
  accounts: [],
  categories: [],
};

describe("Natural language context mapping", () => {
  it.each(fixture.records)("matches the frozen $name context", (record) => {
    const result = mapNaturalLanguageContext(
      record.input as NaturalLanguageContext,
    );
    expect(result.context).toEqual(record.context);
    expect(Object.fromEntries(result.reverse.accounts)).toEqual(
      record.reverse.accounts,
    );
    expect(Object.fromEntries(result.reverse.categories)).toEqual(
      record.reverse.categories,
    );
  });

  it("keeps duplicate names reversible and excludes inactive accounts", () => {
    const result = mapNaturalLanguageContext({
      ...empty,
      accounts: [
        { id: "first", name: "Wallet" },
        { id: "second", name: "Wallet" },
        { id: "closed", name: "Wallet", active: false },
      ],
    });
    expect(result.context.accounts.map((row) => row.id)).toEqual([
      "Wallet#0",
      "Wallet#1",
    ]);
    expect([...result.reverse.accounts.values()]).toEqual(["first", "second"]);
  });

  it("rejects missing parents, cycles, and duplicate identifiers", () => {
    expect(() =>
      mapNaturalLanguageContext({
        ...empty,
        categories: [
          { id: "child", name: "Child", type: "expense", parentId: "missing" },
        ],
      }),
    ).toThrow("Category parent must be active");
    expect(() =>
      mapNaturalLanguageContext({
        ...empty,
        categories: [
          { id: "cycle", name: "Cycle", type: "expense", parentId: "cycle" },
        ],
      }),
    ).toThrow("Cyclic category hierarchy");
    expect(() =>
      mapNaturalLanguageContext({
        ...empty,
        accounts: [
          { id: "same", name: "One" },
          { id: "same", name: "Two" },
        ],
      }),
    ).toThrow("duplicate candidate identifier");
  });

  it("escapes separators and preserves custom category hierarchy without mutating input", () => {
    const context: NaturalLanguageContext = {
      ...empty,
      categories: [
        { id: "parent", name: "Home/Work", type: "expense" },
        { id: "child", name: "<Tools>#1", type: "expense", parentId: "parent" },
      ],
    };
    const before = JSON.stringify(context);
    const result = mapNaturalLanguageContext(context);
    expect(result.context.categories[1].id).toBe(
      "Home\\/Work/\uff1cTools\uff1e\\#1",
    );
    expect(result.context.categories[1].parentId).toBe("Home\\/Work");
    expect(JSON.stringify(context)).toBe(before);
  });
});
