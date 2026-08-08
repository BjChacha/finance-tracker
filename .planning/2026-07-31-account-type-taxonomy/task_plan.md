# Task Plan: Account Type Taxonomy Implementation Plan

## Goal

产出一份基于现有代码事实、可直接执行的账户类型分类实施计划，不在本阶段修改业务代码。

## Next Step

等待用户批准实施计划后进入 Code 模式。

## Current Phase

Complete

## Phases

### Phase 1: Codebase Discovery

- [x] Inspect database migration flow and schema versions
- [x] Inspect backup validation and upgrade order
- [x] Inspect account type consumers and import fallback
- [x] Inspect relevant tests and package scripts
- [x] Record findings in findings.md
- **Status:** complete

### Phase 2: Implementation Plan

- [x] Define file-by-file changes and dependency order
- [x] Define migration and backup compatibility test cases
- [x] Define validation commands
- [x] Write the implementation plan document
- **Status:** complete

### Phase 3: Review and Handoff

- [x] Check plan against the approved design
- [x] Check for placeholders, conflicts, and unsafe assumptions
- [x] Deliver the plan for user approval
- **Status:** complete

## Key Questions

1. How are local SQLite migrations registered and tested?
2. Does backup validation happen before or after version upgrading?
3. Where should the canonical account type order and fallback live?
4. Which existing tests can prove compatibility without broad refactoring?

## Decisions Made

| Decision | Rationale |
| --- | --- |
| Planning only in this phase | The user explicitly requested an implementation plan |
| Use an isolated `.planning` directory | Preserve the existing navigation task plan |
| Treat account type as classification only | Confirmed design; balance sign remains authoritative |
| Use a hand-written data migration | The database shape is unchanged, so Drizzle Kit cannot generate the required value normalization |
| Keep implementation validation layered | Pure mapping tests, migration packaging tests, backup tests, and Android smoke checks cover different failure modes |

## Errors Encountered

| Error | Attempt | Resolution |
| --- | --- | --- |
| `src/db/__tests__/migrate.test.ts` was not found | 1 | Record the absence and inspect existing database tests before selecting the test location |
| PowerShell parse error in a combined `rg` pattern | 1 | Replace the complex nested quoting with separate simple searches |

## Notes

- Approved design: `docs/superpowers/specs/2026-07-31-account-type-taxonomy-design.md`
- Final taxonomy contains nine types, including `stored_value_card`.
