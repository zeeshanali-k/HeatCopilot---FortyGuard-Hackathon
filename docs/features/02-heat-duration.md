# Feature 2 — Heat Duration & Peak Hours

**User story:** As a user, I want to know not just how hot an area gets, but for how long it stays dangerous and when it peaks.

## Scope

- Backend `POST /api/duration`: heatmap `exceedance` (threshold default 38°C) + `persistence` over the AOI → per-zone `exceedHours` / `longestStreakHrs`.
- Companion `time_of_measure` call feeding `peakHour` into hotspot markers and zone stats.
- Frontend: "Heat Duration" secondary button (enabled after hotspots exist); duration values added to MarkerPopup; optional map layer toggle coloring zones by longest streak.

## Backend tasks

- [ ] `/api/duration` route per `docs/api-contract.md`
- [ ] Reuse `submitAndPoll` with `analysis_type: exceedance | persistence | time_of_measure`, shared cache keys
- [ ] Merge duration/peak data into the hotspot marker response when already cached

## Frontend tasks

- [ ] "Heat Duration" button + layer toggle in FeaturePanel
- [ ] MarkerPopup rows: "Danger duration (hrs)" and "Peak hour"
- [ ] Optional: zone streak color ramp (yellow → deep red by `longestStreakHrs`)

## Acceptance criteria

- After Find Hotspots on Phoenix, Heat Duration returns per-zone hours and the popup shows duration + peak hour.
- Threshold is configurable in the request (default 38°C) and reflected in the UI label.

## Depends on

Feature 1 (markers exist; same AOI and analysis context reused).
