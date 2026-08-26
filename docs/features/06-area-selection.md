# Feature 6 — Area Selection (manual draw + auto-viewport visualization)

**User story:** As a user, I can either let the app analyze my current map view — shown as a visible drawn area — or draw my own area point-by-point on the map before running any analysis.

## Current behavior (kept)

`useMap.js` derives the AOI from the viewport on `load` and `moveend` (`updateAoiFromViewport`, bbox → 5-point closed polygon → `setAoi`). This stays as the default **auto mode**.

## New behavior

### A. Visualize the automatic area
When the user runs "Find Hotspots" without drawing anything, the app renders the viewport-derived AOI as a drawn polygon on the map — the same visual language as a manual selection, but drawn by the app from the extracted coordinates.

- Style: same polygon outline + vertex dots as manual mode, but **dashed** outline and a small floating tag "Area: current map view" — signals it's automatic and will change if the map moves.
- In auto mode the polygon refreshes on `moveend` (tracks the viewport), same as today — only now it's visible.

### B. Manual draw mode
A "Draw custom area" toggle in FeaturePanel switches to manual mode:

1. Map enters draw mode: cursor becomes crosshair, hint bar appears ("Click to add points · double-click or click the first point to finish · Esc to cancel").
2. Each click adds a vertex; a live rubber-band line follows the cursor from the last vertex; edges connect vertices visually as they are added.
3. Finish: double-click, or click the first vertex (closes the ring). Minimum 3 vertices — fewer shows a toast/hint and stays in draw mode.
4. The completed polygon becomes `aoi` in the store; style switches to solid outline + filled translucent tint + vertex handles.
5. While in manual mode, `moveend` **no longer overwrites the AOI** (guard in `updateAoiFromViewport`).
6. "Clear area" resets to auto mode (AOI falls back to viewport, results cleared).

### C. Mode model (zustand store)

```js
aoiMode: 'auto' | 'manual',     // default 'auto'
aoi: GeoJSONPolygon | null,     // existing — single source of truth, unchanged
draftVertices: [ [lon,lat], ... ], // in-progress manual polygon
drawing: bool,
setAoiMode(mode), startDrawing(), addDraftVertex(pt), closeDraft(), cancelDrawing(), clearCustomArea()
```

Both modes write to the same `aoi` field, so FeaturePanel, `api.js`, and all analysis features need **zero changes** — they already key off `aoi`.

## Components

| File | Change |
|---|---|
| `client/src/components/map/useMap.js` | Guard `updateAoiFromViewport` with `aoiMode === 'auto'` (read via `useStore.getState()` inside the handler to avoid stale closure) |
| `client/src/components/map/AoiLayer.jsx` *(new)* | MapLibre sources/layers: AOI polygon fill (8% accent), outline (solid = manual, dashed = auto), vertex circles, draft polyline + rubber-band during drawing |
| `client/src/components/map/useDrawArea.js` *(new)* | When `drawing`: `click` → `addDraftVertex`; `mousemove` → update rubber-band; `dblclick` (with `preventDefault` to stop zoom) → `closeDraft`; `keydown Esc` → `cancelDrawing` |
| `client/src/components/FeaturePanel.jsx` | Area section above the action buttons: mode toggle ("Current view" / "Draw custom area"), hint text, "Clear area" button when `aoiMode === 'manual'` |
| `client/src/components/map/MapView.jsx` | Mount `AoiLayer`; attach `useDrawArea` |
| `client/src/state.js` | New state fields/actions above |

## Rules & edge cases

- **Stale results:** committing a new AOI (manual close, or clearing back to auto) clears `hotspots`, duration, and zone results — they belong to the old area. (Analysis already disabled mid-run via `analysisStatus`.)
- **Size guard:** on `closeDraft`, compute the polygon's bbox area; if it exceeds the plan's heatmap cap (verified Day 1), show a warning toast and reject the polygon — keeps the `aoi_too_large` 422 unreachable from normal use.
- **Self-intersections:** accepted for the hackathon (FortyGuard/backend validation will 422); do not build a geometry validator.
- **Vertex editing after completion:** out of scope — user redraws instead.
- Auto polygon must render **under** hotspot markers and zone layers (add `AoiLayer` before other layers, or use `map.moveLayer`).

## Acceptance criteria

- Default load: viewport polygon visible as dashed outline labeled "Area: current map view"; pans/zooms update it.
- Toggle "Draw custom area" → click 4 points → double-click → solid filled polygon appears; Find Hotspots runs against exactly that polygon (verifiable in the backend request log).
- While a manual area exists, panning the map does not move or replace it.
- Esc cancels mid-draw cleanly; Clear returns to auto mode and clears prior results.
- Drawing <3 points cannot finish.

## Depends on

Nothing — pure frontend + store change. Slotted after Feature 4/5 or whenever UI polish time allows; ~0.5–1 day of work.
