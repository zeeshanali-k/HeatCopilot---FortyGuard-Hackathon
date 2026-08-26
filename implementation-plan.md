# Implementation Plan — HeatCopilot

React frontend + thin Node backend. Companion docs: [`docs/api-contract.md`](docs/api-contract.md), [`docs/design-guidelines.md`](docs/design-guidelines.md). Product context: [`project-core-idea.md`](project-core-idea.md).

Feature-wise build plans (build and track in this order):

1. [`docs/features/01-find-hotspots.md`](docs/features/01-find-hotspots.md)
2. [`docs/features/02-heat-duration.md`](docs/features/02-heat-duration.md)
3. [`docs/features/03-prioritize-zones.md`](docs/features/03-prioritize-zones.md) ⭐ flagship
4. [`docs/features/04-action-plan.md`](docs/features/04-action-plan.md)
5. [`docs/features/05-budget-optimizer.md`](docs/features/05-budget-optimizer.md) ⭐ key differentiator (see [`docs/winning-strategy-analysis.md`](docs/winning-strategy-analysis.md))
6. [`docs/features/06-area-selection.md`](docs/features/06-area-selection.md) — manual draw + auto-viewport area visualization
7. [`docs/features/07-analysis-history.md`](docs/features/07-analysis-history.md) — saved analyses, multi-select, comparison view
8. [`docs/features/08-action-plan-v2.md`](docs/features/08-action-plan-v2.md) — quantitative, truncation-proof LLM briefings
9. [`docs/features/09-ui-motion-expanding-views.md`](docs/features/09-ui-motion-expanding-views.md) — shared motion foundation (per-feature motion merged into 01/03/07/08 + design guidelines)

Demo/pitch: [`docs/demo-script.md`](docs/demo-script.md).

## Do we need a backend? Yes — a thin one.

Calling FortyGuard and the LLM API directly from the browser fails on three grounds:

1. **CORS** — `api.fortyguard.com` is a server-to-server API; no indication it sends `Access-Control-Allow-Origin` headers, so browser `fetch` will be blocked. A proxy is required regardless.
2. **Key secrecy** — API keys would ship in the JS bundle. The demo link goes to judges; a leaked key = drained credits.
3. **Fixture caching** — demo reliability depends on pre-computed, cached responses (FortyGuard tasks take minutes and cost credits). The backend owns the cache: disk first, FortyGuard only on a miss.

**Stack: Node.js + Express** (not FastAPI) — one language across the repo, one `npm install`, faster iteration with AI coding agents. The backend is deliberately minimal: proxy + cache + scoring. Portable to Python in ~an hour if ever needed.

## Repo structure (monorepo, npm workspaces)

```
FortyGuard/
├── project-core-idea.md          (exists)
├── implementation-plan.md        (this file)
├── package.json                  (workspaces: client, server)
├── server/                       (thin backend)
│   ├── package.json
│   ├── .env.example              (FORTYGUARD_API_KEY, LLM_API_KEY, LLM_BASE_URL, DEMO_MODE)
│   ├── src/
│   │   ├── index.js              (Express app, routes)
│   │   ├── fortyguard.js         (submit → bounded poll → normalized result)
│   │   ├── cache.js              (fixture store; key = hash(AOI + date + mode + granularity))
│   │   ├── scoring.js            (priority score, pure functions)
│   │   ├── interventions.js      (rule engine, pure functions)
│   │   ├── osm.js                (Overpass: bus stops/schools in AOI)
│   │   └── llm.js                (action-plan narrative)
│   └── fixtures/                 (cached FortyGuard/OSM responses, committed for demo)
├── client/                       (React + Vite)
│   ├── package.json
│   └── src/
│       ├── main.jsx / App.jsx
│       ├── api.js                (calls our backend only)
│       ├── components/
│       │   ├── MapView.jsx       (MapLibre map, markers, heat overlay)
│       │   ├── SearchBox.jsx     (Nominatim geocoding, US-biased)
│       │   ├── FeaturePanel.jsx  (action buttons, progress timeline)
│       │   ├── MarkerPopup.jsx   (per-hotspot popup)
│       │   ├── ResultsPanel.jsx  (ranked zone list)
│       │   └── ZoneCard.jsx      (score breakdown + intervention + action plan)
│       └── state.js              (zustand store)
└── docs/
    ├── api-contract.md
    └── design-guidelines.md
```

## Backend design (server/)

### FortyGuard client (`fortyguard.js`)
- `submitAndPoll(endpoint, payload)` → POST, receive `activity_id`, poll `GET /v1/status/{id}` every 5s, max ~10 min, stop on Completed/Failed.
- Normalizes results into the contract shapes (see `docs/api-contract.md`); raw responses saved verbatim to `fixtures/`.
- `DEMO_MODE=fixtures`: never calls FortyGuard; serves only from `fixtures/` with a clear error on cache miss. This is the demo-safe mode.

### Endpoints

| Route | Purpose |
|---|---|
| `GET /api/health` | `{ ok, demoMode }` |
| `POST /api/hotspots` | Heatmap (`tcm`) over AOI → hotspot markers + heat tiles |
| `POST /api/duration` | `exceedance` + `persistence` over AOI → per-zone hours |
| `POST /api/prioritize` | Full pipeline → ranked, scored zones with interventions |
| `POST /api/action-plan` | LLM narrative for a zone (+ optional Heat Intelligence PDF) |

`/api/prioritize` pipeline: grid AOI into ~500m cells → heatmap (tcm + persistence) → env_params for top cells → satellite segmentation per top cell (fallback: OSM landuse) → Overpass assets → `scoring.js` → `interventions.js` → ranked zones. Per-step caching, so re-runs after earlier features are instant.

### Scoring (`scoring.js`)
`0.35×heat + 0.25×duration + 0.20×exposure + 0.20×greeneryDeficit`, each input normalized 0–100 across the returned zones. Pure functions, unit-tested with `node:test`.

### Intervention rules (`interventions.js`)
Rule table from `project-core-idea.md` §8: vegetation <15% + open space → tree planting; hot bus stops → shade structures; high asphalt % → cool pavement; school in high-persistence zone → school cooling; wet-bulb danger tier → priority escalation.

## Frontend design (client/)

React + Vite + MapLibre GL JS. State: zustand (single store). No router (one screen).

### Interaction flow
1. Map loads US-wide, constrained to US bounds (`maxBounds`). SearchBox flies to geocoded result.
2. **Find Hotspots** → `POST /api/hotspots` with viewport polygon → progress timeline (Submitted → Processing → Completed) → heat overlay + markers render.
3. Click marker → popup: area label, mean/max °C, peak hour, duration hrs + **"Analyze this zone"** button.
4. **Analyze this zone** → `POST /api/prioritize` for a ~1 km buffer around the marker → ZoneCard opens: score, 4 breakdown bars, intervention + reason, asset counts.
5. **Generate Action Plan** (in ZoneCard) → `POST /api/action-plan` → narrative in card with loading skeleton.
6. ResultsPanel lists all analyzed zones ranked; click → flyTo + open card.

## Build order (revised, ~4 days remaining: Aug 26 → Aug 30)

1. **Day 1 (Aug 26):** Monorepo scaffold; FortyGuard client + cache; verify plan tier (segmentation access, area cap) with one real call; Feature 1 backend end-to-end on Phoenix; save fixtures.
2. **Day 2 (Aug 27):** Feature 1 frontend (map, markers, popups) + Feature 2 (duration/peak hours) — parallelize frontend/backend if two people.
3. **Day 3 (Aug 28):** Feature 3 (prioritize: grid, scoring, rules, Overpass, ResultsPanel + ZoneCard) — the flagship must be solid today.
4. **Day 4 (Aug 29):** Feature 5 (budget optimizer — small, high pitch value) + Feature 4 (LLM narrative; fall back to template-generated briefing if time runs out).
5. **Day 5 (Aug 30):** Demo hardening in `DEMO_MODE=fixtures`, rehearse [`docs/demo-script.md`](docs/demo-script.md), record video, submit. Nothing new today.

**Dropped for time:** multi-city pre-computation, Heat Intelligence PDF, street-view segmentation, scoped Q&A stretch.

## Open items to verify on Day 1 (before committing scope)

- FortyGuard plan tier → satellite segmentation available? If not, OSM-landuse fallback for greenery (already designed).
- Heatmap area cap (Basic 10 mi² / Premium 50 mi²) → drives AOI size limit + chunking decision.
- LLM API available (any OpenAI-compatible endpoint; `llm.js` reads base URL + key from env).

## Out of scope

- No auth, no database, no user accounts (fixtures on disk suffice).
- No pre-computation beyond Phoenix (+ one optional backup city if time allows).
