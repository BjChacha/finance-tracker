# Budget System Redesign

> Status: Approved baseline (2026-08). Replaces the legacy monthly-only budget.
> Scope: data model, allocation constraints, period engine (month/quarter/year),
> UI, DB migration, backup upgrade chain.

## 1. Background & Goals

The legacy budget was monthly-only with no relationship between the total budget
and category budgets — category budgets could be set arbitrarily and their sum
could exceed the total. This redesign introduces a principled budget system.

Hard requirements:

1. Budgets support **month / quarter / year** periods.
2. Budgets support a **total budget** and **category budgets**, where category
   budgets are **allocated under** the total budget.

Confirmed design decisions:

| Decision | Choice |
|---|---|
| Allocation model | **Envelope / allocation** — sum(category) ≤ total, enforced |
| Period structure | Each of month/quarter/year has its own complete total+category set |
| Rollover | **Out of MVP**; schema leaves room for a future `budget_balances` table |
| Quarter definition | **Natural quarter** Q1–Q4 (year = calendar year) |

## 2. Budget Philosophy

Informed by industry research (YNAB, Monarch, Copilot, MoneyWiz, Monefy):

- **Allocation (envelope) method**: the total budget is a pool of money; each
  category budget is an *allocation* drawn from that pool. The unallocated
  remainder is surfaced explicitly as "to-be-allocated". This is the strongest
  reading of "category budgets sit under the total budget".
- **Three time horizons**: month = microscope (daily spend), quarter = seasonal
  spend (rent paid quarterly, insurance), year = telescope (annual travel, big
  items). Each horizon is managed independently because their category mix differs.
- **No rollover (MVP)**: a period resets cleanly when it ends. Keeps the data
  model simple; a balances table can be added later without reshaping `budgets`.

## 3. Data Model

### 3.1 `budgets` table (revised)

```
budgets
  id          text PK
  period      text NOT NULL DEFAULT 'month'   -- 'month' | 'quarter' | 'year'  (NEW)
  categoryId  text nullable                    -- NULL = total budget for that period
  amount      integer NOT NULL                 -- limit for this period (cents)
  alertPct    integer NOT NULL DEFAULT 80
  enabled     integer NOT NULL DEFAULT 1
  createdAt   integer NOT NULL
  updatedAt   integer NOT NULL
  UNIQUE(period, categoryId)                    -- was UNIQUE(categoryId)
```

One row = "one period × (total | one category)" limit.

- `(period, NULL)` = total budget for that period.
- `(period, catId)` = category budget for that period (top-level expense categories only).
- A single table + `period` column keeps the allocation-sum check in one place and
  makes period switching natural. Splitting into three tables would force the
  sum-vs-total constraint to span tables for no benefit.

### 3.2 Why not a separate allocations table

Category budgets *are* the allocations. Adding an `allocations` table would
duplicate the category↔amount mapping already held by `budgets`. The envelope
model is expressed purely as a **constraint over existing rows**, not extra rows.

## 4. Allocation Constraints (envelope)

Enforced in `upsertBudget`, all per-period:

1. **Total must exist first**: setting a category budget requires an existing
   `(period, NULL)` total budget; otherwise reject.
2. **Sum must not exceed total**:
   `Σ(existing category budgets for period) + this amount ≤ total amount`.
   On violation, reject with the over-allocation delta.
3. **Total-shrink protection**: lowering the total below the current
   `Σ(category)` warns of conflict; the user must adjust categories first.

Together these guarantee category budgets are always a subset allocation of the
total.

## 5. Period Engine

Natural periods only (deterministic date → period mapping).

| Period | periodKey format | Range |
|---|---|---|
| month | `YYYY-MM` | first..last day of month |
| quarter | `YYYY-Qn` (n=1..4) | Q1=1–3月 … Q4=10–12月 |
| year | `YYYY` | Jan 1 .. Dec 31 |

New helpers in `lib/date.ts`:

- `toPeriodKey(dateKey, period)` → periodKey
- `periodRange(period, periodKey)` → `[startKey, endKey]`
- `currentPeriodKey(period, refKey?)` → periodKey for a given date
- `daysRemainingInPeriod(period, periodKey, todayKey?)` → days incl. today
  (0 for past periods; full span for future periods)

## 6. Spend Aggregation

`budgetStatus(period, periodKey)` reuses the existing aggregation, scoped by
`periodRange` instead of `monthRange`:

- **Category budgets**: expense rows in range, rolled up to top-level category
  (subcategories count toward parent — unchanged logic).
- **Total budget**: expense base-cents + transfer fee (converted to base) in range
  — same caliber as `monthSummary`.
- **Daily available**: `remaining / daysRemainingInPeriod`.

## 7. Alerts

`checkBudgetsAfterTransaction` checks the transaction against the budgets of
*all three periods* that its date falls into (month / quarter / year). The same
dedup key scheme (`budget-alert:<id>:<periodKey>:<tier>`) prevents repeat firing
per budget per period per tier.

## 8. UI (`app/budgets.tsx`)

- **Period segment** (month / quarter / year) at the top, replacing the
  month-only switcher.
- **periodKey switcher** below: month = year-month, quarter = year+Q, year = year.
- **Total card**: limit / spent / remaining / daily / progress bar; when category
  budgets exist, an extra row "allocated ¥X / to-allocate ¥Y".
- **Category list**: same row design (icon + bar + remaining).
- **Editor**: pick period (on add), pick top-level expense category, amount,
  alertPct; on save the allocation constraint is validated and surfaced.

## 9. Migration

| Layer | Change |
|---|---|
| DB migration `0004_budget_periods` | `ALTER TABLE budgets ADD COLUMN period TEXT NOT NULL DEFAULT 'month'`; rebuild unique index `uq_budgets_category` → `uq_budgets_period_category(period, category_id)` |
| `BACKUP_SCHEMA_VERSION` | 4 → 5 |
| backup upgrader `4 → 5` | backfill `period: 'month'` on legacy budget rows |
| `budgetRowSchema` | add `period: z.enum(['month','quarter','year'])` |
| Roll-forward | existing budgets auto become month budgets — semantics unchanged, user-invisible |

Index rebuild in SQLite requires `DROP INDEX` + `CREATE INDEX`. Since the legacy
unique index was on a nullable column (total = NULL category), and we now key on
`(period, categoryId)`, the rebuild is safe.

## 10. Implementation Checklist

1. `lib/date.ts` — period helpers + unit tests.
2. `db/schema.ts` — add `period` column + composite unique index.
3. `db/migrations/0004_budget_periods.sql` + journal entry + `migrations.js` import.
4. `db/backup-version.ts` 4→5; `backup/upgraders.ts` v4→v5; `backup/schema.ts` row schema.
5. `features/budgets/repository.ts` — allocation constraints, period-aware status,
   allocation summary helper; unit tests.
6. `features/budgets/transform.ts` — period-aware `dailyAvailable`.
7. `features/budgets/alerts.ts` — three-period check.
8. `features/budgets/hooks.ts` + `index.ts` — period in query keys & signatures.
9. `i18n/zh.ts` — period / allocation / to-allocate / constraint copy.
10. `app/budgets.tsx` — period segment, allocation display, constraint UX.
11. `npm run typecheck` + `npm test`.
12. Android emulator: three-period setup, envelope-constraint blocking,
    cross-period aggregation, post-transaction alerts.

## 11. Verification

- `npm run typecheck` and `npm test` (focus: period helpers, allocation
  constraint, upgrader v4→v5).
- `npm run android` on emulator: period switch, constraint blocking, spend rollup
  across periods, post-transaction alerts.
- Backup round-trip: export → mutate → restore, confirm a v4 backup upgrades.

## 12. Future Evolution (out of MVP)

- **Rollover**: add `budget_balances(period, periodKey, categoryId, carriedCents)`
  computed at period close. The current `budgets` schema already accommodates this
  without reshape.
- **Budget templates / copying** a month's allocation to the next period.
- **Income budgets** (currently expense-only).
