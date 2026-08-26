# Feature 3 — Prioritize Zones ⭐ (flagship)

**User story:** As a city planner, I select a hotspot and get a 0–100 Priority Score with a transparent breakdown and a concrete intervention recommendation.

## Scope

- Backend `POST /api/prioritize` full pipeline for a ~1 km buffer around the selected marker:
  1. Grid AOI into ~500m cells
  2. Heatmap `tcm` + `persistence` (from Features 1–2 cache where possible)
  3. `env_params` for top cells → wet-bulb max (health severity)
  4. Satellite segmentation per top cell → vegetation % (fallback: OSM landuse tags)
  5. Overpass → bus stops, schools, parks per zone
  6. `scoring.js` → `0.35 heat + 0.25 duration + 0.20 exposure + 0.20 greeneryDeficit`, inputs normalized 0–100 across zones
  7. `interventions.js` → rule table (core idea doc §8)
- Frontend: "Analyze this zone" (in MarkerPopup) triggers the pipeline; ResultsPanel opens with ranked zone list; ZoneCard shows score badge, 4 breakdown bars, intervention + reason, asset chips.

## Backend tasks

- [ ] `/api/prioritize` route per `docs/api-contract.md` (zones ranked desc)
- [ ] `osm.js`: Overpass query for `highway=bus_stop`, `amenity=school`, `leisure=park` within zone polygons
- [ ] `scoring.js` + unit tests (`node:test`)
- [ ] `interventions.js` + unit tests
- [ ] Greenery fallback switch: `greenerySource: satellite_segmentation | osm_landuse` in response meta

## Frontend tasks

- [ ] `ResultsPanel.jsx` (ranked list, click → flyTo) with three states — hidden / docked (340px) / expanded (~60% viewport width over a dimmed scrim; map still pannable behind; Esc, scrim click, or header toggle collapses). First completion slides it in from the right (`--dur-slow`)
- [ ] `ZoneCard.jsx` (score badge, breakdown bars, intervention, asset chips) with motion: score **counts up** 0 → value (600ms, `useCountUp`), four breakdown bars grow 0 → value with 80ms stagger, intervention chip fades in last
- [ ] Zone geometry rendering on map (selected zone highlighted, `#4c9ffe` outline) — boundary **draws itself** (animated `line-dasharray` along the ring, ~600ms)
- [ ] Ranked list items stagger in on first render (cap 6, per motion rules)

## Acceptance criteria

- Select a Phoenix hotspot marker → Analyze → ranked zones appear; top zone shows score ≥0–100 with all four breakdown bars and a rule-based intervention with a human-readable reason.
- Scores are stable across re-runs in fixture mode (deterministic pipeline).
- Unit tests for scoring and intervention rules pass.

## Depends on

Features 1–2. Day-1 verification of satellite segmentation access (else OSM fallback).
