# Navigation, Sheets, and Floating Tabs

## Goal

Implement the approved navigation, secondary-sheet motion, quick-keypad motion, and floating capsule tab bar plan without overwriting unrelated working-tree changes.

## Phases

### Phase 1: Foundations
Status: completed

- Add shared motion tokens and secondary-sheet infrastructure.
- Add floating-tab inset utilities.
- Configure root route presentations and tab back behavior.

### Phase 2: Quick keypad
Status: completed

- Align React keypad motion.
- Align Android activity animation resources and result-mode launch behavior.

### Phase 3: Core routes
Status: completed

- Migrate add transaction, quick add, and transaction detail.
- Verify close/save/delete navigation behavior.

### Phase 4: Remaining secondary routes
Status: completed

- Migrate transaction, account, category, project, recurring, appearance, rates, and backup routes.
- Keep import full screen.

### Phase 5: Floating tabs
Status: completed

- Add the glass/fallback capsule surface.
- Update every tab scene and the overview FAB for the overlay inset.

### Phase 6: Verification
Status: completed

- Run typecheck, Jest, and Android release build.
- Inspect the final scoped diff and document manual device checks.

## Decisions

- Use custom transparent-modal sheets to keep identical cross-platform timing and easing.
- Use `250ms` enter, `200ms` exit, and cubic Bézier `(0.22, 1, 0.36, 1)`.
- Preserve material top tabs, horizontal swiping, prefetching, and quick-add handoff instrumentation.
- Keep import full screen and tertiary pickers unchanged.
- Use native glass on supported iOS versions and a themed solid fallback elsewhere.

## Errors Encountered

| Error | Attempt | Resolution |
|---|---:|---|
| `npm install expo-glass-effect@~57.0.0` failed with `ERR_INVALID_URL` after peer-resolution warnings | 1 | The exact SDK 57 package was already present transitively in `node_modules` and the lockfile; added it to the root manifests without another network operation. |
| Initial typecheck rejected `StyleSheet.absoluteFillObject` under React Native 0.86 types | 1 | Replaced both spreads with explicit absolute-position edges. |
| Initial Android release build could not download Gradle in the sandbox | 1 | Re-ran the same build with approved network access; the release build completed successfully. |
