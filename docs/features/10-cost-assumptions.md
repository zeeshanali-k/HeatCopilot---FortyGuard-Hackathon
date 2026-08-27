# Feature 10 — Editable Cost Assumptions (budget optimizer)

**User story:** As a city planner, I don't fully trust default cost numbers — I want to set what tree planting, shade structures, cool pavement, etc. cost *in my city*, and have the budget optimizer and action plans use my numbers.

Extends Feature 5 (budget optimizer). The default `INTERVENTION_COSTS` table stays as the out-of-box fallback; this feature lets the user override it.

## Cost model upgrade (flat → unit-based)

Flat per-zone costs are replaced by **unit pricing**, so estimates scale with zone content instead of being one fixed number per zone:

```js
// server/src/costs.js (new) — defaults, all clearly labeled estimates
const DEFAULT_COSTS = {
  tree_planting:    { unitLabel: 'tree',            unitsPerZone: 200, costPerUnitUsd: 600,   note: 'planted + 3yr maintenance' },
  shade_structures: { unitLabel: 'shade structure', unitsPerZone: 3,   costPerUnitUsd: 15000, note: 'bus-stop scale' },
  cool_pavement:    { unitLabel: 'lane-km',         unitsPerZone: 1,   costPerUnitUsd: 250000, note: 'coating, materials + labor' },
  school_cooling:   { unitLabel: 'school',          unitsPerZone: 1,   costPerUnitUsd: 180000, note: 'shade canopy + cool roof' },
  green_space:      { unitLabel: 'pocket park',     unitsPerZone: 1,   costPerUnitUsd: 300000, note: 'conversion incl. planting' },
};
```

Zone estimate = `units × costPerUnitUsd`, where `units` defaults to `unitsPerZone` but is nudged by zone data when obvious (e.g., shade structures scale with `assets.busStops`, capped at unitsPerZone × 2). Estimates display with "~" and a tooltip, per design guidelines.

## Backend changes

- [ ] `costs.js`: default table + `estimateZoneCost(zone, costs)` pure function (+ unit test)
- [ ] `POST /api/allocate` accepts optional `costOverrides` (same shape as the table); merges over defaults, validates (numbers ≥ 0, unknown keys rejected with `invalid_request`), and echoes the **effective costs** in the response meta so the UI shows exactly what was used
- [ ] `/api/prioritize` zone responses keep working unchanged (costs only matter at allocation time)

## Frontend changes

- [ ] **Cost assumptions editor** — a disclosure section ("Adjust cost estimates") inside the budget optimizer UI in ResultsPanel, next to the budget input. Per intervention row: label, unit label, editable `unitsPerZone` and `costPerUnitUsd` numeric inputs, and the note as a tooltip. "Reset to defaults" button.
- [ ] Overrides persist to `localStorage` (`heatcopilot:costs:v1`) and are sent with every `/api/allocate` call.
- [ ] After editing, "Optimize" re-runs with the new costs; funded/unfunded split updates in place.
- [ ] Everywhere a cost appears (allocation list, summary bar, ZoneCard, Feature 8 action-plan `budget` context), the effective (possibly overridden) values are used — one source of truth from the allocate response meta.

## Acceptance criteria

- Edit "tree" cost $600 → $900 → re-optimize: funded set and totals change accordingly; summary bar math is consistent.
- Reload the page → overrides persist; Reset restores defaults.
- Invalid input (negative, non-numeric) is blocked client-side and rejected server-side.
- Action-plan narrative (Feature 8) quotes the overridden cost, not the default.
- Defaults view shows the "estimates only" disclaimer near the editor.

## Depends on

Feature 5 (budget optimizer exists). Feeds Feature 8's `budget` context. ~0.5–1 day.
