# Demo Script — HeatCopilot (~3 minutes)

Structure follows the 5-slide arc from `docs/HeatCopilot Previous Hackathon Deep_Analysis.docx`: Problem → Gap → Solution → How it works → Impact. Judges should understand the value within the first 60 seconds.

## Act 1 — The Problem (0:00–0:45, slides)

- Slide 1: "Cities are getting hotter, but mitigation budgets are fixed. A city may have 100 hot zones and funding for 10."
- Slide 2 — the gap: show a plain heat map screenshot. "Existing tools answer *where is it hot*. Nobody answers *where should we spend first, why, and on what*."

## Act 2 — The Solution, live (0:45–2:15, app in DEMO_MODE=fixtures)

Narrate each click; never wait silently — the progress timeline is part of the story ("this is real async temperature intelligence, cached for the demo").

1. **Search "Phoenix"** → map flies to downtown. (5s)
2. **Click "Find Hotspots"** → progress steps → heat overlay + markers appear. Click the reddest marker → popup: "Mean 43.1°C, Max 47.8°C, dangerous 8.2 hrs/day, peaks at 3 PM." (25s)
3. **Click "Analyze this zone"** → ZoneCard: **Priority 92/100** with the four breakdown bars. Read the "why" out loud: "heat 96, duration 88, exposure 74, greenery deficit 91 — vegetation here is 9%." (30s)
4. **Recommendation:** "Tree planting + bus-stop shade — because vegetation is under 15% and 6 bus stops sit in the worst heat-duration decile. The rule engine explains itself." (15s)
5. **Enter budget $2M → Optimize** → funded zones light up green: "$1.98M allocated across 7 zones; 3 more zones queued for next funding round." (20s)
6. **Generate Action Plan** → AI briefing appears. Point out it cites only numbers visible on the card. (20s)

## Act 3 — Impact & Close (2:15–3:00, slides)

- Slide: "From knowing where heat exists → to knowing where to act first."
- Impact bullets: evidence-based allocation, transparent methodology a council can defend, scales to any US city.
- Close on the core message: *"We help cities decide where to invest in heat mitigation and what intervention to use, using hyperlocal temperature intelligence."*

## Rules for the recording

- Run the app with `DEMO_MODE=fixtures` — zero live API risk. Optionally do one live "Find Hotspots" on a small AOI as a bonus take.
- Pre-load Phoenix fixtures; restart backend before recording.
- Have a static screenshot deck as fallback if the app breaks during recording.
- Show the score formula on screen for ~5 seconds (explainability is a judging criterion).
- Never claim predicted cooling — say "recommended intervention," not "this will reduce temperature by X."
