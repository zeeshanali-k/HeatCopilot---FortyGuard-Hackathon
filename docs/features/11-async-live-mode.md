# Feature 11 — Async Live Mode: stateless status pass-through

**Problem:** today the backend holds one HTTP request open for minutes while it polls FortyGuard (`fortyguard.js` `submitAndPoll`). On Vercel that exceeds the function duration limit; even locally it makes the progress timeline a fake wait and couples result-processing to submit-time.

**Idea:** make the backend stateless. No function invocation ever runs longer than a single upstream HTTP call. State lives in FortyGuard's own activity system (`activity_id`) — no database needed.

## New request lifecycle

1. **Submit** — `POST /api/hotspots` (etc.) → backend submits to FortyGuard, gets `activity_id`, returns it **immediately** (`202 Accepted`-style fast response, ~1s).
2. **Poll** — client polls `GET /api/status/:activityId?endpoint=heatmap` every 5s.
3. **Status pass-through** — each poll = one quick `GET /v1/status/{id}` upstream call. While `Processing`, the normalized status is returned as-is. On `Completed`, the backend runs result processing (marker extraction, zone scoring — pure JS, fast) and returns the **processed result** in the same shape the client already consumes. On `Failed`, a terminal error.

In `DEMO_MODE=fixtures`, submit returns a synthetic `fixture:<hash>` activity id and the first status poll returns `Completed` with the fixture result — the client code path is identical in both modes.

## Backend changes

- [ ] `fortyguard.js`: split `submitAndPoll` into `submitTask(endpoint, payload)` → `{ activityId }` and `fetchTaskStatus(activityId)` → raw upstream status. The polling loop is deleted from the server.
- [ ] `index.js` routes change shape:
  - `POST /api/hotspots` → `{ activityId, status: "Processing" }` (fixture mode: `{ activityId: "fixture:<key>", status: "Processing" }`)
  - `POST /api/duration` → same pattern
  - **New** `GET /api/status/:activityId?endpoint=heatmap|duration` → `{ status, ... }`; on Completed also `{ result }` (markers/zones, processed)
  - `POST /api/action-plan`, `POST /api/allocate` unchanged (already synchronous pure compute)
- [ ] Result processors become standalone functions invoked by the status route on Completed: `extractMarkers(heatmapResult)`, existing scoring/rules/benefits. On Completed, the result is also written to the fixture cache (local only; write guarded on Vercel).
- [ ] **Prioritize pipeline becomes client-orchestrated stages** (it chains several async upstream tasks — heatmap, env_params, segmentation — which can't run inside one function invocation):
  1. Client: submit heatmap stage → poll → Completed
  2. Client: submit env_params/segmentation stage → poll → Completed
  3. Client: `POST /api/prioritize/score` *(new)* with `{ aoi, date, stageResults }` → server runs grid + Overpass + scoring + interventions + benefits **synchronously** (pure compute + one Overpass call, ~1–3s) → ranked zones
  - The FeaturePanel progress timeline shows these as named stages ("Heatmap → Environment → Segmentation → Scoring"), which reads great in the demo.
- [ ] Status route input validation: unknown/expired `activityId` → 404 `activity_not_found` (FortyGuard 404 passes through).

## Frontend changes

- [ ] `client/src/hooks/usePollStatus.js` *(new)*: given `{ activityId, endpoint }`, polls `GET /api/status/...` every 5s with backoff cap, exposes `{ status, result, error, elapsedSeconds }`; stops on Completed/Failed; 10-min client-side budget.
- [ ] `api.js`: `findHotspots`/`fetchDuration` become `submitX` + polling hook consumption; `prioritize` becomes the staged sequence above.
- [ ] FeaturePanel progress timeline wired to **real** status values instead of the simulated wait (same component, real data).
- [ ] Store: track `pendingActivities` per feature so a rerender/refresh mid-run can resume polling (sessionStorage of activity ids — optional, low priority).

## API contract changes (`docs/api-contract.md`)

- `POST /api/hotspots` and `POST /api/duration` responses become `{ activityId, status }` — the old full-result body moves to the status route.
- New `GET /api/status/:activityId?endpoint=...` documented: `200 { status: "Processing" }` | `200 { status: "Completed", result: <endpoint-specific processed result> }` | terminal `{ status: "Failed" }`; errors: `404 activity_not_found`, `502 upstream_error`.
- New `POST /api/prioritize/score` documented: `{ aoi, date, stageResults }` → same `zones` response as today.
- `POST /api/prioritize` retained during migration as a thin alias (submit stage 1) or removed once the client is migrated — decide at implementation; update the contract accordingly.

## Acceptance criteria

- On Vercel (Hobby duration limits): full live-mode flow works end to end — no invocation exceeds ~3s; no `FUNCTION_INVOCATION_FAILED`.
- Fixture mode: client flow unchanged visually; first status poll completes instantly.
- Local dev: same commands, same UX, progress timeline shows real statuses and elapsed time.
- A Completed hotspot poll returns markers identical in shape to the current `/api/hotspots` response (client needs no result-shape migration).
- Failed upstream activity surfaces as a terminal error with retry in the UI.

## Depends on

Nothing new — refactors existing Features 1–3 plumbing. ~1 day. Deployed-demo blocker if live mode is wanted on Vercel; fixture mode already works without this.
