# Findings & Decisions

## Requirements

- Add nine account types: cash, bank, digital wallet, stored-value card, credit card, online credit, investment, long-term asset, and other.
- Display `online_credit` as “网络信用账户”.
- Keep asset/liability calculation based on balance sign.
- Map legacy `cash`, `bank`, `credit`, and `other` to semantic equivalents.
- Map legacy `alipay`, `wechat`, and unknown values to `other`.
- Keep imported unknown accounts as `other`.
- Preserve old database and backup compatibility.

## Research Findings

- Current `AccountType` is declared in `src/db/schema.ts`.
- Current account type order is duplicated in `app/accounts/edit.tsx` and `app/(tabs)/assets.tsx`.
- Current backup schema accepts only the six legacy values.
- Current import pipeline creates unknown accounts with `type: 'other'`.
- The working tree contains many unrelated user changes; implementation must use narrow patches.
- Drizzle migrations are registered manually in `src/db/migrations/migrations.js` and `meta/_journal.json`; the next migration is `0003`.
- `src/db/migrate.ts` runs registered Drizzle migrations synchronously during module evaluation.
- There is currently no `src/db/__tests__/migrate.test.ts`; migration coverage needs a new focused strategy or SQL-level assertion.
- Backup schema version is `3`. Restore validates only the envelope first, runs the upgrade chain, then applies the strict current schema.
- A `v3 -> v4` backup upgrader can therefore normalize legacy account types before the new enum is validated.
- Expo SDK 57 SQLite documentation confirms persisted databases and versioned migration initialization; the project’s existing Drizzle migration layer should remain the single migration mechanism.
- Only three UI consumers index account type labels: account edit, account list, and the assets grouping screen.
- `app/accounts/edit.tsx` and `app/(tabs)/assets.tsx` duplicate the legacy type order; both can consume one canonical tuple.
- Asset/liability totals in `app/(tabs)/assets.tsx` depend only on converted balance sign and do not branch on account type.
- The default seeded account is already `cash`; no seed behavior change is required.
- The only import behavior tied to account type is account creation with `other`; no adapter-specific mapping needs modification.
- A data-only migration is required. Drizzle Kit will not infer it from a TypeScript union change, so the SQL file, journal entry, and runtime import must be added explicitly.
- Babel already inlines `.sql` imports, matching the existing migration registry.
- Because the SQLite table shape does not change, the current Drizzle snapshot can remain unchanged for this data-only migration.
- There is no existing `docs/superpowers/plans` directory; the implementation plan will create it.
- The project has no TypeScript declaration for direct `.sql` imports; runtime migration loading works through the existing JavaScript registry and Babel inline-import plugin.
- Jest does not provide an obvious real SQLite integration harness for this project. Automated migration coverage should verify the pure mapping plus registry/SQL integrity, while actual upgrade execution is covered by an Android smoke check.

## Technical Decisions

| Decision | Rationale |
| --- | --- |
| Centralize account type order in the accounts feature | Prevent UI ordering drift |
| Preserve `other` as the import and runtime fallback | Avoid unsafe name-based inference |
| Bump backup schema from 3 to 4 | Account type values change in exported data |
| Add a pure legacy account type normalizer | Reuse the same deterministic mapping in backup and defensive runtime paths |
| Place canonical persisted values beside the database schema | Avoid a database-to-feature dependency while allowing feature re-exports |
| Normalize account types at the repository boundary | Prevent unexpected persisted strings from hiding groups or producing missing labels |
| Do not generate a new Drizzle snapshot for the data-only migration | No table, column, index, or constraint changes occur |
| Separate mapping correctness from migration wiring tests | Pure unit tests validate semantics; registry/SQL assertions validate packaging; device smoke testing validates native execution |

## Issues Encountered

| Issue | Resolution |
| --- | --- |
| Expected migration test file does not exist | Plan a new focused migration test instead of modifying a nonexistent test |

## Resources

- `docs/superpowers/specs/2026-07-31-account-type-taxonomy-design.md`
- Expo SDK 57 SQLite documentation: https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/
