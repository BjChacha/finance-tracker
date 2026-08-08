# Findings & Decisions

## Requirements
- Search all transaction history by primary amount, localized transaction type, category hierarchy, both accounts, note, and project.
- Numeric tokens use normalized display-prefix matching; text tokens use case-insensitive substring matching; tokens combine with AND.
- Share one animated transparent modal search experience between overview and all-transactions entry points.
- Keep search query and scroll state when opening and closing transaction details.

## Research Findings
- The repository already joins source account, destination account, category, and project.
- Categories are a two-level tree; joining a parent-category alias is sufficient for parent-to-child search.
- `SecondarySheetScreen` supplies consistent motion tokens but assumes one bottom card and fixed large height, so the dual-panel keyboard-aware experience should be a separate navigation primitive.
- `['transactions']` is already the mutation invalidation prefix, so `['transactions', 'search', query]` participates automatically.
- Expo SDK 57 standard Stack supports `transparentModal`; the project already uses that pattern with native animation disabled.

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Normalize full-width digits and decimal punctuation | Chinese input methods can emit full-width numeric characters |
| Escape LIKE metacharacters explicitly | `%`, `_`, and the escape character must be literal user text |
| Use date, createdAt, and id for the cursor | Produces deterministic ordering even when timestamps collide |
| Hide results during the 180 ms debounce window | Prevents stale results from appearing under a new query |

## Resources
- https://docs.expo.dev/versions/v57.0.0/
- https://docs.expo.dev/versions/v57.0.0/sdk/router/stack/

