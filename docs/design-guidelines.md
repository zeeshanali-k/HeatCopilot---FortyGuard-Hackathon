# Design Guidelines — HeatCopilot

One screen, dark theme, map-first. The UI should feel like an operations tool, not a chatbot or a marketing page.

## Layout

```
┌────────────────────────────────────────────────────┐
│ ┌──────────┐                            ┌────────┐ │
│ │ Feature  │                            │Results │ │
│ │ Panel    │         MAP                │ Panel  │ │
│ │ (280px)  │      (full-screen)         │ (340px)│ │
│ └──────────┘                            └────────┘ │
└────────────────────────────────────────────────────┘
```

- Map is full-screen; panels float above it with 16px margins, 12px corner radius, subtle shadow.
- Panels: dark surface (`#16181d` at 92% opacity), backdrop blur 8px.
- ResultsPanel hidden until the first analysis completes.
- Mobile is out of scope (desktop demo only).

## Typography

- Inter (system fallback: `-apple-system, Segoe UI, Roboto, sans-serif`).
- Panel titles 13px/600 uppercase, letter-spacing 0.08em, `#9aa3b2`.
- Body 14px/400 `#e6e9ef`. Numbers in stat displays 20–24px/600, tabular-nums.

## Color system

- Heat scale (overlay + marker severity): `#2b83ba` → `#abdda4` → `#ffffbf` → `#fdae61` → `#d7191c`.
- Score badges: ≥80 `#e5484d` (red), 60–79 `#f76b15` (orange), 40–59 `#ffc53d` (yellow), <40 `#8b8f98` (grey).
- Accent (buttons, selected states): `#4c9ffe`.
- Popup/panel text on dark only; never place text directly on the basemap.

## Components

- **SearchBox**: top-center, 360px, dark input, Nominatim results dropdown limited to US (`countrycodes=us`).
- **FeaturePanel buttons**: full-width, 44px height, icon (inline SVG, 18px) + label; primary action `#4c9ffe`, secondary actions outlined. Disabled state 40% opacity with tooltip explaining the prerequisite (e.g. "Find hotspots first").
- **Progress timeline**: vertical steps — Submitted → Processing → Completed — with elapsed seconds on the active step. Own the async latency; never show a bare spinner.
- **Markers**: 14px circle, severity fill, 2px white ring; selected marker scales to 18px with `#4c9ffe` ring. Cluster above ~50 markers.
- **MarkerPopup**: MapLibre popup, max-width 300px. Rows: area label (600), Mean / Max temp, Peak hour, Danger duration; footer button "Analyze this zone".
- **ZoneCard**: score badge top-right; four breakdown bars (Heat / Duration / Exposure / Greenery) — 6px bars, label left, value right; intervention label + one-line reason; asset chips (bus stops, schools); "Generate Action Plan" button; narrative renders below with a skeleton while loading.
- **ResultsPanel list**: rows = rank, zone id/label, score badge; hover `#1e222b`; click → flyTo zone.

## Basemap

- Dark vector style (Carto dark-matter or MapLibre demo dark). US-only viewport: `maxBounds` ≈ `[[-125, 24], [-66, 50]]` (CONUS + margin), min zoom 3.

## Motion

Design tokens (in `theme.css`) — every animation uses these, nothing ad-hoc:

```css
:root {
  --dur-fast: 150ms;    /* hovers, toggles */
  --dur-med: 250ms;     /* panel state changes, popups */
  --dur-slow: 400ms;    /* panel expand/collapse, sheet slide */
  --ease-out: cubic-bezier(0.2, 0.8, 0.2, 1);    /* default, decelerating */
  --ease-spring: cubic-bezier(0.34, 1.4, 0.4, 1); /* subtle overshoot: markers, badges */
}
```

Rules:

- Transform + opacity only — never animate width/height of layout-critical elements. 60fps or cut it.
- Stagger cap: 6 items, 50ms steps; longer lists animate as one block.
- `prefers-reduced-motion`: all motion degrades to instant/fade-only (one media query in `index.css`).
- Map movement uses MapLibre's built-in `flyTo`/`easeTo` — never fight it with CSS.
- Plain CSS transitions/keyframes; no animation library (exception, if needed: `framer-motion` scoped to the ranked-list reorder only).
- Panels expand in place (hidden → docked → expanded over a scrim); no new screens. Expanded states dismiss via Esc, scrim click, or toggle icon.

## Rules

- No emoji in UI chrome — inline SVG icons only.
- Every number shows its unit (°C, hrs, %).
- Every external-data figure gets a `title` tooltip naming its source ("FortyGuard heatmap, 2026-07-15 14:00, 100m").
- Empty states say what to do next ("Search a US city, then run Find Hotspots").
