# API Contract — HeatCopilot backend

Base URL: `http://localhost:3001` (dev). All bodies and responses are JSON. Errors return `{ "error": string, "code": string }` with a non-2xx status.

Common types:

```ts
type GeoJSONPolygon = {
  type: "Polygon";
  coordinates: number[][][]; // [ [ [lon, lat], ...closed ring ] ]
};

type ISODate = string; // "YYYY-MM-DD", between 2019-01-01 and today (FortyGuard range)
```

---

## GET /api/health

Response `200`:

```json
{ "ok": true, "demoMode": true }
```

---

## POST /api/hotspots

Triggers the "Find Hotspots" feature: heatmap (`tcm`) over the AOI, clustered into hotspot markers.

Request:

```json
{
  "aoi": { "type": "Polygon", "coordinates": [[[-112.10, 33.40], [-112.00, 33.40], [-112.00, 33.50], [-112.10, 33.50], [-112.10, 33.40]]] },
  "date": "2026-07-15",
  "hour": "14:00"
}
```

Response `200`:

```json
{
  "markers": [
    {
      "id": "hs_1",
      "lat": 33.4512,
      "lon": -112.0534,
      "label": "Downtown core",
      "tempMean": 43.1,
      "tempMax": 47.8,
      "peakHour": 15,
      "durationHrs": 8.2
    }
  ],
  "heatTiles": { "type": "FeatureCollection", "features": [] },
  "meta": { "activityId": "uuid", "fromCache": true, "granularity": 100 }
}
```

Notes: `heatTiles.features[].properties.temperature` (°C) drives the overlay color. `durationHrs`/`peakHour` come from companion `persistence`/`time_of_measure` calls when cached, else null.

---

## POST /api/duration

Request:

```json
{ "aoi": { "type": "Polygon", "coordinates": [[]] }, "date": "2026-07-15", "thresholdC": 38 }
```

Response `200`:

```json
{
  "zones": [
    { "id": "z_1", "lat": 33.4512, "lon": -112.0534, "exceedHours": 11, "longestStreakHrs": 8.2 }
  ],
  "meta": { "thresholdC": 38, "fromCache": true }
}
```

---

## POST /api/prioritize

Full pipeline: grid AOI into ~500 m zones → heat + duration + exposure + greenery → score → intervention. Zones returned ranked by score, descending.

Request:

```json
{ "aoi": { "type": "Polygon", "coordinates": [[]] }, "date": "2026-07-15" }
```

Response `200`:

```json
{
  "zones": [
    {
      "id": "z_1",
      "center": { "lat": 33.4512, "lon": -112.0534 },
      "geometry": { "type": "Polygon", "coordinates": [[]] },
      "score": 92,
      "breakdown": { "heat": 96, "duration": 88, "exposure": 74, "greenery": 91 },
      "contributions": { "heat": 33.6, "duration": 22.0, "exposure": 14.8, "greenery": 21.6 },
      "benefit": {
        "dangerHoursAddressed": 8.2,
        "assetsCovered": { "busStops": 6, "schools": 0, "parks": 0 },
        "exposureComponent": 74,
        "statement": "Tree planting and shade at 6 bus stops that currently endure 8.2 hrs/day of dangerous heat, in a zone whose public exposure ranks in the top decile of this area."
      },
      "intervention": "tree_planting",
      "interventionLabel": "Tree planting + bus-stop shade",
      "reason": "Vegetation 9% (< 15% threshold) with open space present; 6 bus stops in top heat-duration decile.",
      "assets": { "busStops": 6, "schools": 2, "parks": 0 },
      "stats": {
        "tempMean": 43.1,
        "tempMax": 47.8,
        "longestStreakHrs": 8.2,
        "vegetationPct": 9,
        "wetBulbMax": 29.4
      }
    }
  ],
  "meta": { "zoneCount": 12, "fromCache": true, "greenerySource": "satellite_segmentation | osm_landuse" }
}
```

`intervention` enum: `tree_planting | shade_structures | cool_pavement | school_cooling | green_space | combined`.

---

## POST /api/allocate

Budget optimizer. Reuses the `/api/prioritize` pipeline server-side, then greedily funds zones in priority order until the budget is exhausted. Unit costs are rough municipal estimates (see `server/src/costs.js`) and may be overridden per intervention. No new external API calls.

Request:

```json
{
  "aoi": { "type": "Polygon", "coordinates": [[]] },
  "date": "2026-07-15",
  "budgetUsd": 2000000,
  "costOverrides": {
    "tree_planting": { "unitsPerZone": 200, "costPerUnitUsd": 900 },
    "shade_structures": { "costPerUnitUsd": 18000 }
  }
}
```

`costOverrides` is optional. Each key must be a known intervention (`tree_planting`, `shade_structures`, `cool_pavement`, `school_cooling`, `green_space`); `unitsPerZone` and `costPerUnitUsd` must be non-negative numbers.

Response `200`:

```json
{
  "funded": [
    { "id": "z_1", "intervention": "shade_structures", "cost": 54000, "runningTotal": 54000, "...": "same zone shape as /api/prioritize" }
  ],
  "unfunded": [
    { "id": "z_2", "intervention": "green_space", "cost": 300000, "...": "next in line when more budget is available" }
  ],
  "totalSpent": 54000,
  "budgetUsd": 2000000,
  "impact": { "zonesFunded": 1, "dangerHoursAddressed": 8.2 },
  "meta": {
    "effectiveCosts": {
      "tree_planting": { "unitLabel": "tree", "unitsPerZone": 200, "costPerUnitUsd": 900, "note": "planted + 3yr maintenance" },
      "shade_structures": { "unitLabel": "shade structure", "unitsPerZone": 3, "costPerUnitUsd": 18000, "note": "bus-stop scale" },
      "...": "..."
    }
  }
}
```

`meta.effectiveCosts` echoes the exact cost table used for the allocation so the UI can display the assumptions that produced the result.

Errors: `422 invalid_budget` when `budgetUsd` is not a non-negative finite number; `422 invalid_request` when `costOverrides` contains unknown keys or invalid numbers; `422 invalid_aoi` as usual.

---

## POST /api/action-plan

LLM narrative for one zone. Deterministic inputs — the LLM only writes prose from the supplied data.

Request:

```json
{
  "zoneId": "z_1",
  "zoneData": { "score": 92, "breakdown": { "heat": 96, "duration": 88, "exposure": 74, "greenery": 91 }, "interventionLabel": "Tree planting + bus-stop shade", "stats": { "tempMean": 43.1, "tempMax": 47.8, "longestStreakHrs": 8.2, "vegetationPct": 9, "wetBulbMax": 29.4 }, "assets": { "busStops": 6, "schools": 2, "parks": 0 } },
  "context": {
    "areaLabel": "Downtown Phoenix",
    "date": "2026-07-15",
    "rank": 1,
    "zoneCount": 12,
    "topZones": [{ "id": "z_1", "score": 92, "interventionLabel": "Tree planting + bus-stop shade" }],
    "budget": { "budgetUsd": 2000000, "funded": true, "estimatedCostUsd": 120000, "runningTotalUsd": 120000 },
    "alternatives": [{ "interventionLabel": "Shade structures", "tradeoff": "lower cost, smaller coverage" }]
  }
}
```

`context` is optional (v2, see `docs/features/08-action-plan-v2.md`). `budget` is included only when the budget optimizer has been run; omitted sections are skipped in the narrative — never rendered with placeholders or invented figures. Requests without `context` remain fully valid.

Truncation guard: if the LLM response is cut off (`finish_reason: "length"`) or fails server-side validation, the server returns the deterministic fallback narrative instead of a partial response.

Response `200`:

```json
{
  "narrative": "Zone z_1 ranks 92/100...",
  "evidencePdfUrl": null
}
```

`evidencePdfUrl` is null unless the Heat Intelligence stretch feature is enabled.

---

## Error codes

| Code | HTTP | Meaning |
|---|---|---|
| `cache_miss` | 404 | DEMO_MODE=fixtures and no fixture exists for this request |
| `invalid_aoi` | 422 | Polygon missing, not closed, or outside US bounds |
| `aoi_too_large` | 422 | AOI exceeds plan area cap — client must shrink or chunk |
| `upstream_error` | 502 | FortyGuard/OSM/LLM call failed |
| `upstream_timeout` | 504 | Polling exceeded the time budget |
| `not_configured` | 500 | Missing API key in server env |
