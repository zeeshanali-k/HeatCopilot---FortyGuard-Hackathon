# Feature 7 — Analysis History & Multi-Zone Comparison

**User story:** As a user, every analysis I run is saved to a history list. I can re-open past results, and select multiple analyses at once to see their zones on the map together and compare them side by side.

## Design decisions (made, correctable)

- **Persistence:** `localStorage` (no backend/database needed — results are small JSON; fixtures already live server-side).
- **Selection model:** checkboxes in the history list → multi-select. Each selected entry gets a distinct color (from a fixed 4-color palette) applied to its zones on the map and its column in the comparison view.
- **Multi-select display:** up to 4 entries at once (palette size); selecting a 5th shows a hint to deselect first.
- **Unit of history:** one entry per completed **Prioritize Zones** run (the flagship output). Hotspots/duration results are stored inside their parent entry, not as separate entries.

## Data model (zustand + localStorage)

```js
// state.js — new slice
history: [
  {
    id: 'run_2026-08-29T14:32:05Z',
    createdAt: '2026-08-29T14:32:05Z',
    label: 'Downtown Phoenix',          // reverse-geocoded, fallback: "33.45, -112.07"
    aoi: GeoJSONPolygon,
    aoiMode: 'auto' | 'manual',
    date: '2026-07-15',
    hotspots: [...],                    // Feature 1 output
    duration: [...],                    // Feature 2 output
    zones: [...],                       // Feature 3 output (ranked, scored)
  },
],
selectedHistoryIds: ['run_...', ...],   // max 4
activeHistoryId: 'run_...',             // drives ResultsPanel detail view
```

- `saveToHistory()` is called automatically when a prioritize run completes.
- Hydration: store rehydrates `history` from `localStorage` on app start (`heatcopilot:history:v1` key). Selected IDs are session-only (not persisted).
- Cap stored entries at 20 (FIFO eviction) to stay within localStorage limits; zone geometries dominate size.

## Components

| File | Change |
|---|---|
| `client/src/components/HistoryPanel.jsx` *(new)* | Collapsible panel (bottom-left or a ResultsPanel tab): list of entries — label, date, mini stats (zones count, top score), checkbox, delete icon, "Load" on row click |
| `client/src/components/map/HistoryLayer.jsx` *(new)* | Renders zone polygons for **each selected** history entry, colored by palette index; non-selected loaded entry keeps current ZoneLayer styling |
| `client/src/components/CompareView.jsx` *(new)* | Shown when ≥2 entries selected: table — rows = score, heat/duration/exposure/greenery breakdown, top intervention, assets; columns = selected entries (palette-colored headers). Renders as a **bottom sheet**: slides up to ~50% viewport height over the map (`--dur-slow`), columns fade in with 60ms stagger, dismisses via Esc / swipe-down / close icon |
| `client/src/components/ResultsPanel.jsx` | "History" tab or section hosting HistoryPanel; existing detail view unchanged for the active entry |
| `client/src/state.js` | History slice + actions: `saveToHistory`, `loadHistoryEntry`, `toggleHistorySelection`, `deleteHistoryEntry`, `clearHistory` |

## Behavior rules

- **Load** (row click): restores that entry's `aoi`, hotspots, and zones into the live state and flies the map to the AOI bbox — the app looks exactly as it did when the run finished. Marked as the `activeHistoryId`.
- **Multi-select** (checkbox): does not disturb live state; overlays the selected entries' zones on the map in palette colors and opens CompareView.
- **Delete:** removes from history and deselects; deleting the active entry leaves the live map untouched.
- **Rerun (⟳ button per entry):** re-executes the full pipeline for that entry's stored `aoi`, `date`, and parameters, then **replaces the entry in place** (same `id`, updated `createdAt`, results, and `label` if the reverse geocode changed). While a rerun is in flight, the entry row shows the same progress timeline states as FeaturePanel (Submitted → Processing → Completed) and its controls are disabled. On failure, the entry keeps its old results and shows an inline error with retry. Rerun also loads the entry (flies to its AOI) so the user watches the refresh happen; in `DEMO_MODE=fixtures` a rerun is a cache hit and completes instantly. Changed zone scores **flash** (background highlight fade, ~800ms) instead of jumping.
- **Motion:** toggling a history selection fades its zone overlays in with the palette color; deselecting fades out (both `--dur-med`).
- Saving a run whose AOI (hash) matches an existing entry **replaces** it (re-analysis = update, not duplicate).
- History entries from fixture mode are stored the same way — `fromCache` is recorded in the entry meta for transparency.

## Acceptance criteria

- Run Prioritize Zones on two different areas → both appear in history with labels and top scores.
- Select both → zone polygons render on the map in two distinct colors; CompareView shows the breakdown columns side by side.
- Click Load on an entry → map flies to its area and live panels restore its results.
- Click Rerun on an entry → pipeline re-executes for its stored AOI/date → entry updates in place with new results and timestamp; failure preserves the old results with a retry affordance.
- Reload the page → history list is intact.
- Re-running the same AOI replaces the old entry instead of duplicating it.

## Depends on

Feature 3 (zones exist to store). Independent of Features 4–6. ~1 day of work, frontend-only.
