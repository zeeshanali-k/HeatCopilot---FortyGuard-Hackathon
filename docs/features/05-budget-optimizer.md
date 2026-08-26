# Feature 5 — Budget Optimizer

**User story:** As a city planner, I enter my heat-mitigation budget and get the maximum-impact set of zones and interventions it can fund.

Origin: `docs/winning-strategy-analysis.md` gap #1 — the strongest differentiator seen in previous winners (Polisense.AI pattern: help governments allocate limited resources).

## Scope

- Frontend: budget input field (USD) in ResultsPanel header, shown once zones are ranked.
- Backend: `POST /api/allocate` — takes ranked zones (or reuses `/api/prioritize` output server-side) + `budgetUsd` → greedy selection down the ranked list until budget is exhausted.
- Cost model: static, documented unit-cost table per intervention (rough municipal estimates, clearly labeled as estimates):

```js
const INTERVENTION_COSTS = {
  tree_planting:     { perZone: 120_000, note: "~200 trees @ $600 planted+maintained" },
  shade_structures:  { perZone:  45_000, note: "3 bus-stop shade structures @ $15k" },
  cool_pavement:     { perZone: 250_000, note: "~1 lane-km coating" },
  school_cooling:    { perZone: 180_000, note: "shade canopy + cool roof per school" },
  green_space:       { perZone: 300_000, note: "pocket park conversion" },
};
```

- Response: selected zones in priority order, per-zone intervention + cost, running total, **unfunded zones listed separately** ("next in line when more budget is available").
- Impact framing in UI: funded population exposure + funded danger-hours reduced (sums of already-computed zone stats — no new claims).

## Backend tasks

- [ ] `POST /api/allocate` route: `{ aoi, date, budgetUsd }` → `{ funded: [...], unfunded: [...], totalSpent, budgetUsd }`
- [ ] `allocate.js`: greedy selection (pure function) + unit test
- [ ] Cost table in one config module with sources noted as estimates

## Frontend tasks

- [ ] Budget input + "Optimize" button in ResultsPanel
- [ ] Funded zones get a "FUNDED" chip in the list and green outline on map; unfunded stay grey
- [ ] Summary bar: "$1.98M of $2M allocated · 7 zones funded · 41,200 danger-hours addressed"

## Acceptance criteria

- Enter $2M on the Phoenix analysis → funded/unfunded split renders; totals add up; selection order matches priority ranking.
- No invented precision: all costs display with "~" and a tooltip citing the estimate table.

## Depends on

Feature 3 (ranked zones with interventions). Zero new external API calls — pure computation on existing data.
