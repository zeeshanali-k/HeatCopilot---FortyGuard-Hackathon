# Feature 1 — Find Hotspots

**User story:** As a user, I search or pan to a US area and click "Find Hotspots" to see where the heat actually is, as markers on the map.

## Scope

- SearchBox (Nominatim geocoding, US-only results, fly-to).
- FeaturePanel with the "Find Hotspots" primary button + progress timeline (Submitted → Processing → Completed, elapsed seconds).
- Backend `POST /api/hotspots`: viewport polygon → FortyGuard heatmap (`tcm`, granularity 100) → normalize tiles, cluster hottest tiles into markers.
- MapView: heat tile overlay (color scale per design guidelines) + severity-colored markers.
- MarkerPopup: area label, mean/max °C, peak hour (if cached), "Analyze this zone" button (disabled until Feature 3 lands).

## Backend tasks

- [ ] `fortyguard.js`: `submitAndPoll()` with 5s polling, 10-min budget, Completed/Failed handling
- [ ] `cache.js`: disk fixtures keyed by hash(AOI + date + mode + granularity); `DEMO_MODE=fixtures` gate
- [ ] `/api/hotspots` route per `docs/api-contract.md`
- [ ] Hotspot extraction: top-N hottest tile clusters → marker list (label via reverse geocode, best-effort)

## Frontend tasks

- [ ] Vite + React scaffold, MapLibre map with US `maxBounds`, dark basemap
- [ ] `SearchBox.jsx`, `FeaturePanel.jsx`, `MapView.jsx` (overlay + markers), `MarkerPopup.jsx`
- [ ] zustand store: `aoi`, `analysisStatus`, `hotspots[]`
- [ ] Progress timeline component wired to backend status — with motion: active step pulses, completed steps check-mark with a `--dur-fast` pop, connecting line fills as steps advance
- [ ] Motion (tokens in `docs/design-guidelines.md` §Motion): heat overlay fades in (0 → target opacity, `--dur-slow`); markers staggered scale-in (`--ease-spring`, 50ms stagger, hottest marker gets a slow severity pulse until selected); selecting a marker `easeTo`-centers the map and springs the popup in; primary button shows an animated gradient sweep while an analysis runs

## Acceptance criteria

- Search "Phoenix" → map flies there → Find Hotspots → progress steps visible → overlay + markers render within a few seconds in fixture mode.
- Clicking a marker opens the popup with real temperature stats from the API/fixture.
- Cache miss in DEMO_MODE shows the `cache_miss` error state gracefully.

## Depends on

Day-1 scaffold + FortyGuard plan verification (area cap decides max AOI size).
