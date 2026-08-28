# Demo Video Guide — HeatCopilot (3 minutes)

For the presenter recording the demo. Read [`project-brief.md`](project-brief.md) first. Each section below says **[SCREEN: …]** — that's what should be visible on the recording while you speak the narration. Narration is written to be read aloud naturally; adjust wording to your style, but keep the numbers accurate.

## Pre-flight checklist (do before recording)

- [ ] Backend running with `DEMO_MODE=fixtures` (instant, no live API risk)
- [ ] Frontend open in a clean browser window, full screen, zoom 100%, dark theme
- [ ] App already loaded once so nothing pops up unexpectedly
- [ ] Close notifications, hide bookmarks bar, tidy desktop
- [ ] Have 2–3 static screenshots (title slide, map with hotspots, zone card) as backup if the app misbehaves mid-recording
- [ ] Do one full rehearsal run; the whole thing should take under 3 minutes

---

## Act 1 — The Problem (0:00 – 0:40)

**[SCREEN: title slide or simple text slide — "Cities are getting hotter. Budgets are not."]**

> "Extreme heat is the deadliest weather hazard in the United States — it kills more people than hurricanes, tornadoes, and floods combined. Cities want to act, but their budgets are limited. A city might have a hundred hot zones and funding for ten."

**[SCREEN: second slide or simple heat map image]**

> "The tools they have today answer one question: where is it hot? But the question that actually matters is different: where should we spend first — and why — and what should we do there? That's what we built. This is HeatCopilot."

## Act 2 — Live Demo (0:40 – 2:20)

**[SCREEN: the app — US map view]**

> "HeatCopilot is a map of the United States, powered by FortyGuard's street-level temperature intelligence. Let's go to Phoenix, Arizona — one of the hottest cities in the country."

*Type "Phoenix" in the search box and select it. Let the map fly there.*

**[SCREEN: map zoomed into Phoenix]**

> "Now one click — Find Hotspots."

*Click "Find Hotspots". While the progress steps advance, keep talking:*

> "The app is pulling a real hyperlocal heat map of this area — not airport weather data, but the temperature people actually feel at street level."

*When the overlay and markers appear:*

**[SCREEN: map with heat overlay + red hotspot markers]**

> "And there it is. The red markers are the most dangerous spots. Let's look at the worst one."

*Click the hottest marker. The popup opens.*

**[SCREEN: marker popup, zoomed enough to read it]**

> "Forty-seven degrees at peak. Over eight hours of dangerous heat every single day, peaking around three in the afternoon. Now the important part — what should the city do about it?"

*Click "Analyze this zone" in the popup. Wait for the results panel.*

**[SCREEN: results panel with ranked zones + zone card open]**

> "HeatCopilot scores every zone from zero to a hundred. This one: ninety-two. And the score is completely transparent — you can see exactly where the points come from: heat intensity, how long the heat lasts, how many public places like bus stops and schools are exposed, and how little greenery there is."

*Point at the breakdown bars as you mention each factor.*

> "And it doesn't stop at a score. It recommends a specific action — here, tree planting plus bus-stop shade — because vegetation is only nine percent and six bus stops sit in the worst heat. Every recommendation explains itself."

**[SCREEN: budget input in the results panel]**

> "Now the part cities actually need. Say the budget is two million dollars."

*Type 2,000,000 and click Optimize. Funded zones turn green.*

**[SCREEN: map + funded/unfunded zones, summary bar visible]**

> "HeatCopilot allocates the budget for maximum impact — these zones get funded, in green, and these have to wait for the next round. Every dollar is defensible."

*Click "Generate Action Plan" on the top zone. While it loads:*

**[SCREEN: zone card with action plan generating / appearing]**

> "Finally, one click generates an action plan — an AI-written memo with the score, the reasoning, the expected benefit, the cost, and next steps. Every number comes from the real analysis — the AI writes the story, but it's not allowed to invent figures."

*Scroll the memo slowly as it appears. Stop at the recommended next steps.*

## Act 3 — Impact & Close (2:20 – 3:00)

**[SCREEN: closing slide — "From knowing where heat exists → to knowing where to act first"]**

> "That's HeatCopilot. It turns FortyGuard's temperature intelligence into a decision: where to act first, why, what to do, and what it costs. It works for any city in the United States, the methodology is transparent enough to defend in a city council meeting, and it scales from a single neighborhood to an entire metro area."

> "We help cities move from knowing where heat exists — to knowing where to act first. Thank you."

---

## Recording tips

- **If something breaks mid-recording:** don't stop — switch to the backup screenshots and keep narrating; edit the cut later.
- **The two money shots:** (1) the moment the heat overlay + markers appear after Find Hotspots; (2) the budget optimization turning zones green. Give both a beat of silence to land.
- **Never say** "this will reduce temperature by X degrees" — we recommend actions; we don't claim outcomes we can't prove.
- Keep the mouse movements slow and deliberate; pause half a second after each click.
