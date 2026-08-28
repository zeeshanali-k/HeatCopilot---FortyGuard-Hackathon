# HeatCopilot — Project Brief (for the demo presenter)

*Plain-language overview. No technical knowledge needed.*

## The one-liner

**HeatCopilot tells a city where to spend its limited heat-mitigation budget, why those places, and what to do there — using real, street-level temperature intelligence.**

## The problem

Cities are getting dangerously hot, and heat kills more people in the US than hurricanes, tornadoes, and floods combined. City governments have money to fight this — but not enough to fix everywhere. A city might have 100 hot areas and budget for 10. Today, choosing which 10 is guesswork: existing tools show *that* it's hot, but not *where to act first, why, or what to do*.

## What our project does

HeatCopilot is a web app with a map of the United States. A city planner uses it like this:

1. **Search any US area** (our demo uses Phoenix, Arizona — one of America's hottest cities).
2. **Click "Find Hotspots"** — the map lights up with a heat overlay and markers showing exactly where the dangerous heat is, based on real temperature data at street level (not airport weather stations).
3. **Click a hotspot marker** — a popup shows how hot it gets there: average and peak temperature, how many hours per day it stays dangerous, and what time of day it peaks.
4. **Click "Analyze this zone"** — the app scores the area's zones from 0–100 for heat-mitigation priority. The score is fully transparent: it combines heat intensity, how long the heat lasts, how many public places (bus stops, schools) are exposed, and how little vegetation the area has. You can see exactly how many points each factor contributed.
5. **Get a recommendation** — each zone comes with a specific suggested action: plant trees, add bus-stop shade, install cool pavement, or add school cooling — plus a plain-English reason why.
6. **Enter a budget** (e.g. $2,000,000) — the app allocates it across the ranked zones for maximum impact, shows which zones get funded (green) and which must wait, and totals it up.
7. **Click "Generate Action Plan"** — an AI writes a professional memo for that zone: its score and why, key stats, expected benefit, cost and budget fit, and recommended next steps. Every number in the memo comes from the real analysis — the AI is not allowed to invent figures.

## Where the data comes from

- **FortyGuard Temperature API** (the hackathon sponsor): hyperlocal temperature maps, heat-duration analysis, and environmental data like wet-bulb temperature.
- **OpenStreetMap**: public assets like bus stops, schools, and parks.
- Costs shown for interventions are clearly labeled estimates, and the user can adjust them.

## Why it matters

Instead of spreading money evenly or guessing, a city can defend every dollar: *"We're funding Zone A first because it scores 92/100 — it endures 8+ hours of dangerous heat daily, has 6 exposed bus stops, and only 9% vegetation — and here's the plan."*

**Core message to land in the video:** *"We help cities move from knowing where heat exists to knowing where to act first."*
