# HeatCopilot — AI Heat Mitigation Planner

> **FortyGuard Hackathon 2026** entry · Dashboards + Interactive Maps track  
> Built August 18–30, 2026 · Phoenix, AZ demo data · Live-capable for any US city

[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite)](https://vitejs.dev)
[![Express](https://img.shields.io/badge/Express-4-000000?logo=express)](https://expressjs.com)
[![MapLibre](https://img.shields.io/badge/MapLibre-GL-3965BD?logo=maplibre)](https://maplibre.org)

**HeatCopilot turns hyperlocal temperature intelligence into an actionable investment plan.** Tell it a US area and it tells you which heat zones to fix first, why they matter, and what intervention to use — all backed by measured 2-meter temperature data, not satellite proxies.

<!-- Screenshot placeholder: replace with an app screenshot before final submission -->

---

## The Problem

Cities are getting hotter, but heat-mitigation budgets are fixed. A planner may have 100 hot zones and funding for 10. Existing tools answer *"where is it hot?"* — none reliably answer *"where should we spend first, why, and on what?"*

- Extreme heat is the deadliest weather-related hazard in the US.
- Heat is unequal: low-income blocks average ~15% less tree cover and run ~1.5°C hotter.
- Airport weather stations and NDVI maps miss the street-corner reality people actually experience.

## The Solution

HeatCopilot is a **feature-driven operations dashboard** (deliberately not a chatbot):

1. **Find Hotspots** — thermal overlay + severity-coded markers for any US area.
2. **Heat Duration** — hours above a dangerous threshold and longest dangerous streak.
3. **Prioritize Zones** — grid the area, score each cell, rank them, recommend interventions.
4. **Budget Optimizer** — greedy allocation down the ranked list; see exactly which zones get funded and which are next in line.
5. **Generate Action Plan** — LLM narrative synthesis that cites only numbers already visible in the UI.

Every recommendation is traceable: the score breakdown and intervention reason are first-class UI elements, not black-box output.

---

## Demo

A 3-minute recorded demo follows this arc:

1. Search **Phoenix** → map flies to downtown.
2. Click **Find Hotspots** → heat overlay + markers render with a progress timeline.
3. Click the reddest marker → popup shows mean/max °C, dangerous hours, peak hour.
4. Click **Analyze this zone** → Priority Score with four breakdown bars + recommended intervention.
5. Enter **$2M budget → Optimize** → funded zones light up green with cost tags.
6. Click **Generate Action Plan** → AI briefing appears, citing the visible data only.

> The demo runs in `DEMO_MODE=fixtures` using pre-computed Phoenix responses, so there is zero live API risk during judging. One live call can be shown as a bonus take.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  React + Vite + MapLibre GL         Node.js + Express       │
│  ┌─────────────┐                    ┌─────────────────┐     │
│  │ FeaturePanel│◄───REST/JSON──────►│ /api/hotspots   │     │
│  │ SearchBox   │                    │ /api/duration   │     │
│  │ ResultsPanel│◄──────────────────►│ /api/prioritize │     │
│  │ ZoneCard    │                    │ /api/allocate   │     │
│  │ MapView     │◄──────────────────►│ /api/action-plan│     │
│  └─────────────┘                    └────────┬────────┘     │
│                                              │               │
│                                              ▼               │
│                                    FortyGuard API            │
│                                    Nominatim / Overpass      │
│                                    LLM (OpenAI-compatible)   │
└─────────────────────────────────────────────────────────────┘
```

### Frontend

- **React 19 + Vite** — single-screen desktop app, no router.
- **MapLibre GL JS** — dark vector basemap, US-bounded viewport.
- **Zustand** — global state.
- **CSS custom properties** — dark/light theming, shared motion tokens.

### Backend

- **Express** — thin proxy/orchestrator.
- **FortyGuard client** (`server/src/fortyguard.js`) — submit async tasks, poll `GET /v1/status/{activity_id}`, normalize GeoJSON outputs.
- **Fixture cache** (`server/fixtures/`) — disk cache keyed by AOI + date + mode; demo-safe `DEMO_MODE=fixtures`.
- **Scoring engine** (`server/src/scoring.js`) — pure, unit-tested priority score.
- **Intervention rules** (`server/src/interventions.js`) — deterministic rule engine, no ML.
- **LLM synthesis** (`server/src/llm.js`) — action-plan narrative only.

---

## Priority Score

Transparent, explainable composite per zone:

```
Score = 0.35 × Heat Intensity
      + 0.25 × Heat Duration
      + 0.20 × Exposure (bus stops + schools)
      + 0.20 × Greenery Deficit
```

Each input is normalized 0–100 across the analyzed zones, then weighted. The UI renders the four breakdown bars so the "why 92/100" is always visible.

## Intervention Rules

| Condition | Recommended intervention |
|---|---|
| Vegetation < 15% and open space present | 🌳 Tree planting |
| Bus stops in top heat-duration decile | 🚏 Bus-stop shade structures |
| High asphalt, road-heavy zone | 🛣️ Cool pavement |
| School inside high-persistence zone | 🏫 School cooling / shade canopy |
| Wet-bulb crosses danger tier | Escalate priority regardless |

Rules are deterministic; the LLM only explains the result.

---

## Getting Started

### Prerequisites

- Node.js 20+
- npm 10+
- FortyGuard API key (for live mode; fixtures work without it)
- OpenAI-compatible LLM key (for action plans; optional for hotspots/duration/prioritize)

### Install

```bash
# Clone the repo
git clone https://github.com/zeeshanali-k/HeatCopilot---FortyGuard-Hackathon.git
cd HeatCopilot---FortyGuard-Hackathon

# Install root + workspaces
npm install
```

### Configure

```bash
cp server/.env.example server/.env
# Edit server/.env with your keys
```

Key variables:

| Variable | Purpose |
|---|---|
| `FORTYGUARD_API_KEY` | FortyGuard API access |
| `LLM_API_KEY` | OpenAI / compatible LLM key |
| `LLM_BASE_URL` | e.g. `https://api.openai.com/v1` |
| `LLM_MODEL` | e.g. `gpt-4o-mini` |
| `DEMO_MODE` | `fixtures` (demo-safe) or unset (live calls on cache miss) |
| `PORT` | defaults to `3001` |

### Run

```bash
# Dev mode: starts backend (port 3001) and frontend (port 5173)
npm run dev
```

Then open `http://localhost:5173`.

### Build for production

```bash
npm run build
npm run start   # serves built client + API from port 3001
```

### Run tests

```bash
npm test -w server
```

---

## Repo Structure

```
FortyGuard/
├── client/                    # React + Vite frontend
│   ├── src/
│   │   ├── components/        # MapView, FeaturePanel, ResultsPanel, ZoneCard, etc.
│   │   ├── hooks/             # useCountUp, useStagger
│   │   ├── theme.css          # Motion + theming tokens
│   │   ├── index.css          # Shared keyframes + reduced-motion
│   │   └── state.js           # Zustand store
│   └── package.json
├── server/                    # Express backend
│   ├── src/
│   │   ├── index.js           # Routes
│   │   ├── fortyguard.js      # FortyGuard client
│   │   ├── cache.js           # Fixture store
│   │   ├── scoring.js         # Priority score
│   │   ├── interventions.js   # Rule engine
│   │   ├── allocate.js        # Budget optimizer
│   │   ├── osm.js             # Overpass integration
│   │   └── llm.js             # Action-plan narrative
│   ├── fixtures/              # Cached responses
│   ├── .env.example
│   └── package.json
├── docs/                      # Feature specs, API contract, design guidelines
├── project-core-idea.md
├── implementation-plan.md
└── package.json               # npm workspaces root
```

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Health + demo mode flag |
| `POST` | `/api/hotspots` | Heatmap tiles + hotspot markers |
| `POST` | `/api/duration` | Hours above threshold + longest streak |
| `POST` | `/api/prioritize` | Ranked, scored zones with interventions |
| `POST` | `/api/allocate` | Greedy budget allocation over ranked zones |
| `POST` | `/api/action-plan` | LLM narrative for a zone |

See [`docs/api-contract.md`](docs/api-contract.md) for full request/response shapes.

---

## Design Notes

- **One screen, map-first**, dark operations-tool aesthetic.
- **Glassmorphism panels** with backdrop blur, subtle borders and shadows.
- **Motion** uses CSS keyframes only; `prefers-reduced-motion: reduce` degrades to fade-only.
- **Left panel** (`FeaturePanel`) is a full-height docked sidebar; **right panel** (`ResultsPanel`) floats.
- **No emoji** in UI chrome — inline SVG icons only.

See [`docs/design-guidelines.md`](docs/design-guidelines.md) for the full spec.

---

## Hackathon Alignment

| Criterion | How HeatCopilot addresses it |
|---|---|
| **Impact & Relevance (40%)** | Budget-allocation framing: "100 hot zones, budget for 10 — we tell you which 10 and how." |
| **Technical Execution (35%)** | 4+ FortyGuard endpoints orchestrated, async polling, external data fusion, tested scoring engine, fixture caching. |
| **Innovation (15%)** | Closes the loop: heat → duration → exposure → greenery deficit → intervention → budget. |
| **Communication (10%)** | Five-click demo with visible score formula and transparent reasoning. |

**Core message:** *"We help cities decide where to invest in heat mitigation and what intervention to use, using hyperlocal temperature intelligence."*

---

## Constraints & Known Limits

- **US-only heatmap** — enforced by map bounds and geocoder bias.
- **Area caps** — FortyGuard Basic heatmap caps at ~10 mi² per request; Premium raises it. The app warns or uses the current viewport.
- **Async tasks** — FortyGuard calls can take minutes; the backend polls with a progress timeline and caches every response.
- **Premium endpoints** — satellite segmentation and Heat Intelligence PDF require Premium; OSM landuse is the documented fallback for greenery.
- **Desktop demo** — mobile layout is out of hackathon scope.

---

## Team & Acknowledgments

Built for the **FortyGuard 2026 Hackathon**.

- Temperature intelligence: [FortyGuard](https://fortyguard.com)
- Basemap & geocoding: MapLibre + Nominatim
- Public asset data: OpenStreetMap / Overpass

---

## License

MIT — hackathon submission source.

---

*HeatCopilot is a hackathon prototype. Cost figures are rough municipal planning estimates, clearly labeled as such in the UI and documented in `server/src/costs.js`.*
