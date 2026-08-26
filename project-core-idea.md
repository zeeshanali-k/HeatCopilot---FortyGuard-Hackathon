# HeatCopilot — AI Heat Mitigation Planner

**Hackathon:** FortyGuard Hackathon'26 (Aug 18–30, 2026, fully online)
**Tracks:** Dashboards + Interactive Maps (AI used for narrative synthesis)
**Demo city:** Phoenix, AZ (pre-computed/cached), live-capable for any US area

---

## 1. Elevator Pitch

> Tell it a US city and it tells you which zones to fix first, why, and with what intervention — backed by hyperlocal, measured temperature intelligence.

## 2. Problem Statement

Cities are getting hotter, but heat-mitigation budgets are limited. A city may have 100 hot areas and the budget to fix only 10 — and today there is no operational tool that answers **where to invest, why, and what to do**.

- Extreme heat is the deadliest weather-related hazard in the US, killing more people than hurricanes, tornadoes, and floods combined.
- Heat is not evenly distributed: low-income US city blocks average ~15% less tree cover and are ~1.5°C hotter than wealthier blocks in the same city. Urban heat islands run 1–7°F hotter by day.
- Existing data is too coarse: weather apps report airport temperatures; satellite NDVI maps show greenery, not the 2-meter temperature people actually experience on a given street corner.

**The gap:** decision-makers (planners, public-health officers, sustainability offices) lack block-level, measured heat data fused with land cover and public-asset exposure to prioritize spending.

## 3. Solution Overview

A **feature-driven interactive dashboard** (deliberately not a chatbot):

- Full-screen US map with search and area selection.
- Feature buttons trigger a deterministic analysis pipeline on the selected area.
- Results appear as **markers** on the map; each marker has a popup with temperature stats.
- Selecting a marker unlocks drill-down actions for that zone, ending in a scored priority ranking and a recommended intervention.
- An LLM is used **only for narrative synthesis** ("Generate Action Plan") — AI explains the results; it does not decide what to compute.

Why feature-driven over chatbot: the pipeline path is known (buttons are as intelligent and far more reliable), buttons advertise capabilities instead of hiding them behind a prompt box, and the demo is fully controllable against async, credit-consuming API tasks.

## 4. User Flow

1. App loads a US-wide map. User searches (geocoding) or pans/zooms to an area.
2. User clicks **"Find Hotspots"** → pipeline runs on the current viewport → hotspot **markers** appear.
3. Clicking a marker opens a **popup**: location name, mean/max temperature, heat duration, peak heat hour.
4. User **selects a marker** → that zone becomes the focus area → drill-down actions unlock:
   - **Heat Duration Analysis** — how many hours above threshold, longest dangerous streak.
   - **Prioritize Zone** — full scoring: Priority Score (e.g. 92/100) with breakdown + recommended intervention.
   - **Generate Action Plan** — AI-written briefing: why this score, what to do, expected rationale; optional Heat Intelligence PDF attached.
5. Right-hand results panel shows the ranked zone list; clicking a list item zooms the map and opens the zone detail card.

## 5. Feature List

| # | Feature | What it does | FortyGuard inputs |
|---|---------|--------------|-------------------|
| 1 | **Find Hotspots** | Renders thermal overlay + hotspot markers for the selected area | Heatmap (`tcm`) |
| 2 | **Heat Duration** | Hours above a threshold (default 38°C / 100°F) + longest streak | Heatmap (`exceedance`, `persistence`) |
| 3 | **Peak Hours** | Hour of day when each zone peaks | Heatmap (`time_of_measure`) |
| 4 | **Prioritize Zones** ⭐ | Grids the area into zones, scores each, ranks them, recommends interventions | Heatmap (all modes) + Satellite Segmentation + Environmental Parameters + OSM assets |
| 5 | **Generate Action Plan** | LLM narrative per top zone: score breakdown, intervention, justification; optional PDF | Pipeline outputs + Heat Intelligence report |

## 6. Data & API Mapping

### FortyGuard Temperature API (core — async: submit → poll `GET /v1/status/{activity_id}` → result)

| Endpoint | Used for | Notes |
|----------|----------|-------|
| `POST /v1/heatmap` | Hotspots, duration, peak hours | Modes: `tcm`, `exceedance`, `persistence`, `time_of_measure`. Granularity 60/80/100m. **US-only.** Historical 2019→now + 12h forecast. Basic plan: ≤10 mi² per request. Returns GeoJSON tiles + stats (min/max/mean/distribution) |
| `POST /v1/env_params` | Health severity of worst zones | Wet-bulb, heat index, apparent temp, humidity, AQI suite, solar irradiance |
| `POST /v1/satellite_segmentation` | Vegetation / asphalt / building % per zone | **Premium** — verify access day 1; fallback: OSM landuse tags |
| `POST /v1/streetview_segmentation` | Optional: ground-level shade evidence for top zone | Premium |
| `POST /v1/heat_intelligence` | "Evidence report" PDF for the top-priority zone | Returns temporary `download_link`; fetch immediately |

### External data (free)

- **Nominatim** — place search / geocoding.
- **OpenStreetMap Overpass API** — bus stops, schools, parks per zone (public-exposure input).
- **OSM landuse tags** — fallback vegetation/greenery estimate if segmentation is unavailable.

## 7. Priority Score

Transparent, explainable composite per zone (weights shown in the UI):

```
Score = 0.35 × HeatIntensity    (mean °C above area baseline, from heatmap tiles)
      + 0.25 × HeatDuration     (longest streak ≥ threshold, hours — persistence)
      + 0.20 × Exposure         (bus stops + schools per zone — OSM)
      + 0.20 × GreeneryDeficit  (1 − vegetation % — satellite segmentation or OSM fallback)
```

Each input normalized to 0–100 across the analyzed zones, then weighted. The "why 92/100" breakdown is a first-class UI element.

## 8. Intervention Rule Engine

Rule-based (no ML — defensible, no training data exists for intervention outcomes):

| Condition (from data already fetched) | Recommended intervention |
|---|---|
| Vegetation < 15% AND open space present | 🌳 Tree planting |
| Bus stops in top heat-duration decile | 🚏 Bus-stop shade structures |
| High asphalt %, road-heavy zone | 🛣️ Cool pavement |
| School inside high-persistence zone | 🏫 School cooling / shade canopy |
| Wet-bulb crosses danger tier (from env_params) | Escalate priority regardless of other factors |

## 9. Technical Architecture (sketch — details in implementation plans)

```
Frontend (MapLibre GL + vanilla/React)
  - US basemap, geocoder search, AOI = viewport or drawn polygon
  - Feature panel (buttons), marker layer + popups, results panel
        │  REST (JSON)
Backend (Python, FastAPI)
  - POST /api/analyze/hotspots|duration|prioritize   → runs pipeline, returns markers/zones
  - POST /api/action-plan                             → LLM narrative for a zone
  - FortyGuard client: submit → bounded poll → parse → normalize
  - Fixture cache: every API response stored on disk (keyed by AOI+date+mode)
  - Scoring engine + intervention rules (pure functions, unit-tested)
LLM synthesis: score breakdown + stats → structured briefing (no tool calling)
```

Key practices: pre-compute Phoenix fixtures days 1–3; demo on cache; reserve one live call for the wow moment; deterministic pipeline code, not notebooks.

## 10. Constraints & Risks

- **Async + credits:** FortyGuard tasks take minutes and consume credits only on completion → cache everything; never poll live in the demo path.
- **Area caps:** heatmap ≤10 mi² (Basic) / 50 mi² (Premium) per request → cap selectable AOI with a friendly message, or chunk into tiles and merge.
- **Premium endpoints:** satellite/street segmentation and Heat Intelligence require Premium → verify hackathon plan day 1; OSM landuse is the documented fallback for greenery.
- **Date alignment:** segmentation/heat-intelligence dates must match the heatmap's date/time → single shared "analysis context" (area, date, hour) reused across all calls.
- **Scope:** heatmap is US-only → enforce US bounds on the map and geocoder.

## 11. Hackathon Alignment

- **Impact & Relevance (40%):** budget-allocation framing — "cities can only fix 10 of 100 hot zones; we tell them which 10 and how." Clear customer, measurable outcome.
- **Technical Execution (35%):** 4+ FortyGuard endpoints orchestrated, async handling, scoring engine, external data fusion, tested pipeline with fixture caching.
- **Innovation (15%):** closes the loop — Heat → Duration → Exposure → Greenery Deficit → **Intervention**. Not just detection, but action.
- **Communication (10%):** five-click demo — search Phoenix → Find Hotspots → select marker → Prioritize → Generate Action Plan.
- **Tracks:** Dashboards + Interactive Maps. AI narrative synthesis noted honestly in the writeup.

**Core message:** *"We help cities decide where to invest in heat mitigation and what intervention to use, using hyperlocal temperature intelligence."*

## 12. Target Customers & Business Model (brief)

- **Primary:** municipalities, urban planning departments, environmental/public-health agencies.
- **Secondary:** real-estate developers, infrastructure companies, climate consultants.
- **Model:** SaaS tiers — Basic (heat analysis + priority map), Professional (multi-area, reports), Enterprise (city-scale, API access, integrations).
- **Why they pay:** prioritizing limited budgets by measured impact instead of spreading spend evenly.
